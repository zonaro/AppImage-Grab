"""Use Gear Lever's public CLI; never edit private configuration files."""
from dataclasses import dataclass
import filecmp
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

    @staticmethod
    def _same_appimage(downloaded: Path, candidate: str, original_size: int,
                       *, cli_confirmed: bool = False) -> bool:
        """Require matching contents, or an exact CLI success path if source was moved.

        A CLI response may legitimately refer to a newly renamed AppImage that is
        not yet visible in --list-installed. Only trust an explicit CLI path when
        its regular file exists and its size matches the original download.
        """
        path = Path(candidate)
        try:
            if not path.is_absolute() or path.is_symlink() or not path.is_file():
                return False
            if path.stat().st_size != original_size:
                return False
            if downloaded.is_file():
                return filecmp.cmp(downloaded, path, shallow=False)
            # Gear Lever can delete Downloads after successfully copying the file.
            return cli_confirmed
        except (OSError, ValueError):
            return False

    def integrate(self, downloaded: Path, source: UpdateSource | None):
        original_size = downloaded.stat().st_size
        before = {x.get("path") for x in self.installed() if isinstance(x.get("path"), str)}
        # Gear Lever decides the destination filename and can delete the input.
        # The CLI prints the *actual destination path* on successful integration.
        output = self.run("--integrate", str(downloaded), "-y")
        after = self.installed()
        by_path = {x["path"]: x for x in after if isinstance(x.get("path"), str)}
        new_paths = set(by_path) - before

        # A zero exit code also means "already integrated" in upstream Gear Lever.
        # Never claim a fresh installation or change an existing update source.
        if "This AppImage is already integrated" in output:
            previous = [p for p in by_path if self._same_appimage(downloaded, p, original_size)]
            if len(previous) != 1:
                raise GearLeverError("AppImage já integrada, mas não foi possível identificar a entrada existente.")
            entry = by_path[previous[0]]
            return IntegrationResult(previous[0], entry.get("manager"), None, "already_processed")

        match = re.search(r"^(.+?) was integrated successfully\s*$", output, re.M)
        from_output = match.group(1).strip() if match else None
        destination = None

        if from_output and self._same_appimage(downloaded, from_output, original_size,
                                                cli_confirmed=True):
            if from_output not in by_path:
                # The CLI confirmed success and the copied file was verified,
                # but the JSON registry has not picked up the desktop entry.
                # Do not configure a source for an entry Gear Lever cannot list.
                return IntegrationResult(from_output, None, None, "integrated_unlisted")
            destination = from_output

        if destination is None:
            # stdout may vary across Gear Lever releases. Only fall back to
            # *new* paths whose actual file content matches the downloaded file.
            candidates = [p for p in new_paths
                          if self._same_appimage(downloaded, p, original_size)]
            if len(candidates) == 1:
                destination = candidates[0]
            else:
                raise GearLeverError(
                    "A integração não pôde ser verificada na lista do Gear Lever. "
                    "Confira a instalação antes de tentar novamente.")

        entry = by_path[destination]
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
