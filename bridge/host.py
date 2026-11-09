"""One-shot Native Messaging host: 4-byte native-endian length + JSON."""
import fcntl
import hashlib
import json
import logging
import os
from pathlib import Path
import stat
import struct
import sys

from .gearlever import GearLever, GearLeverError
from .sources import detect_source

MAX_BYTES = 1024 * 1024
STATE_DIR = Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local/state"))) / "gear-lever-grab"


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
    if metadata.st_size < 11:
        raise ValueError("Arquivo incompleto")
    with file.open("rb") as stream:
        header = stream.read(11)
    if header[:4] != b"\x7fELF" or header[8:11] not in (b"AI\x01", b"AI\x02"):
        raise ValueError("Arquivo não possui assinatura de AppImage Tipo 1 ou 2")
    return file


def handle(request, adapter_factory=GearLever):
    if request.get("action") == "ping":
        return {"ok": True, "status": "ready"}
    if request.get("action") != "integrate":
        raise ValueError("Ação inválida")
    file = validate_file(request.get("filename"))
    fields = {k: request.get(k, "") for k in ("url", "finalUrl", "referrer")}
    if any(not isinstance(v, str) or len(v) > 8192 for v in fields.values()):
        raise ValueError("URL inválida")
    if not fields["url"].startswith("https://"):
        raise ValueError("Somente downloads HTTPS são processados automaticamente")
    STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    identity = json.dumps([str(file), file.stat().st_size, file.stat().st_mtime_ns, fields["url"]])
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

        source = detect_source(fields["url"], final_url=fields["finalUrl"],
                               referrer=fields["referrer"])
        result = adapter_factory().integrate(file, source)
        saved = {"installedPath": result.installed_path,
                 "updateManager": result.manager, "sourceOrigin": result.origin}
        previous[key] = saved
        temp = receipts.with_suffix(".tmp")
        with temp.open("w") as stream:
            json.dump(dict(list(previous.items())[-250:]), stream, indent=2)
        temp.chmod(0o600)
        temp.replace(receipts)
        return {"ok": True, "status": result.status, **saved}


def main():
    STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    logging.basicConfig(filename=STATE_DIR / "host.log",
                        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        request = read_message(sys.stdin.buffer)
        if request is None:
            return 0
        try:
            response = handle(request)
        except (OSError, ValueError, GearLeverError) as exc:
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
