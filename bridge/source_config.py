"""Read Gear Lever's existing update-source settings without modifying them.

The public list-installed JSON reports the update manager but not its options.
Gear Lever stores them in gearlever.conf under a section calculated using
MD5(absolute AppImage path). Read-only compatibility adapter: never guess.
"""
import configparser
import hashlib
import os
from pathlib import Path
import stat

_ALLOWED_OPTIONS = frozenset((
    "repo", "repo_filename", "repo_url", "allow_prereleases",
    "url", "filename",
))
_MAX_CONFIG_BYTES = 2 * 1024 * 1024


def config_path(command: list[str] | tuple[str, ...]) -> Path | None:
    """Use the config directory of the SAME Gear Lever variant used by the CLI."""
    if not command:
        return None
    if (len(command) >= 3 and Path(command[0]).name == "flatpak"
            and list(command[1:3]) == ["run", "it.mijorus.gearlever"]):
        # GLib.get_user_config_dir() inside the application Flatpak.
        return Path.home() / ".var/app/it.mijorus.gearlever/config/gearlever.conf"
    if Path(command[0]).name == "gearlever":
        config_home = os.environ.get("XDG_CONFIG_HOME")
        folder = Path(config_home) if config_home and Path(config_home).is_absolute() else Path.home() / ".config"
        return folder / "gearlever.conf"
    # Cannot infer config home for an arbitrary test/custom command.
    return None


def _read_config(path: Path | None) -> configparser.ConfigParser | None:
    if path is None:
        return None
    try:
        details = path.lstat()
        if (not stat.S_ISREG(details.st_mode) or details.st_uid != os.getuid()
                or details.st_size > _MAX_CONFIG_BYTES):
            return None
        parser = configparser.ConfigParser(interpolation=None)
        with path.open("r", encoding="utf-8") as stream:
            parser.read_file(stream)
        return parser
    except (OSError, UnicodeError, configparser.Error):
        return None


class GearLeverSourceReader:
    """Loads configuration once per request and only exposes selected keys."""

    def __init__(self, command):
        self.parser = _read_config(config_path(command))

    def for_app(self, app: dict) -> dict:
        manager = app.get("manager")
        if app.get("embedded_source"):
            return {"source_status": "embedded", "source_options": None}
        if not isinstance(manager, str) or not manager:
            return {"source_status": "none", "source_options": None}
        if self.parser is None:
            return {"source_status": "unavailable", "source_options": None}
        path = app.get("path")
        if not isinstance(path, str) or not path.startswith("/"):
            return {"source_status": "unavailable", "source_options": None}
        digest = hashlib.md5(path.encode("utf-8")).hexdigest()
        section = f"app.{digest}.update_manager"
        if not self.parser.has_section(section):
            return {"source_status": "unavailable", "source_options": None}
        values = self.parser[section]
        if values.get("manager") != manager:
            return {"source_status": "mismatch", "source_options": None}
        options = {key: value for key, value in values.items()
                   if key in _ALLOWED_OPTIONS and isinstance(value, str)}
        return {"source_status": "loaded", "source_options": options}
