"""Exercise a fresh distribution without using the maintainer's database or server."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def copy_distribution(target):
    target.mkdir(parents=True)
    for name in ("start.py", "server.py", "run.sh", "run.bat", "index.html", "styles.css", "themes.css", "theme.js", "app.js"):
        shutil.copy2(ROOT / name, target / name)
    for name in ("assets", "data"):
        shutil.copytree(ROOT / name, target / name)


class PortabilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="mnema-portability-")
        cls.addClassCleanup(cls.temp.cleanup)
        cls.root = Path(cls.temp.name) / "cópia com espaços" / "mnema"
        copy_distribution(cls.root)
        cls.env = {**os.environ, "PYTHONUTF8": "1", "FLASHCARDS_NO_BROWSER": "1", "FLASHCARDS_HOST": "127.0.0.1"}
        # Do not inherit a developer's database override or server port.
        cls.env.pop("FLASHCARDS_DB", None)
        cls.env.pop("PORT", None)
        cls.collections = [json.loads(p.read_text(encoding="utf-8")) for p in (cls.root / "data").rglob("*.json")]
        cls.before = cls.data_hashes()
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            cls.port = sock.getsockname()[1]
        cls.url = f"http://127.0.0.1:{cls.port}"
        cls.log = (cls.root / "server.log").open("w+", encoding="utf-8")
        cls.addClassCleanup(cls.log.close)
        cls.process = subprocess.Popen([sys.executable, str(cls.root / "start.py"), "--no-browser", "--port", str(cls.port)],
                                       cwd=cls.temp.name, env=cls.env, stdout=cls.log, stderr=subprocess.STDOUT)
        cls.addClassCleanup(cls.stop_server)
        # Bypass local HTTP proxy configuration for the local smoke-test server.
        cls.http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            if cls.process.poll() is not None:
                break
            try:
                with cls.http.open(cls.url + "/api/health", timeout=1) as response:
                    if json.load(response).get("app") == "mnema":
                        return
            except (OSError, urllib.error.URLError):
                time.sleep(0.1)
        cls.log.seek(0)
        raise AssertionError("Fresh-copy startup failed:\n" + cls.log.read())

    @classmethod
    def stop_server(cls):
        cls.process.terminate()
        try:
            cls.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            cls.process.kill()
            cls.process.wait(timeout=5)

    @classmethod
    def data_hashes(cls):
        return {p.relative_to(cls.root): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in (cls.root / "data").rglob("*") if p.is_file()}

    def get_json(self, path):
        with self.http.open(self.url + path, timeout=5) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers.get("Cache-Control"), "no-store")
            return json.load(response)

    def test_health_and_collections_load_without_old_database(self):
        health = self.get_json("/api/health")
        self.assertEqual(health["status"], "ok")
        self.assertIsInstance(health["native_tts"], bool)
        if sys.platform != "darwin":
            self.assertFalse(health["native_tts"])
        expected = {(d["context"]["name"], d["deck"]): len(d["cards"]) for d in self.collections}
        actual = {(c["name"], d["name"]): d["count"] for c in self.get_json("/api/structure")["contexts"] for d in c["decks"]}
        for deck, count in expected.items():
            self.assertEqual(actual.get(deck), count, deck)

    def test_fresh_import_retains_all_cards_images_and_review_progress(self):
        actual = self.get_json("/api/cards")["cards"]
        expected = [c for d in self.collections for c in d["cards"]]
        self.assertEqual(len(actual), len(expected))
        by_terms = {json.dumps(c["terms"], sort_keys=True): c for c in actual}
        for card in expected:
            imported = by_terms[json.dumps(card["terms"], sort_keys=True)]
            for field in ("review_streak", "review_correct", "review_total"):
                self.assertEqual(imported[field], card.get(field, 0))
            self.assertEqual(imported["last_reviewed_at"], card.get("last_reviewed_at", ""))
            self.assertEqual(imported["image"], card.get("image", ""))
            if card.get("due_at"):
                self.assertEqual(imported["due_at"], card["due_at"])
        self.assertEqual(self.before, self.data_hashes(), "Reading collections must not rewrite portable data")

    def test_interface_assets_fonts_and_every_card_image_are_served(self):
        assets = {"/": "text/html", "/styles.css": "text/css", "/themes.css": "text/css",
                  "/theme.js": "text/javascript", "/app.js": "text/javascript", "/assets/fonts/fonts.css": "text/css"}
        for font in (self.root / "assets/fonts").rglob("*.ttf"):
            assets["/" + font.relative_to(self.root).as_posix()] = "font/ttf"
        for collection in self.collections:
            for card in collection["cards"]:
                if card.get("image"):
                    assets["/" + card["image"].lstrip("/")] = "image/svg+xml"
        for path, mime in assets.items():
            with self.subTest(path=path), self.http.open(self.url + path, timeout=5) as response:
                self.assertEqual(response.headers.get_content_type(), mime)
                self.assertEqual(response.headers.get("Cache-Control"), "no-cache")
                self.assertTrue(response.read())

    def test_port_conflict_has_an_actionable_error(self):
        result = subprocess.run([sys.executable, str(self.root / "start.py"), "--no-browser", "--port", str(self.port)],
                                cwd=self.temp.name, env=self.env, capture_output=True, text=True, encoding="utf-8", timeout=15)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--port", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_platform_wrapper_check_from_another_directory(self):
        if os.name == "nt":
            command = ["cmd", "/c", str(self.root / "run.bat"), "--check"]
        else:
            command = ["sh", str(self.root / "run.sh"), "--check"]
        result = subprocess.run(command, cwd=self.temp.name, env=self.env,
                                capture_output=True, text=True, encoding="utf-8", timeout=15)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Installation OK", result.stdout)


class InstallationCheckTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="mnema-check-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "mnema"
        copy_distribution(self.root)

    def check(self):
        return subprocess.run([sys.executable, str(self.root / "start.py"), "--check"], cwd=self.temp.name,
                              capture_output=True, text=True, encoding="utf-8", timeout=15)

    def test_check_is_read_only_and_needs_no_database(self):
        before = {p.relative_to(self.root): p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        result = self.check()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.root / "flashcards.db").exists())
        after = {p.relative_to(self.root): p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        self.assertEqual(before, after)

    def test_missing_font_fails_before_launch(self):
        next((self.root / "assets/fonts").rglob("*.ttf")).unlink()
        result = self.check()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Missing asset", result.stderr)
        self.assertFalse((self.root / "flashcards.db").exists())

    def test_missing_card_image_fails_before_launch(self):
        path = next((self.root / "data").rglob("*.json"))
        payload = json.loads(path.read_text(encoding="utf-8"))
        payload["cards"][0]["image"] = "data/not-in-the-download.svg"
        path.write_text(json.dumps(payload), encoding="utf-8")
        result = self.check()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not-in-the-download.svg", result.stderr)

    def test_filename_case_mismatch_fails_on_every_os(self):
        path = self.root / "index.html"
        path.write_text(path.read_text(encoding="utf-8").replace('href="themes.css?', 'href="Themes.css?'), encoding="utf-8")
        result = self.check()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Themes.css", result.stderr)

    def test_invalid_json_has_a_clear_error(self):
        path = next((self.root / "data").rglob("*.json"))
        path.write_text("{broken", encoding="utf-8")
        result = self.check()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(str(path.relative_to(self.root)), result.stderr)
        self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
