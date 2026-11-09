"""Use Gear Lever's public CLI; never edit private configuration files."""
from dataclasses import dataclass
import json
from pathlib import Path
import os
import re
import shutil
import subprocess
from .sources import UpdateSource


class GearLeverError(RuntimeError):
    pass


@dataclass(frozen=True)
class IntegrationResult:
    installed_path: str
    manager: str | None
    origin: str | None
    status: str


class GearLever:
    def __init__(self, runner=subprocess.run):
        self.runner = runner
        override = os.environ.get("GEAR_LEVER_GRAB_COMMAND")
        if override:
            self.command = [override]
        elif shutil.which("flatpak") and subprocess.run(
            ["flatpak", "info", "it.mijorus.gearlever"], capture_output=True, timeout=10
        ).returncode == 0:
            self.command = ["flatpak", "run", "it.mijorus.gearlever"]
        elif shutil.which("gearlever"):
            self.command = ["gearlever"]
        else:
            raise GearLeverError("Gear Lever não encontrado. Instale o Flatpak it.mijorus.gearlever.")

    def run(self, *args, timeout=180):
        try:
            result = self.runner([*self.command, *args], capture_output=True,
                                 text=True, check=False, timeout=timeout)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise GearLeverError(f"Falha ao executar Gear Lever: {exc}") from exc
        if result.returncode:
            error = (result.stderr or result.stdout or "Erro sem detalhes").strip()[:600]
            raise GearLeverError(f"Gear Lever retornou {result.returncode}: {error}")
        return result.stdout or ""

    def installed(self):
        try:
            response = json.loads(self.run("--list-installed", "--json", timeout=60))
            if response["schema_version"] != 1 or not isinstance(response["installed"], list):
                raise ValueError("schema")
            return [x for x in response["installed"] if isinstance(x, dict)]
        except (ValueError, KeyError, TypeError) as exc:
            raise GearLeverError("A versão instalada do Gear Lever não oferece --list-installed --json (schema 1).") from exc

    def integrate(self, downloaded: Path, source: UpdateSource | None):
        before = {x.get("path") for x in self.installed()}
        # Gear Lever copies and optionally removes the original, according to
        # its own appimages-default-folder / move-appimage-on-integration settings.
        output = self.run("--integrate", str(downloaded), "-y")
        after = self.installed()
        by_path = {x["path"]: x for x in after if isinstance(x.get("path"), str)}
        new_paths = set(by_path) - before

        match = re.search(r"^(.+?) was integrated successfully$", output, re.M)
        from_output = match.group(1).strip() if match else None
        if from_output in by_path:
            destination = from_output
        elif len(new_paths) == 1:
            destination = new_paths.pop()
        elif str(downloaded) in by_path:
            destination = str(downloaded)
        else:
            raise GearLeverError("A integração ocorreu, mas não foi possível identificar sua entrada com segurança.")

        entry = by_path[destination]
        if not Path(destination).is_file():
            raise GearLeverError("A entrada criada pelo Gear Lever não possui arquivo válido.")

        if entry.get("embedded_source"):
            return IntegrationResult(destination, entry.get("manager"), None, "embedded_source_preserved")
        if entry.get("manager"):
            return IntegrationResult(destination, entry.get("manager"), None, "existing_source_preserved")
        if source is None:
            return IntegrationResult(destination, None, None, "integrated_without_source")

        try:
            self.run("--set-update-source", destination, *source.args(), timeout=60)
        except GearLeverError as exc:
            raise GearLeverError(f"Integrado em {destination}, mas não foi possível registrar atualizações: {exc}") from exc
        return IntegrationResult(destination, source.manager, source.origin, "integrated_with_source")
