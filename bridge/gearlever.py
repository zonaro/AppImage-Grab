"""Use Gear Lever's public CLI; never edit private configuration files."""
from dataclasses import dataclass
import json
from pathlib import Path
import os
import re
import shutil
import subprocess


class GearLeverError(RuntimeError):
    pass


@dataclass(frozen=True)
class IntegrationResult:
    installed_path: str | None
    manager: str | None
    origin: str | None
    status: str


class GearLever:
    def __init__(self, runner=subprocess.run):
        self.runner = runner
        override = os.environ.get("APPIMAGE_GRAB_GEARLEVER_COMMAND")
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

    def integrate(self, downloaded: Path):
        """Delegate integration entirely to the supported Gear Lever CLI.

        Only Gear Lever decides whether the file is a valid AppImage, where it
        belongs, whether it is already installed and how updates are managed.
        A zero CLI exit code is authoritative; no content/size/hash checks or
        --list-installed comparison are performed by Grab.
        """
        output = self.run("--integrate", str(downloaded), "-y")
        if "This AppImage is already integrated" in output:
            return IntegrationResult(None, None, None, "already_processed")

        # Capture the path for display only. The CLI has already reported
        # success; do not revalidate the path or fail if its format changes.
        match = re.search(r"^(.+?) was integrated successfully\s*$", output, re.M)
        installed = match.group(1).strip() if match else None
        return IntegrationResult(installed, None, None, "integrated_by_gearlever")
