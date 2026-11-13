"""One-shot Native Messaging bridge: length-prefixed JSON on stdin/stdout."""
import fcntl
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import struct
import sys

from .gearlever import GearLever, GearLeverError
from .manager import AppManager
from .shelly import Shelly, ShellyManager, ShellyError
from .link_resolver import resolve_link

def installed_commit() -> str | None:
    """Read the commit recorded by the installer, never from an untrusted request."""
    marker = Path(__file__).resolve().parent.parent / "version.json"
    try:
        value = json.loads(marker.read_text(encoding="utf-8")).get("commit")
        if (isinstance(value, str) and len(value) == 40 and
                all(c in "0123456789abcdef" for c in value.lower())):
            return value.lower()
    except (OSError, ValueError, TypeError):
        pass
    return None


MAX_BYTES = 1024 * 1024
STATE_DIR = Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local/state"))) / "appimage-grab"


def _read_exact(stream, length):
    buffer = bytearray()
    while len(buffer) < length:
        block = stream.read(length - len(buffer))
        if not block:
            raise EOFError("Mensagem truncada")
        buffer.extend(block)
    return bytes(buffer)


def read_message(stream):
    header = stream.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise ValueError("Cabeçalho incompleto")
    length, = struct.unpack("@I", header)
    if not 0 < length <= MAX_BYTES:
        raise ValueError("Tamanho inválido")
    data = json.loads(_read_exact(stream, length))
    if not isinstance(data, dict):
        raise ValueError("Mensagem não é um objeto")
    return data


def send_message(stream, data):
    output = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
    if len(output) > MAX_BYTES:
        raise ValueError("Resposta muito grande")
    stream.write(struct.pack("@I", len(output)))
    stream.write(output)
    stream.flush()


def validate_file(value):
    if not isinstance(value, str) or not value or "\x00" in value:
        raise ValueError("Caminho de arquivo inválido")
    file = Path(value)
    if not file.is_absolute() or file.suffix.lower() != ".appimage":
        raise ValueError("O download não é uma AppImage absoluta")
    metadata = file.lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid():
        raise ValueError("AppImage deve ser arquivo regular pertencente ao usuário (sem symlinks)")
    # Only enforce the Native Messaging file/path boundary. Gear Lever itself
    # owns every format, MIME, ELF, architecture and installation decision.
    return file


def _integrate(request, adapter_factory, backend="gearlever"):
    # The browser decides whether a completed download has an .AppImage name.
    # This native bridge only checks that the local path is safe to hand to the
    # Gear Lever CLI; it never inspects or classifies the AppImage's bytes.
    file = validate_file(request.get("filename"))
    origin = request.get("url", "")
    if origin is None:
        origin = ""
    if not isinstance(origin, str) or len(origin) > 8192:
        raise ValueError("URL inválida")

    STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    # Fingerprint prevents processing one completed download more than once.
    # File metadata is used only for idempotence, not format validation.
    identity = json.dumps([backend, str(file), file.stat().st_size, file.stat().st_mtime_ns, origin])
    key = hashlib.sha256(identity.encode()).hexdigest()
    with (STATE_DIR / "integrations.lock").open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        receipts = STATE_DIR / "integrations.json"
        try:
            previous = json.loads(receipts.read_text()) if receipts.exists() else {}
            if not isinstance(previous, dict):
                previous = {}
        except (ValueError, OSError):
            previous = {}
        if key in previous:
            return {"ok": True, "status": "already_processed", **previous[key]}

        # The selected AppImage manager is the sole authority on format support,
        # destination, existing installations and built-in update sources.
        # Never register/overwrite an update source automatically.
        result = adapter_factory().integrate(file)
        saved = {
            "backend": backend,
            "installedPath": result.installed_path,
            "updateManager": result.manager,
            "sourceOrigin": result.origin,
            "sourcePattern": None,
            "architecture": None,
        }
        previous[key] = saved
        temp = receipts.with_suffix(".tmp")
        with temp.open("w") as stream:
            json.dump(dict(list(previous.items())[-250:]), stream, indent=2)
        temp.chmod(0o600)
        temp.replace(receipts)
        return {"ok": True, "status": result.status, **saved}


def read_host_log():
    """Read only this bridge's existing log, never arbitrary files or Gear Lever internals."""
    logfile = STATE_DIR / "host.log"
    try:
        metadata = logfile.lstat()
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid():
            return []
        # Read the tail only; no unbounded file reads or private traceback dumps.
        with logfile.open("rb") as stream:
            stream.seek(max(0, metadata.st_size - 65536))
            tail = stream.read(65536).decode("utf-8", errors="replace")
    except OSError:
        return []

    entries = []
    for line in tail.splitlines()[-250:]:
        match = re.match(r"^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,\d+) (WARNING|ERROR) (.*)$", line)
        if not match:
            continue
        timestamp, level, detail = match.groups()
        detail = re.sub(r"https?://\S+", "[URL omitida]", detail, flags=re.I)
        detail = re.sub(r"/(?:home|tmp|run|var|mnt)/[^\s\"'<>]+",
                        lambda item: "…/" + item.group(0).rstrip(".,;:").split("/")[-1],
                        detail)
        detail = re.sub(r"(?i)\b(token|password|authorization|secret|api[_-]?key)\s*[:=]\s*\S+",
                        "[credencial omitida]", detail)
        entries.append({"at": timestamp, "level": level, "detail": detail[:800]})
    return entries[-80:]


def available_backends():
    try:
        GearLever()
        gear_available = True
    except (GearLeverError, OSError, ValueError, subprocess.TimeoutExpired):
        gear_available = False
    return {"gearlever": gear_available, "shelly": bool(shutil.which("shelly"))}


def handle(request, adapter_factory=GearLever):
    backend = request.get("backend", "gearlever")
    if backend not in ("gearlever", "shelly"):
        raise ValueError("Gerenciador inválido")
    action = request.get("action")
    if action == "ping":
        return {"ok": True, "status": "ready", "version": 2}
    if action == "getVersion":
        return {"ok": True, "commit": installed_commit(), "branch": "main"}
    if action == "getHostLog":
        return {"ok": True, "entries": read_host_log()}
    if action == "getBackends":
        return {"ok": True, "available": available_backends()}
    if action == "resolveLink":
        return {"ok": True, "choices": resolve_link(request.get("url"))}
    if action == "integrate":
        return _integrate(request, adapter_factory if backend == "gearlever" else Shelly, backend)
    if action not in ("listInstalled", "listUpdates", "updateApp", "updateAllAppImages",
                      "removeApp", "setSource", "unsetSource"):
        raise ValueError("Ação inválida")
    if action in ("updateApp", "updateAllAppImages", "removeApp", "setSource",
                  "unsetSource") and request.get("confirmed") is not True:
        raise ValueError("Confirmação explícita obrigatória")
    if action == "updateAllAppImages" and backend != "shelly":
        raise ValueError("Atualização coletiva disponível somente no Shelly")
    manager = AppManager(adapter_factory()) if backend == "gearlever" else ShellyManager(Shelly())
    if action == "listInstalled":
        return {"ok": True, "apps": manager.list_installed()}
    if action == "listUpdates":
        return {"ok": True, "apps": manager.updates()}
    if action == "updateApp":
        return {"ok": True, **manager.update(request.get("path"))}
    if action == "updateAllAppImages":
        if backend != "shelly":
            raise ValueError("Atualização coletiva disponível somente no Shelly")
        return {"ok": True, **manager.update_all()}
    if action == "removeApp":
        return {"ok": True, **manager.remove(request.get("path"))}
    if action == "setSource":
        return {"ok": True, **manager.set_source(request.get("path"), request.get("manager"),
                                                request.get("options"))}
    return {"ok": True, **manager.unset_source(request.get("path"))}


def main():
    STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    logging.basicConfig(filename=STATE_DIR / "host.log", level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    try:
        request = read_message(sys.stdin.buffer)
        if request is None:
            return 0
        try:
            response = handle(request)
        except (OSError, ValueError, GearLeverError, ShellyError) as exc:
            logging.warning("Request failed: %s", exc)
            response = {"ok": False, "error": str(exc)}
        except Exception:
            logging.exception("Unhandled host error")
            response = {"ok": False, "error": "Erro interno; consulte host.log"}
        send_message(sys.stdout.buffer, response)
        return 0
    except Exception:
        logging.exception("Native Messaging protocol failure")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
