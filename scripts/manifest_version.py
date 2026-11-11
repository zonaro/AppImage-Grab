"""Stamp WebExtension versions from the commit's recorded local timestamp.

Chrome/Firefox manifest.version disallows leading zeros, so version_name
preserves the human-facing YY.DDD.HHmm display format.
"""

from datetime import datetime
import json
from pathlib import Path
import sys


def versions_for(commit_iso: str) -> tuple[str, str]:
    date = datetime.fromisoformat(commit_iso.strip().replace("Z", "+00:00"))
    if date.tzinfo is None:
        raise ValueError("Commit timestamp must include a timezone")
    yy = date.year % 100
    day = date.timetuple().tm_yday
    hhmm = date.hour * 100 + date.minute
    # Numeric browser versions cannot contain nonzero leading-zero segments.
    version = f"{yy}.{day}.{hhmm}"
    display = f"{yy:02d}.{day:03d}.{date.hour:02d}{date.minute:02d}"
    return version, display


def stamp_manifest(source: Path, output: Path, commit_iso: str) -> tuple[str, str]:
    version, display = versions_for(commit_iso)
    manifest = json.loads(source.read_text(encoding="utf-8"))
    manifest["version"] = version
    manifest["version_name"] = display
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return version, display


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("Usage: manifest_version.py SOURCE_MANIFEST OUTPUT_MANIFEST COMMIT_ISO")
    print(*stamp_manifest(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]))
