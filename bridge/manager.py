"""Safe, explicit management operations through Gear Lever's public CLI.

Extension pages can only manage paths returned by Gear Lever itself. No
arbitrary file deletion, shell execution or bypass of its update manager.
"""
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

from .gearlever import GearLever, GearLeverError
from .source_config import GearLeverSourceReader

NAME = re.compile(r"^[A-Za-z0-9_.-]+$")
PROJECT = re.compile(r"^[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)+$")


class AppManager:
    def __init__(self, gear=None):
        self.gear = gear if gear is not None else GearLever()

    def list_installed(self):
        # The public CLI exposes manager names; read-only Gear Lever INI provides
        # the already-saved options. Never write to the configuration file.
        reader = GearLeverSourceReader(getattr(self.gear, "command", []))
        return [{**self._sanitize(app), **reader.for_app(app)}
                for app in self.gear.installed()
                if isinstance(app.get("path"), str) and isinstance(app.get("name"), str)]

    @staticmethod
    def _sanitize(app):
        keys = ("name", "path", "desktop_id", "current_version", "available_version",
                "download_size", "manager", "embedded_source", "running")
        return {key: app.get(key) for key in keys}

    def updates(self):
        try:
            data = json.loads(self.gear.run("--list-updates", "--json", timeout=120))
            if data.get("schema_version") != 1 or not isinstance(data.get("updates"), list):
                raise ValueError("schema")
            return [self._sanitize(x) for x in data["updates"]
                    if isinstance(x, dict) and isinstance(x.get("path"), str)]
        except (TypeError, KeyError, ValueError) as exc:
            raise GearLeverError("A CLI instalada não oferece --list-updates --json (schema 1).") from exc

    def _installed_path(self, path: str, *, allow_running: bool = True):
        if not isinstance(path, str) or "\x00" in path or len(path) > 4096:
            raise ValueError("Caminho inválido")
        # Do not accept user-controlled paths that merely *resemble* installed apps.
        match = next((x for x in self.gear.installed() if x.get("path") == path), None)
        if match is None or not Path(path).is_file():
            raise ValueError("AppImage não está integrada no Gear Lever")
        if not allow_running and match.get("running") is True:
            raise ValueError("Feche o aplicativo antes de atualizar ou remover")
        return path, match

    def update(self, path: str):
        checked, _ = self._installed_path(path, allow_running=False)
        # A configured update manager is NOT proof an update exists.
        # The same public Gear Lever command powering the update list is
        # authoritative and must be rechecked immediately before changing files.
        if checked not in {item["path"] for item in self.updates()}:
            raise ValueError("O Gear Lever não confirma atualização disponível para este AppImage")
        self.gear.run("--update", checked, "--yes", timeout=3600)
        return {"path": checked, "status": "updated"}

    def remove(self, path: str):
        checked, _ = self._installed_path(path, allow_running=False)
        # Default Gear Lever removal moves the file to Trash; never --delete.
        self.gear.run("--remove", checked, "--yes", timeout=180)
        return {"path": checked, "status": "removed"}

    @staticmethod
    def _valid_repository(value):
        return isinstance(value, str) and len(value) <= 255 and bool(PROJECT.fullmatch(value)) and all(
            part not in (".", "..") for part in value.split("/")
        )

    @staticmethod
    def _valid_pattern(value):
        return (isinstance(value, str) and 0 < len(value) <= 255 and
                value.lower().endswith(".appimage") and
                "/" not in value and "\\" not in value and "\x00" not in value and
                not any(ord(c) < 32 for c in value) and
                not any(c in value.replace("[0-9]", "") for c in "[]?") and
                value.count("*") <= 1)

    @classmethod
    def _config_arguments(cls, manager: str, options: dict):
        if not isinstance(options, dict):
            raise ValueError("Configuração inválida")
        if manager in ("GithubUpdater", "CodebergUpdater"):
            if set(options) != {"repo", "repo_filename", "allow_prereleases"}:
                raise ValueError("Chaves de configuração inválidas")
            if not cls._valid_repository(options["repo"]) or options["repo"].count("/") != 1:
                raise ValueError("Use o formato usuário/repositório")
            if not cls._valid_pattern(options["repo_filename"]):
                raise ValueError("Padrão de nome de arquivo inválido")
            if options["allow_prereleases"] not in ("true", "false"):
                raise ValueError("Pré-lançamentos devem ser true/false")
        elif manager == "GitlabUpdater":
            if set(options) != {"repo_url", "repo_filename"}:
                raise ValueError("Chaves de configuração inválidas")
            url = options["repo_url"]
            if not isinstance(url, str) or len(url) > 300:
                raise ValueError("URL inválida")
            parsed = urlsplit(url)
            project = parsed.path.strip("/")
            if (parsed.scheme != "https" or parsed.hostname != "gitlab.com" or
                    parsed.port not in (None, 443) or parsed.query or parsed.fragment or
                    parsed.username or parsed.password or not cls._valid_repository(project)):
                raise ValueError("Informe uma URL de projeto válida do GitLab")
            if not cls._valid_pattern(options["repo_filename"]):
                raise ValueError("Padrão de nome de arquivo inválido")
        elif manager == "StaticFileUpdater":
            if set(options) != {"url"}:
                raise ValueError("Chaves de configuração inválidas")
            url = options["url"]
            if not isinstance(url, str) or len(url) > 2000:
                raise ValueError("URL inválida")
            parsed = urlsplit(url)
            if (parsed.scheme != "https" or not parsed.hostname or
                    parsed.username or parsed.password or parsed.fragment or
                    parsed.hostname in ("localhost", "127.0.0.1", "::1")):
                raise ValueError("Use uma URL HTTPS pública")
        else:
            raise ValueError("Gerenciador não suportado pela interface")
        return [f"{key}={value}" for key, value in options.items()]

    def set_source(self, path: str, manager: str, options: dict):
        checked, app = self._installed_path(path)
        if app.get("embedded_source"):
            raise ValueError("Fonte embutida no AppImage: preserve-a no Gear Lever")
        if app.get("manager") and GearLeverSourceReader(
                getattr(self.gear, "command", [])).for_app(app)["source_status"] != "loaded":
            raise ValueError("A configuração existente não foi recuperada com segurança; alteração bloqueada")
        args = self._config_arguments(manager, options)
        self.gear.run("--set-update-source", checked, "--manager", manager, *args, timeout=90)
        return {"path": checked, "status": "source_saved", "manager": manager}

    def unset_source(self, path: str):
        checked, app = self._installed_path(path)
        if app.get("embedded_source"):
            raise ValueError("Não é possível remover uma fonte embutida")
        if not app.get("manager"):
            return {"path": checked, "status": "source_not_set"}
        if GearLeverSourceReader(
                getattr(self.gear, "command", [])).for_app(app)["source_status"] != "loaded":
            raise ValueError("A configuração existente não foi recuperada com segurança; remoção bloqueada")
        # Gear Lever requires a manager even for --unset.
        self.gear.run("--set-update-source", checked, "--manager", "GithubUpdater", "--unset", timeout=60)
        return {"path": checked, "status": "source_unset"}
