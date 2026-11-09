"""Resolve explicit, supported AppImage release URLs for browser-driven downloads.

Never request arbitrary user hosts. Repository pages resolve against the
trusted provider API. Selection is always explicit in the UI before download.
"""
import json
import re
from urllib.parse import urlsplit, quote
from urllib.request import Request, urlopen
from .sources import detect_source, architecture

PART = r"[A-Za-z0-9_.-]+"
GITHUB_REPO = re.compile(rf"^/({PART})/({PART})(?:/releases(?:/(latest|tag/({PART})))?)?/?$")
MAX_ASSETS = 60


def _github_release_assets(url):
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or parsed.hostname != "github.com" or
            parsed.username or parsed.password or parsed.port not in (None, 443) or
            parsed.query or parsed.fragment):
        return None
    match = GITHUB_REPO.fullmatch(parsed.path)
    if not match:
        return None
    owner, repo, _mode, tag = match.groups()
    if owner in (".", "..") or repo in (".", ".."):
        return None
    endpoint = (f"https://api.github.com/repos/{owner}/{repo}/releases/"
                + ("tags/" + quote(tag, safe="") if tag else "latest"))
    req = Request(endpoint, headers={"User-Agent": "GearLeverGrab/0.5",
                                     "Accept": "application/vnd.github+json"})
    try:
        with urlopen(req, timeout=12) as response:
            # Refuse API responses from redirected non-GitHub hosts.
            if urlsplit(response.geturl()).hostname != "api.github.com":
                raise ValueError("Origem da API não confiável")
            blob = response.read(2_000_001)
            if len(blob) > 2_000_000:
                raise ValueError("Release muito grande")
        data = json.loads(blob)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise ValueError("Não foi possível consultar o release do GitHub") from exc
    if not isinstance(data, dict) or not isinstance(data.get("assets"), list):
        raise ValueError("Release não encontrado")
    choices = []
    for asset in data["assets"]:
        if len(choices) >= MAX_ASSETS:
            break
        if not isinstance(asset, dict):
            continue
        name, download = asset.get("name"), asset.get("browser_download_url")
        if not isinstance(name, str) or not name.lower().endswith(".appimage"):
            continue
        if not isinstance(download, str):
            continue
        # The asset URL must encode the exact repo, release and name.
        src = detect_source(download)
        if not src or src.manager != "GithubUpdater" or src.config.get("repo") != f"{owner}/{repo}" or src.asset_name != name:
            continue
        choices.append({"name": name, "url": download,
                        "architecture": architecture(name),
                        "source": src.origin})
    if not choices:
        raise ValueError("O release não contém AppImages compatíveis")
    return choices


def _read_provider_release(endpoint: str, host: str) -> dict:
    request = Request(endpoint, headers={"Accept": "application/json",
                                          "User-Agent": "GearLeverGrab/0.5"})
    try:
        with urlopen(request, timeout=12) as response:
            if urlsplit(response.geturl()).hostname != host:
                raise ValueError("Origem da API não confiável")
            payload = response.read(2_000_001)
            if len(payload) > 2_000_000:
                raise ValueError("Release muito grande")
        release = json.loads(payload)
        if not isinstance(release, dict):
            raise ValueError("Release inválido")
        return release
    except (OSError, ValueError, TypeError) as exc:
        raise ValueError("Não foi possível consultar o release do provedor") from exc


def _gitlab_release_assets(value: str):
    parsed = urlsplit(value)
    if parsed.hostname != "gitlab.com" or parsed.query or parsed.fragment:
        return None
    parts = parsed.path.strip("/").split("/")
    if not parts or len(parts) < 2:
        return None
    tag = None
    if "-" in parts:
        marker = parts.index("-")
        after = parts[marker:]
        if len(after) == 2 and after == ["-", "releases"]:
            tag = None
        elif len(after) == 3 and after[:2] == ["-", "releases"]:
            tag = after[2]
        else:
            return None
        parts = parts[:marker]
    if len(parts) < 2 or not all(re.fullmatch(PART, x) and x not in (".", "..") for x in parts):
        return None
    if tag is not None and (not re.fullmatch(PART, tag) or tag in (".", "..")):
        return None
    project = "/".join(parts)
    endpoint = ("https://gitlab.com/api/v4/projects/" + quote(project, safe="") +
                ("/releases/" + quote(tag, safe="") if tag else "/releases/permalink/latest"))
    release = _read_provider_release(endpoint, "gitlab.com")
    assets = release.get("assets", {})
    links = assets.get("links", []) if isinstance(assets, dict) else []
    choices = []
    for item in links[:MAX_ASSETS] if isinstance(links, list) else []:
        if not isinstance(item, dict):
            continue
        url = item.get("direct_asset_url")
        src = detect_source(url) if isinstance(url, str) else None
        if (src and src.manager == "GitlabUpdater" and src.origin ==
                f"https://gitlab.com/{project}" and src.asset_name.lower().endswith(".appimage")):
            choices.append({"name": src.asset_name, "url": url,
                            "architecture": architecture(src.asset_name),
                            "source": src.origin})
    if not choices:
        raise ValueError("Nenhuma AppImage compatível no release do GitLab")
    return choices


def _codeberg_release_assets(value: str):
    parsed = urlsplit(value)
    if parsed.hostname != "codeberg.org" or parsed.query or parsed.fragment:
        return None
    parts = parsed.path.strip("/").split("/")
    if len(parts) not in (2, 3, 4, 5):
        return None
    owner, repo = parts[:2]
    if not all(re.fullmatch(PART, p) and p not in (".", "..") for p in (owner, repo)):
        return None
    tag = None
    tail = parts[2:]
    if tail == [] or tail == ["releases"]:
        pass
    elif len(tail) == 3 and tail[:2] == ["releases", "tag"]:
        tag = tail[2]
        if not re.fullmatch(PART, tag) or tag in (".", ".."):
            return None
    else:
        return None
    endpoint = (f"https://codeberg.org/api/v1/repos/{owner}/{repo}/releases/"
                + ("tags/" + quote(tag, safe="") if tag else "latest"))
    release = _read_provider_release(endpoint, "codeberg.org")
    release_tag = release.get("tag_name")
    if not isinstance(release_tag, str) or not re.fullmatch(PART, release_tag):
        raise ValueError("Tag do release inválida")
    assets = release.get("assets")
    choices = []
    for item in assets[:MAX_ASSETS] if isinstance(assets, list) else []:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if not isinstance(name, str) or not name.lower().endswith(".appimage"):
            continue
        # Codeberg's attachment URLs do not identify the repository/source;
        # use the canonical public release route instead.
        download = (f"https://codeberg.org/{owner}/{repo}/releases/download/"
                    + quote(release_tag, safe="") + "/" + quote(name, safe=""))
        src = detect_source(download)
        if src and src.manager == "CodebergUpdater" and src.asset_name == name:
            choices.append({"name": name, "url": download,
                            "architecture": architecture(name),
                            "source": src.origin})
    if not choices:
        raise ValueError("Nenhuma AppImage compatível no release do Codeberg")
    return choices


def resolve_link(value):
    if not isinstance(value, str) or not 0 < len(value) <= 2048:
        raise ValueError("Cole um link HTTPS de um release compatível")
    try:
        parsed = urlsplit(value.strip())
    except ValueError as exc:
        raise ValueError("Link inválido") from exc
    if (parsed.scheme != "https" or parsed.username or parsed.password or
            parsed.port not in (None, 443) or parsed.fragment):
        raise ValueError("Use um link HTTPS público")
    source = detect_source(value.strip())
    if source:
        return [{"name": source.asset_name, "url": value.strip(),
                 "architecture": architecture(source.asset_name),
                 "source": source.origin}]
    for resolver in (_github_release_assets, _gitlab_release_assets, _codeberg_release_assets):
        choices = resolver(value.strip())
        if choices:
            return choices
    raise ValueError("Link incompatível: use uma AppImage direta ou uma página de releases do GitHub, GitLab ou Codeberg")
