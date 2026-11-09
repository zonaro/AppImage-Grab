"""One-shot Native Messaging bridge: length-prefixed JSON on stdin/stdout."""
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
from .manager import AppManager
from .sources import architecture, detect_source, verify_source

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
STATE_DIR = Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local/state"))) / "gear-lever-grab"
ELF_ARCH = {3: "x86", 40: "arm", 62: "x86_64", 183: "arm64", 243: "riscv64"}


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
    if metadata.st_size < 20:
        raise ValueError("Arquivo incompleto")
    with file.open("rb") as stream:
        header = stream.read(20)
    if header[:4] != b"\x7fELF" or header[8:11] not in (b"AI\x01", b"AI\x02"):
        raise ValueError("Arquivo não possui assinatura de AppImage Tipo 1 ou 2")
    return file


def elf_architecture(file: Path):
    with file.open("rb") as stream:
        header = stream.read(20)
    byteorder = {1: "little", 2: "big"}.get(header[5]) if len(header) >= 20 else None
    if not byteorder:
        return None
    return ELF_ARCH.get(int.from_bytes(header[18:20], byteorder))


def _integrate(request, adapter_factory):
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
        elf_arch = elf_architecture(file)
        source = verify_source(source, elf_arch=elf_arch)
        result = adapter_factory().integrate(file, source)
        saved = {
            "installedPath": result.installed_path,
            "updateManager": result.manager,
            "sourceOrigin": result.origin,
            "sourcePattern": source.pattern if result.status == "integrated_with_source" and source else None,
            "architecture": elf_arch or (architecture(source.asset_name) if source else None),
        }
        previous[key] = saved
        temp = receipts.with_suffix(".tmp")
        with temp.open("w") as stream:
            json.dump(dict(list(previous.items())[-250:]), stream, indent=2)
        temp.chmod(0o600)
        temp.replace(receipts)
        return {"ok": True, "status": result.status, **saved}


def handle(request, adapter_factory=GearLever):
    action = request.get("action")
    if action == "ping":
        return {"ok": True, "status": "ready", "version": 2}
    if action == "getVersion":
        return {"ok": True, "commit": installed_commit(), "branch": "main"}
    if action == "integrate":
        return _integrate(request, adapter_factory)
    if action not in ("listInstalled", "listUpdates", "updateApp", "removeApp",
                      "setSource", "unsetSource"):
        raise ValueError("Ação inválida")
    if action in ("updateApp", "removeApp", "setSource", "unsetSource") and request.get("confirmed") is not True:
        raise ValueError("Confirmação explícita obrigatória")
    manager = AppManager(adapter_factory())
    if action == "listInstalled":
        return {"ok": True, "apps": manager.list_installed()}
    if action == "listUpdates":
        return {"ok": True, "apps": manager.updates()}
    if action == "updateApp":
        return {"ok": True, **manager.update(request.get("path"))}
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
