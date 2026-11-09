"""Resolve reliable Gear Lever update sources from release asset URLs."""
from dataclasses import dataclass
from pathlib import PurePosixPath
import re
from urllib.parse import unquote, urlsplit

VERSION = re.compile(r"(?<!\d)v?\d+\.\d+(?:[.\-_]\d+)*(?:[-._](?:alpha|beta|rc)\d*)?", re.I)
GITHUB = re.compile(r"^/([^/]+)/([^/]+)/releases/(?:download/([^/]+)/([^/]+)|latest/download/([^/]+))/?$", re.I)
CODEBERG = re.compile(r"^/([^/]+)/([^/]+)/releases/download/([^/]+)/([^/]+)$", re.I)


@dataclass(frozen=True)
class UpdateSource:
    manager: str
    config: dict[str, str]
    origin: str

    def args(self):
        return ["--manager", self.manager, *(f"{k}={v}" for k, v in self.config.items())]


def filename_pattern(filename: str, tag: str | None):
    if not tag:
        return filename
    found = VERSION.search(unquote(tag))
    if not found:
        return filename
    token = found.group()
    candidates = [token, token.removeprefix("v")]
    for item in candidates:
        match = re.search(re.escape(item), filename, re.I)
        if match:
            return filename[:match.start()] + "*" + filename[match.end():]
    return filename


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
        filename = PurePosixPath(unquote(asset or latest)).name
        if not filename.lower().endswith(".appimage"):
            return None
        return UpdateSource("GithubUpdater", {
            "repo": f"{owner}/{repo}",
            "repo_filename": filename_pattern(filename, tag),
            "allow_prereleases": "false",
        }, f"https://github.com/{owner}/{repo}")

    if domain == "codeberg.org":
        match = CODEBERG.fullmatch(path)
        if not match:
            return None
        owner, repo, tag, asset = match.groups()
        filename = PurePosixPath(unquote(asset)).name
        if not filename.lower().endswith(".appimage"):
            return None
        return UpdateSource("CodebergUpdater", {
            "repo": f"{owner}/{repo}",
            "repo_filename": filename_pattern(filename, tag),
            "allow_prereleases": "false",
        }, f"https://codeberg.org/{owner}/{repo}")

    if domain == "gitlab.com" and "/-/releases/" in path:
        project, tail = path.split("/-/releases/", 1)
        segments = tail.split("/")
        if len(project.strip("/").split("/")) < 2 or len(segments) < 3 or segments[1] != "downloads":
            return None
        filename = PurePosixPath(unquote("/".join(segments[2:]))).name
        if not filename.lower().endswith(".appimage"):
            return None
        origin = f"https://gitlab.com{project}"
        return UpdateSource("GitlabUpdater", {
            "repo_url": origin,
            "repo_filename": filename_pattern(filename, segments[0]),
        }, origin)

    return None


def detect_source(url: str, *, final_url: str = "", referrer: str = ""):
    """A generic repo or releases page is not evidence of an update source."""
    for candidate in (url, final_url, referrer):
        if isinstance(candidate, str) and candidate:
            source = _source(candidate)
            if source:
                return source
    return None
