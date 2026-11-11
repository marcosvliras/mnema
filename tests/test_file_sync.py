"""App writes must not lose cards added to JSON files, nor undo changes made in the app."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import threading
import unittest
from unittest import mock
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def make_card(term):
    return {"terms": {"English": term, "Portuguese": f"{term} em português"},
            "examples": {"English": [f"{term} one.", f"{term} two.", f"{term} three."],
                         "Portuguese": [f"{term} um.", f"{term} dois.", f"{term} três."]},
            "part_of_speech": "noun", "meaning": f"Meaning of {term}.", "source": "test"}


class FileSyncTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="mnema-file-sync-")
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        shutil.copy2(ROOT / "server.py", self.root / "server.py")
        self.deck = self.root / "data" / "english" / "general.json"
        self.deck.parent.mkdir(parents=True)
        self.write_deck({"schema_version": 1, "context": {"name": "Inglês", "learning_language": "English"},
                         "deck": "Geral", "source": "test", "cards": [make_card("first"), make_card("second")]})

        env = {k: v for k, v in os.environ.items() if k != "FLASHCARDS_DB"}
        patcher = mock.patch.dict(os.environ, env, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)
        spec = importlib.util.spec_from_file_location("mnema_file_sync_test", self.root / "server.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.init_db()

        server = module.LocalHTTPServer(("127.0.0.1", 0), module.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join, 5)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        self.url = f"http://127.0.0.1:{server.server_port}"
        self.http = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def read_deck(self):
        return json.loads(self.deck.read_text(encoding="utf-8"))

    def write_deck(self, payload):
        self.deck.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def file_card(self, term):
        return next((c for c in self.read_deck()["cards"] if c["terms"]["English"] == term), None)

    def request(self, method, path, body=None):
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(self.url + path, data=data, method=method,
                                         headers={"Content-Type": "application/json"})
        with self.http.open(request, timeout=5) as response:
            return json.load(response)

    def card_id(self, term):
        cards = self.request("GET", "/api/cards")["cards"]
        return next(c["id"] for c in cards if c["terms"]["English"] == term)

    def add_to_file(self, term):
        payload = self.read_deck()
        payload["cards"].append(make_card(term))
        self.write_deck(payload)

    def test_review_keeps_card_added_to_file_after_last_read(self):
        card_id = self.card_id("first")
        self.add_to_file("added")
        self.request("POST", f"/api/cards/{card_id}/review", {"remembered": True})
        self.assertIsNotNone(self.file_card("added"))
        self.assertEqual(self.file_card("first")["review_total"], 1)

    def test_status_change_keeps_card_added_to_file_after_last_read(self):
        card_id = self.card_id("first")
        self.add_to_file("added")
        self.request("POST", f"/api/cards/{card_id}/status", {"status": "learned"})
        self.assertIsNotNone(self.file_card("added"))

    def test_delete_keeps_added_card_and_stays_deleted(self):
        card_id = self.card_id("first")
        self.add_to_file("added")
        self.request("DELETE", f"/api/cards/{card_id}")
        self.assertIsNotNone(self.file_card("added"))
        self.assertIsNone(self.file_card("first"))
        terms = {c["terms"]["English"] for c in self.request("GET", "/api/cards")["cards"]}
        self.assertEqual(terms, {"second", "added"})

    def test_edit_keeps_added_card_and_is_not_undone(self):
        card_id = self.card_id("first")
        self.add_to_file("added")
        edited = make_card("first")
        edited["terms"]["Portuguese"] = "primeiro"
        edited.update(context_name="Inglês", deck_name="Geral", learning_language="English")
        self.request("PUT", f"/api/cards/{card_id}", edited)
        self.assertIsNotNone(self.file_card("added"))
        self.assertEqual(self.file_card("first")["terms"]["Portuguese"], "primeiro")
        cards = self.request("GET", "/api/cards")["cards"]
        self.assertEqual(next(c for c in cards if c["id"] == card_id)["terms"]["Portuguese"], "primeiro")

    def test_review_keeps_existing_progress_when_file_content_is_enriched(self):
        card_id = self.card_id("first")
        self.request("POST", f"/api/cards/{card_id}/review", {"remembered": True})
        payload = self.read_deck()
        next(c for c in payload["cards"] if c["terms"]["English"] == "first")["meaning"] = "Enriched."
        self.write_deck(payload)
        self.request("POST", f"/api/cards/{card_id}/review", {"remembered": True})
        card = self.file_card("first")
        self.assertEqual(card["review_total"], 2)
        self.assertEqual(card["meaning"], "Enriched.")


if __name__ == "__main__":
    unittest.main()
