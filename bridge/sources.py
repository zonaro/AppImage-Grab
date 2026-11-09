"""Resolve AppImage release assets without confusing versions or CPU architectures.

Only GitHub, GitLab and Codeberg direct release-asset URLs are trusted.
For wildcard update patterns, inspect the release asset list and refuse
patterns that would match more than one AppImage. Never guess from file names
alone when no release origin was observed.
"""
from dataclasses import dataclass
from fnmatch import fnmatchcase
import json
from pathlib import PurePosixPath
import re
import urllib.error
import urllib.request
from urllib.parse import quote, unquote, urlsplit

# Do not include an architecture segment in the version wildcard.
VERSION = re.compile(r"(?<![A-Za-z0-9])v?\d+(?:\.\d+){1,3}(?:[-.]?(?:alpha|beta|rc|pre)\d*)?", re.I)
GITHUB = re.compile(r"^/([^/]+)/([^/]+)/releases/(?:download/([^/]+)/([^/]+)|latest/download/([^/]+))/?$", re.I)
CODEBERG = re.compile(r"^/([^/]+)/([^/]+)/releases/download/([^/]+)/([^/]+)$", re.I)
PROJECT_PART = re.compile(r"^[A-Za-z0-9_.-]+$")
ARCH_TOKENS = re.compile(
    r"(?i)(?<![a-z0-9])(?:x86[_-]?64|amd64|x64|aarch64|arm64|armv8|"
    r"i[3-6]86|x86|ia32|armv[5-7](?:l)?|armhf|armel|riscv64)(?![a-z0-9])"
)
ARCH_NAMES = {
    "x86_64": {"x86_64", "x86-64", "amd64", "x64"},
    "x86": {"x86", "i386", "i486", "i586", "i686", "ia32"},
    "arm64": {"aarch64", "arm64", "armv8"},
    "arm": {"armv5", "armv5l", "armv6", "armv6l", "armv7", "armv7l", "armhf", "armel"},
    "riscv64": {"riscv64"},
}


def architecture(filename: str) -> str | None:
    """Architecture from distinct tokens in release asset names; never from 'x86' inside x86_64."""
    names = {m.group().lower().replace("-", "_") for m in ARCH_TOKENS.finditer(filename)}
    for family, aliases in ARCH_NAMES.items():
        if any(name in {a.replace("-", "_") for a in aliases} for name in names):
            return family
    return None


def filename_pattern(filename: str, tag: str | None = None) -> str:
    """Glob ONLY the version; preserve architecture, edition, OS and extension.

    A semantic version is selected by the release tag when possible. If a
    filename contains multiple plausible numbers but the tag cannot identify
    one unambiguously, keep the exact filename rather than guessing.
    """
    if not filename.lower().endswith(".appimage"):
        return filename
    base = filename[:-9]  # remove .AppImage
    candidates = list(VERSION.finditer(base))
    if not candidates:
        return filename

    chosen = None
    tag_versions = list(VERSION.finditer(unquote(tag or "")))
    if tag_versions:
        expected = tag_versions[-1].group().lower().lstrip("v")
        options = [m for m in candidates if m.group().lower().lstrip("v") == expected]
        if len(options) == 1:
            chosen = options[0]
        # e.g. release v1.2, asset "App-1.2.3". Preserve all version parts.
        elif not options:
            compatible = [m for m in candidates
                          if m.group().lower().lstrip("v").startswith(expected + ".")]
            if len(compatible) == 1:
                chosen = compatible[0]
    elif len(candidates) == 1:
        chosen = candidates[0]

    if chosen is None:
        return filename
    # Keep separators outside the wildcard to prevent matching unrelated apps.
    return base[:chosen.start()] + "*" + base[chosen.end():] + filename[-9:]


@dataclass(frozen=True)
class UpdateSource:
    manager: str
    config: dict[str, str]
    origin: str
    asset_name: str = ""
    release_tag: str = ""

    def args(self):
        return ["--manager", self.manager, *(f"{k}={v}" for k, v in self.config.items())]

    @property
    def pattern(self) -> str:
        return self.config.get("repo_filename", "")


def _valid_path(parts) -> bool:
    return all(PROJECT_PART.fullmatch(part) and part not in (".", "..") for part in parts)


def _safe_name(value: str) -> str | None:
    if not isinstance(value, str) or "/" in unquote(value) or "\\" in unquote(value):
        return None
    name = unquote(value)
    if not name.lower().endswith(".appimage") or len(name) > 256:
        return None
    return name


def _source(url: str):
    try:
        parsed = urlsplit(url)
        if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port not in (None, 443):
            return None
        domain = (parsed.hostname or "").lower()
        path = parsed.path
    except ValueError:
        return None

    if domain in ("github.com", "www.github.com"):
        match = GITHUB.fullmatch(path)
        if not match:
            return None
        owner, repo, tag, asset, latest = match.groups()
        if not _valid_path((owner, repo)):
            return None
        filename = _safe_name(asset or latest)
        if not filename:
            return None
        return UpdateSource("GithubUpdater", {
            "repo": f"{owner}/{repo}",
            "repo_filename": filename_pattern(filename, tag),
            "allow_prereleases": "false",
        }, f"https://github.com/{owner}/{repo}", filename, tag or "latest")

    if domain == "codeberg.org":
        match = CODEBERG.fullmatch(path)
        if not match:
            return None
        owner, repo, tag, asset = match.groups()
        if not _valid_path((owner, repo)):
            return None
        filename = _safe_name(asset)
        if not filename:
            return None
        return UpdateSource("CodebergUpdater", {
            "repo": f"{owner}/{repo}",
            "repo_filename": filename_pattern(filename, tag),
            "allow_prereleases": "false",
        }, f"https://codeberg.org/{owner}/{repo}", filename, tag)

    if domain == "gitlab.com" and "/-/releases/" in path:
        project, tail = path.split("/-/releases/", 1)
        project_parts = project.strip("/").split("/")
        segments = tail.split("/")
        if not _valid_path(project_parts) or len(project_parts) < 2 or len(segments) != 3 or segments[1] != "downloads":
            return None
        filename = _safe_name(segments[2])
        if not filename:
            return None
        origin = f"https://gitlab.com/{'/'.join(project_parts)}"
        return UpdateSource("GitlabUpdater", {
            "repo_url": origin,
            "repo_filename": filename_pattern(filename, segments[0]),
        }, origin, filename, segments[0])
    return None


def detect_source(url: str, *, final_url: str = "", referrer: str = ""):
    """A generic repo or releases page is not sufficient proof of a source."""
    for candidate in (url, final_url, referrer):
        if isinstance(candidate, str) and candidate:
            source = _source(candidate)
            if source:
                return source
    return None


def _asset_api_url(source: UpdateSource) -> str | None:
    """Only fixed, well-known API origins; no arbitrary user-provided hosts."""
    if source.manager == "GithubUpdater":
        repo = source.config["repo"]
        suffix = "latest" if source.release_tag == "latest" else "tags/" + quote(source.release_tag, safe="")
        return f"https://api.github.com/repos/{repo}/releases/{suffix}"
    if source.manager == "CodebergUpdater":
        return (f"https://codeberg.org/api/v1/repos/{source.config['repo']}/releases/tags/"
                + quote(source.release_tag, safe=""))
    if source.manager == "GitlabUpdater":
        project = source.config["repo_url"].removeprefix("https://gitlab.com/")
        return ("https://gitlab.com/api/v4/projects/" + quote(project, safe="")
                + "/releases/" + quote(source.release_tag, safe=""))
    return None


def release_assets(source: UpdateSource, opener=urllib.request.urlopen) -> list[str] | None:
    """Fetch one known release's asset names, with strict size/time limits."""
    api = _asset_api_url(source)
    if not api:
        return None
    try:
        request = urllib.request.Request(api, headers={
            "Accept": "application/json",
            "User-Agent": "GearLeverGrab/0.2"
        })
        with opener(request, timeout=8) as response:
            data = response.read(1024 * 1024 + 1)
        if len(data) > 1024 * 1024:
            return None
        payload = json.loads(data)
        if not isinstance(payload, dict):
            return None
        if source.manager == "GitlabUpdater":
            assets = payload.get("assets", {}).get("links", [])
        else:
            assets = payload.get("assets", [])
        if not isinstance(assets, list):
            return None
        return [a["name"] for a in assets if isinstance(a, dict) and isinstance(a.get("name"), str)]
    except (OSError, ValueError, KeyError, TypeError):
        return None


def verify_source(source: UpdateSource | None, *, elf_arch: str | None = None,
                  asset_fetcher=release_assets) -> UpdateSource | None:
    """Fail closed for ambiguous wildcard patterns or inconsistent CPU variants.

    The current release must expose the exact downloaded asset and no other
    asset can match our resulting update filename glob.
    """
    if source is None:
        return None
    file_arch = architecture(source.asset_name)
    if file_arch is not None and elf_arch is not None and file_arch != elf_arch:
        return None
    if "*" not in source.pattern and "?" not in source.pattern:
        # Exact release filename can be used safely without listing release assets.
        return source
    names = asset_fetcher(source)
    if not names or source.asset_name not in names:
        return None
    candidates = [name for name in names if fnmatchcase(name, source.pattern)]
    if candidates != [source.asset_name]:
        return None
    if file_arch:
        for name in candidates:
            if architecture(name) not in (None, file_arch):
                return None
    return source
