import json
import os
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from bridge import host
from bridge.shelly import Shelly, ShellyError, ShellyManager


class FakeRunner:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, argv, **kwargs):
        self.calls.append((argv, kwargs))
        if not self.responses:
            raise AssertionError("Unexpected Shelly invocation")
        data = self.responses.pop(0)
        return SimpleNamespace(stdout=data[0], stderr=data[1], returncode=data[2])


def app(name="Editor", path="/opt/apps/Editor.AppImage", update_type=0):
    return {"Name": name, "Path": path, "Version": "1.0",
            "UpdateType": update_type, "UpdateURl": "",
            "RepoOwner": None, "RepoName": None}


def adapter(responses):
    runner = FakeRunner(responses)
    with patch.dict(os.environ, {"AIG_SHELLY_COMMAND": "/test/bin/shelly"}):
        shelly = Shelly(runner=runner)
    return shelly, runner


class ShellyTests(unittest.TestCase):
    def test_installs_opaque_appimage_via_cli_with_no_content_validation(self):
        shelly, runner = adapter([("", "", 0)])
        result = shelly.integrate(Path("/home/user/Downloads/Beeper (1).AppImage"))
        self.assertEqual(result.status, "integrated_by_shelly")
        self.assertEqual(runner.calls[0][0], [
            "/test/bin/shelly", "install", "appimage",
            "/home/user/Downloads/Beeper (1).AppImage", "--no-confirm"])
        self.assertEqual(len(runner.calls), 1)

    def test_install_failure_returns_shelly_diagnostics(self):
        shelly, _ = adapter([("", "invalid AppImage format", 3)])
        with self.assertRaisesRegex(ShellyError, "invalid AppImage format"):
            shelly.integrate(Path("/tmp/bad.AppImage"))

    def test_json_lists_normalized_with_source_read_only(self):
        shelly, runner = adapter([(json.dumps([app(update_type=2)]), "", 0)])
        data = ShellyManager(shelly).list_installed()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["name"], "Editor")
        self.assertEqual(data[0]["current_version"], "1.0")
        self.assertEqual(data[0]["manager"], "Shelly")
        self.assertEqual(data[0]["source_status"], "external")
        self.assertEqual(runner.calls[0][0], [
            "/test/bin/shelly", "list", "appimage", "--json"])

    def test_invalid_json_list_fails_closed(self):
        shelly, _ = adapter([('{"Installed":[]}', "", 0)])
        with self.assertRaisesRegex(ShellyError, "lista AppImage JSON"):
            ShellyManager(shelly).list_installed()

    def test_update_list_matches_unique_names_only(self):
        installed = [app(), app("Ambiguous", "/apps/A.AppImage"),
                     app("Ambiguous", "/apps/B.AppImage")]
        updates = [{"Name":"Editor","Version":"2.0","IsUpdateAvailable":True},
                   {"Name":"Ambiguous","Version":"2.0","IsUpdateAvailable":True},
                   {"Name":"Invisible","Version":"9","IsUpdateAvailable":True},
                   {"Name":"NoUpdate","Version":"2","IsUpdateAvailable":False}]
        shelly, _ = adapter([(json.dumps(installed), "", 0),
                            (json.dumps(updates), "", 0)])
        items = ShellyManager(shelly).updates()
        self.assertEqual([a["name"] for a in items], ["Editor"])
        self.assertEqual(items[0]["available_version"], "2.0")

    def test_update_all_only_after_shelly_confirms_updates(self):
        installed = [app()]
        updates = [{"Name":"Editor","Version":"2.0","IsUpdateAvailable":True}]
        shelly, runner = adapter([(json.dumps(installed), "", 0),
                                  (json.dumps(updates), "", 0), ("", "", 0)])
        result = ShellyManager(shelly).update_all()
        self.assertEqual(result["status"], "updated_all")
        self.assertEqual(runner.calls[2][0], [
            "/test/bin/shelly", "upgrade", "appimage", "--no-confirm"])

    def test_update_all_skips_if_no_updates(self):
        shelly, runner = adapter([(json.dumps([app()]), "", 0), ("[]", "", 0)])
        with self.assertRaisesRegex(ValueError, "nenhuma atualização"):
            ShellyManager(shelly).update_all()
        self.assertEqual(len(runner.calls), 2)

    def test_removal_checks_unique_name_exact_path(self):
        shelly, runner = adapter([(json.dumps([app()]), "", 0), ("", "", 0)])
        result = ShellyManager(shelly).remove("/opt/apps/Editor.AppImage")
        self.assertEqual(result["status"], "removed")
        self.assertEqual(runner.calls[1][0], [
            "/test/bin/shelly", "remove", "appimage", "Editor", "--no-confirm"])

    def test_removal_rejects_duplicate_names_and_wrong_paths(self):
        data = [app("Editor", "/apps/A.AppImage"), app("Editor", "/apps/B.AppImage")]
        shelly, runner = adapter([(json.dumps(data), "", 0)])
        with self.assertRaisesRegex(ValueError, "duplicado"):
            ShellyManager(shelly).remove("/apps/A.AppImage")
        self.assertEqual(len(runner.calls), 1)

    def test_source_edits_not_misrouted_to_gearlever(self):
        shelly, _ = adapter([])
        with self.assertRaisesRegex(ValueError, "editor é exclusivo"):
            ShellyManager(shelly).set_source("/apps/A.AppImage", "GithubUpdater", {})
        with self.assertRaisesRegex(ValueError, "editor é exclusivo"):
            ShellyManager(shelly).unset_source("/apps/A.AppImage")

    def test_native_host_routes_shelly_and_isolates_receipts(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "Beeper.AppImage"
            file.write_bytes(b"not a type 1 or type 2 AppImage")
            request = {"action": "integrate", "backend": "shelly",
                       "filename": str(file), "url": "https://example.org/Beeper.AppImage"}
            shelly, runner = adapter([("", "", 0)])
            with patch.object(host, "STATE_DIR", Path(directory)/"state"):
                with patch.object(host, "Shelly", return_value=shelly):
                    first = host.handle(request)
                    repeated = host.handle(request)
            self.assertEqual(first["status"], "integrated_by_shelly")
            self.assertEqual(first["backend"], "shelly")
            self.assertEqual(repeated["status"], "already_processed")
            self.assertEqual(len(runner.calls), 1)

    def test_native_host_rejects_unknown_backend_and_unconfirmed_upgrade(self):
        with self.assertRaisesRegex(ValueError, "Gerenciador inválido"):
            host.handle({"action": "ping", "backend": "unknown"})
        with self.assertRaisesRegex(ValueError, "Confirmação explícita"):
            host.handle({"action": "updateAllAppImages", "backend": "shelly"})
        with self.assertRaisesRegex(ValueError, "somente no Shelly"):
            host.handle({"action": "updateAllAppImages", "backend": "gearlever",
                         "confirmed": True})


if __name__ == "__main__":
    unittest.main()
