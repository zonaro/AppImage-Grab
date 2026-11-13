"""Shelly ALPM public CLI adapter. Shelly owns AppImage installation and metadata.

Reference: https://www.seafoam-labs.org/shelly-alpm/docs/cli-reference/
No AppImage magic/ELF checks, filesystem moves or edits to Shelly's database.
"""
import json
from pathlib import Path
import os
import shutil
import subprocess

from .gearlever import IntegrationResult


class ShellyError(RuntimeError):
    pass


class Shelly:
    def __init__(self, runner=subprocess.run):
        self.runner = runner
        # Optional testing override is a single executable, never a shell command.
        self.executable = os.environ.get("AIG_SHELLY_COMMAND") or shutil.which("shelly")
        if not self.executable:
            raise ShellyError("Shelly não encontrado. Instale o pacote shelly (CLI incluída).")

    def run(self, *args, timeout=180):
        try:
            reply = self.runner([self.executable, *args], capture_output=True,
                                text=True, check=False, timeout=timeout,
                                stdin=subprocess.DEVNULL)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise ShellyError(f"Falha ao executar Shelly: {exc}") from exc
        if reply.returncode:
            detail = (reply.stderr or reply.stdout or "Erro sem detalhes").strip()[:600]
            raise ShellyError(f"Shelly retornou {reply.returncode}: {detail}")
        return reply.stdout or ""

    def _json_list(self, *args, timeout=120):
        try:
            result = json.loads(self.run(*args, "--json", timeout=timeout))
            if not isinstance(result, list):
                raise ValueError("JSON não é uma lista")
            return [item for item in result if isinstance(item, dict)]
        except (ValueError, TypeError) as exc:
            raise ShellyError("A CLI Shelly instalada não retornou uma lista AppImage JSON válida.") from exc

    def installed(self):
        return self._json_list("list", "appimage")

    def available_updates(self):
        return self._json_list("list-updates", "appimage", timeout=180)

    def integrate(self, downloaded: Path):
        # Do not validate AppImage bytes or infer/update a source. Shelly is the
        # sole authority on format, installation path and update information.
        self.run("install", "appimage", str(downloaded), "--no-confirm", timeout=360)
        return IntegrationResult(None, None, None, "integrated_by_shelly")


class ShellyManager:
    """Adapt Shelly's public JSON to the existing browser manager contract."""

    def __init__(self, shelly=None):
        self.shelly = shelly if shelly is not None else Shelly()

    @staticmethod
    def _normalized(item):
        name, path = item.get("Name"), item.get("Path")
        if not isinstance(name, str) or not name or not isinstance(path, str) or not path.startswith("/"):
            return None
        source_kind = item.get("UpdateType")
        update_url = item.get("UpdateURl")
        repo_owner, repo_name = item.get("RepoOwner"), item.get("RepoName")
        source = isinstance(source_kind, int) and source_kind != 0
        if isinstance(update_url, str) and update_url:
            source = True
        if isinstance(repo_owner, str) and repo_owner and isinstance(repo_name, str) and repo_name:
            source = True
        return {
            "name": name, "path": path,
            "current_version": str(item.get("Version") or ""),
            "available_version": None,
            "manager": "Shelly" if source else None,
            "embedded_source": False,
            "running": None,
            "source_status": "external",
            "source_options": {},
            "desktop_id": None,
        }

    def list_installed(self):
        return [clean for item in self.shelly.installed()
                if (clean := self._normalized(item)) is not None]

    def updates(self):
        installed = self.list_installed()
        names = {}
        for app in installed:
            names.setdefault(app["name"].casefold(), []).append(app)
        updates = []
        for row in self.shelly.available_updates():
            name = row.get("Name")
            if not isinstance(name, str) or row.get("IsUpdateAvailable") is not True:
                continue
            # Shelly reports update *names*, not paths. Do not associate an
            # ambiguous name with an arbitrary file or allow per-app mutation.
            candidates = names.get(name.casefold(), [])
            if len(candidates) != 1:
                continue
            updates.append({
                **candidates[0], "available_version": str(row.get("Version") or ""),
            })
        return updates

    def _installed_entry(self, path):
        if not isinstance(path, str) or not path.startswith("/") or "\x00" in path or len(path) > 4096:
            raise ValueError("Caminho inválido")
        apps = self.list_installed()
        matches = [app for app in apps if app["path"] == path]
        if len(matches) != 1:
            raise ValueError("AppImage não está registrada no Shelly")
        # Shelly's removal CLI accepts names, not exact paths. Fail closed
        # when several entries would match the same case-insensitive name.
        if sum(a["name"].casefold() == matches[0]["name"].casefold() for a in apps) != 1:
            raise ValueError("Nome duplicado no Shelly: remoção ambígua")
        return matches[0]

    def update(self, path):
        raise ValueError("Shelly atualiza todos os AppImages juntos. Use 'Atualizar todos no Shelly'.")

    def update_all(self):
        if not self.updates():
            raise ValueError("Shelly não confirmou nenhuma atualização de AppImage disponível")
        self.shelly.run("upgrade", "appimage", "--no-confirm", timeout=3600)
        return {"status": "updated_all"}

    def remove(self, path):
        app = self._installed_entry(path)
        self.shelly.run("remove", "appimage", app["name"], "--no-confirm", timeout=180)
        return {"path": path, "status": "removed"}

    def set_source(self, path, manager, options):
        raise ValueError("Configure fontes de atualização pelo Shelly; este editor é exclusivo do Gear Lever.")

    def unset_source(self, path):
        raise ValueError("Configure fontes de atualização pelo Shelly; este editor é exclusivo do Gear Lever.")
