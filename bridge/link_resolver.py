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
    choices = _github_release_assets(value.strip())
    if choices:
        return choices
    raise ValueError("Link incompatível: use uma AppImage direta de GitHub/GitLab/Codeberg ou um repositório GitHub")
