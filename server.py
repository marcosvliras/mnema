#!/usr/bin/env python3
"""Small local flashcard server. Uses only the Python standard library."""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import threading
import unicodedata
import webbrowser
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
# Correct answers in a row after which a word counts as learned (matches LEARNED_STREAK in app.js).
LEARNED_STREAK = 3
DB_PATH = Path(os.environ.get("FLASHCARDS_DB", ROOT / "flashcards.db"))
HOST = os.environ.get("FLASHCARDS_HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8765"))
DEFAULT_DECK = "Geral"
FILE_SYNC_LOCK = threading.Lock()
LANGUAGE_ALIASES = {
    "en": "english", "eng": "english", "ingles": "english", "english": "english",
    "pt": "portuguese", "por": "portuguese", "portugues": "portuguese", "portuguese": "portuguese",
    "es": "spanish", "spa": "spanish", "espanhol": "spanish", "spanish": "spanish",
    "fr": "french", "fra": "french", "frances": "french", "french": "french",
    "de": "german", "deu": "german", "alemao": "german", "german": "german",
    "it": "italian", "ita": "italian", "italiano": "italian", "italian": "italian",
}


def connect():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    return db


def init_db():
    with connect() as db:
        db.execute("""CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            learning_language TEXT NOT NULL DEFAULT '',
            context_name TEXT NOT NULL DEFAULT '',
            deck_name TEXT NOT NULL DEFAULT 'Geral',
            terms TEXT NOT NULL,
            examples TEXT NOT NULL DEFAULT '{}',
            notes TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT 'manual',
            source_key TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )""")
        columns = {row[1] for row in db.execute("PRAGMA table_info(cards)")}
        if "learning_language" not in columns:
            db.execute("ALTER TABLE cards ADD COLUMN learning_language TEXT NOT NULL DEFAULT ''")
        if "context_name" not in columns:
            db.execute("ALTER TABLE cards ADD COLUMN context_name TEXT NOT NULL DEFAULT ''")
        if "deck_name" not in columns:
            db.execute("ALTER TABLE cards ADD COLUMN deck_name TEXT NOT NULL DEFAULT 'Geral'")
        if "examples" not in columns:
            db.execute("ALTER TABLE cards ADD COLUMN examples TEXT NOT NULL DEFAULT '{}'")
        if "review_streak" not in columns:
            db.execute("ALTER TABLE cards ADD COLUMN review_streak INTEGER NOT NULL DEFAULT 0")
        if "review_correct" not in columns:
            db.execute("ALTER TABLE cards ADD COLUMN review_correct INTEGER NOT NULL DEFAULT 0")
        if "review_total" not in columns:
            db.execute("ALTER TABLE cards ADD COLUMN review_total INTEGER NOT NULL DEFAULT 0")
        if "due_at" not in columns:
            db.execute("ALTER TABLE cards ADD COLUMN due_at TEXT NOT NULL DEFAULT ''")
        if "last_reviewed_at" not in columns:
            db.execute("ALTER TABLE cards ADD COLUMN last_reviewed_at TEXT NOT NULL DEFAULT ''")
        if "part_of_speech" not in columns:
            db.execute("ALTER TABLE cards ADD COLUMN part_of_speech TEXT NOT NULL DEFAULT ''")
        if "pronunciation" not in columns:
            db.execute("ALTER TABLE cards ADD COLUMN pronunciation TEXT NOT NULL DEFAULT ''")
        db.execute("UPDATE cards SET due_at=? WHERE due_at=''", (datetime.now(timezone.utc).isoformat(),))
        db.execute("""CREATE TABLE IF NOT EXISTS study_contexts (
            name TEXT PRIMARY KEY COLLATE NOCASE,
            learning_language TEXT NOT NULL
        )""")
        db.execute("""CREATE TABLE IF NOT EXISTS decks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            context_name TEXT NOT NULL COLLATE NOCASE,
            name TEXT NOT NULL COLLATE NOCASE,
            UNIQUE(context_name, name)
        )""")
        # Migrate the original one-list-per-language structure into a context and a Geral deck.
        db.execute("UPDATE cards SET context_name=learning_language WHERE context_name='' AND learning_language<>''")
        db.execute("UPDATE cards SET deck_name=? WHERE deck_name=''", (DEFAULT_DECK,))
        rows = db.execute("SELECT DISTINCT context_name, learning_language FROM cards WHERE context_name<>''").fetchall()
        for row in rows:
            db.execute("INSERT OR IGNORE INTO study_contexts(name,learning_language) VALUES(?,?)",
                       (row["context_name"], row["learning_language"]))
            db.execute("INSERT OR IGNORE INTO decks(context_name,name) VALUES(?,?)",
                       (row["context_name"], DEFAULT_DECK))
        # Include context in duplicate identity, retaining all existing cards.
        for row in db.execute("SELECT id, terms, learning_language, context_name, source_key FROM cards").fetchall():
            if row["context_name"]:
                key = canonical_key(json.loads(row["terms"]), row["learning_language"], row["context_name"])
                if key != row["source_key"]:
                    db.execute("UPDATE cards SET source_key=? WHERE id=?", (key, row["id"]))
    load_file_collections()


def load_file_collections():
    """Synchronize JSON content into SQLite while retaining per-card review history."""
    data_root = ROOT / "data"
    if not data_root.exists():
        return
    files = sorted(data_root.rglob("*.json"))
    if not files:
        return
    with connect() as db:
        for path in files:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if payload.get("schema_version") != 1:
                raise ValueError(f"Versão de schema não suportada em {path.relative_to(ROOT)}")
            context = payload.get("context") or {}
            context_name = str(context.get("name", "")).strip()
            learning_language = str(context.get("learning_language", "")).strip()
            deck_name = str(payload.get("deck", DEFAULT_DECK)).strip() or DEFAULT_DECK
            source = str(payload.get("source", "arquivo local")).strip() or "arquivo local"
            if not context_name or not learning_language:
                raise ValueError(f"Contexto incompleto em {path.relative_to(ROOT)}")
            ensure_context(db, context_name, learning_language)
            db.execute("INSERT OR IGNORE INTO decks(context_name,name) VALUES(?,?)", (context_name, deck_name))
            defaults = {"context_name": context_name, "learning_language": learning_language,
                        "deck_name": deck_name, "source": source}
            for raw in payload.get("cards", []):
                cn, dn, language, terms, examples, notes, pos, card_source, key = normalize_card(raw, defaults)
                now = datetime.now(timezone.utc).isoformat()
                db.execute("""INSERT INTO cards
                    (context_name,deck_name,learning_language,terms,examples,notes,part_of_speech,source,source_key,created_at,updated_at,review_streak,review_correct,review_total,due_at,last_reviewed_at)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(source_key) DO UPDATE SET
                      context_name=excluded.context_name, deck_name=excluded.deck_name,
                      learning_language=excluded.learning_language, terms=excluded.terms,
                      examples=excluded.examples, notes=excluded.notes,
                      part_of_speech=excluded.part_of_speech, source=excluded.source,
                      updated_at=excluded.updated_at""",
                    (cn, dn, language, json.dumps(terms, ensure_ascii=False),
                     json.dumps(examples, ensure_ascii=False), notes, pos, card_source, key, now, now,
                     int(raw.get("review_streak", 0)), int(raw.get("review_correct", 0)),
                     int(raw.get("review_total", 0)), str(raw.get("due_at") or now),
                     str(raw.get("last_reviewed_at") or ""))
                    )
                # Pronunciation (IPA of the learned term) lives only in collection files.
                db.execute("UPDATE cards SET pronunciation=? WHERE source_key=?",
                           (str(raw.get("pronunciation", "")).strip(), key))


def sync_file_collections():
    """Serialize filesystem syncs triggered by parallel API reads."""
    with FILE_SYNC_LOCK:
        load_file_collections()


def slug_component(value):
    plain = "".join(c for c in unicodedata.normalize("NFD", str(value).casefold())
                   if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", plain).strip("-") or "colecao"


def persist_deck_file(db, context_name, deck_name):
    """Mirror one local deck into its portable JSON collection file."""
    context = db.execute("SELECT name,learning_language FROM study_contexts WHERE name=? COLLATE NOCASE",
                         (context_name,)).fetchone()
    if not context:
        return
    target = None
    data_root = ROOT / "data"
    for path in data_root.rglob("*.json") if data_root.exists() else []:
        try:
            current = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if (str((current.get("context") or {}).get("name", "")).casefold() == context["name"].casefold()
                and str(current.get("deck", DEFAULT_DECK)).casefold() == deck_name.casefold()):
            target = path
            break
    if target is None:
        target = data_root / slug_component(context["learning_language"]) / slug_component(context["name"]) / f"{slug_component(deck_name)}.json"
    cards = []
    for row in db.execute("SELECT terms,examples,notes,part_of_speech,pronunciation,source,review_streak,review_correct,review_total,due_at,last_reviewed_at FROM cards WHERE context_name=? COLLATE NOCASE AND deck_name=? COLLATE NOCASE ORDER BY id",
                           (context["name"], deck_name)):
        card = {"terms": json.loads(row["terms"]), "examples": json.loads(row["examples"] or "{}"),
                      "part_of_speech": row["part_of_speech"] or "", "meaning": row["notes"] or "",
                      "source": row["source"] or "local", "review_streak": row["review_streak"],
                      "review_correct": row["review_correct"], "review_total": row["review_total"],
                      "due_at": row["due_at"], "last_reviewed_at": row["last_reviewed_at"]}
        if row["pronunciation"]:
            card["pronunciation"] = row["pronunciation"]
        cards.append(card)
    payload = {"schema_version": 1,
               "context": {"name": context["name"], "learning_language": context["learning_language"]},
               "deck": deck_name, "source": "local", "cards": cards}
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(target)


def canonical_key(terms: dict[str, str], learning_language: str, context_name: str) -> str:
    """Deduplicate by learned term within a language context, independent of source/deck."""
    cleaned = {str(k).strip().casefold(): " ".join(str(v).split()).casefold()
               for k, v in terms.items() if str(k).strip() and str(v).strip()}
    def lang_id(value):
        plain = "".join(c for c in unicodedata.normalize("NFD", value.casefold())
                        if unicodedata.category(c) != "Mn").strip()
        return LANGUAGE_ALIASES.get(plain, plain)
    target = next((value for lang, value in cleaned.items()
                   if lang_id(lang) == lang_id(learning_language)), "")
    if not target:
        raise ValueError(f"Inclua o termo no idioma estudado ({learning_language}) no cartão.")
    material = context_name.strip().casefold() + "\0" + learning_language.strip().casefold() + "\0" + target
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def card_dict(row):
    out = dict(row)
    out["terms"] = json.loads(out["terms"])
    out["examples"] = json.loads(out.get("examples") or "{}")
    return out


def normalize_examples(raw):
    examples = raw.get("examples", {})
    if isinstance(examples, str):
        try: examples = json.loads(examples)
        except json.JSONDecodeError: examples = {}
    if not isinstance(examples, dict): examples = {}
    normalized = {}
    for language, values in examples.items():
        if isinstance(values, str): values = values.splitlines()
        if not isinstance(values, list): continue
        cleaned = list(dict.fromkeys(str(value).strip() for value in values if str(value).strip()))
        if str(language).strip() and cleaned: normalized[str(language).strip()] = cleaned
    if not normalized and raw.get("example"):
        language = str(raw.get("example_language", "")).strip()
        if language: normalized[language] = [str(raw["example"]).strip()]
    return normalized


def merge_examples(old, new):
    merged = {language: list(values) for language, values in old.items()}
    for language, values in new.items():
        current = next((key for key in merged if key.casefold() == language.casefold()), language)
        merged[current] = list(dict.fromkeys(merged.get(current, []) + values))
    return merged


def normalize_card(raw, defaults=None):
    defaults = defaults or {}
    terms = raw.get("terms", raw.get("translations", {}))
    if isinstance(terms, str):
        try:
            terms = json.loads(terms)
        except json.JSONDecodeError:
            terms = {}
    if not isinstance(terms, dict):
        raise ValueError("'terms' precisa ser um objeto de idioma para texto.")
    terms = {str(lang).strip(): str(value).strip() for lang, value in terms.items()
             if str(lang).strip() and str(value).strip()}
    if not terms:
        raise ValueError("O cartão precisa ter conteúdo.")
    context_name = str(raw.get("context_name", raw.get("context", defaults.get("context_name", "")))).strip()
    deck_name = str(raw.get("deck_name", raw.get("deck", defaults.get("deck_name", DEFAULT_DECK)))).strip() or DEFAULT_DECK
    learning_language = str(raw.get("learning_language", defaults.get("learning_language", ""))).strip()
    if not context_name:
        context_name = learning_language
    if not learning_language:
        learning_language = context_name
    if not context_name or not learning_language:
        raise ValueError("Escolha um contexto de estudo para este cartão.")
    examples = normalize_examples(raw)
    notes = str(raw.get("notes", raw.get("meaning", ""))).strip()
    part_of_speech = str(raw.get("part_of_speech", raw.get("word_class", raw.get("pos", "")))).strip()
    source = str(raw.get("source", defaults.get("source", "import"))).strip() or "import"
    key = canonical_key(terms, learning_language, context_name)
    return context_name, deck_name, learning_language, terms, examples, notes, part_of_speech, source, key


def ensure_context(db, name, learning_language):
    db.execute("INSERT OR IGNORE INTO study_contexts(name,learning_language) VALUES(?,?)", (name, learning_language))
    db.execute("INSERT OR IGNORE INTO decks(context_name,name) VALUES(?,?)", (name, DEFAULT_DECK))


def ensure_deck(db, context_name, deck_name):
    if not db.execute("SELECT 1 FROM study_contexts WHERE name=? COLLATE NOCASE", (context_name,)).fetchone():
        raise ValueError(f"O contexto '{context_name}' não existe.")
    db.execute("INSERT OR IGNORE INTO decks(context_name,name) VALUES(?,?)", (context_name, deck_name))


def get_structure(db):
    contexts = []
    for context in db.execute("SELECT name, learning_language FROM study_contexts ORDER BY name COLLATE NOCASE"):
        decks = []
        for deck in db.execute("""SELECT d.name, COUNT(c.id) AS count FROM decks d
                                  LEFT JOIN cards c ON c.context_name=d.context_name COLLATE NOCASE
                                  AND c.deck_name=d.name COLLATE NOCASE
                                  WHERE d.context_name=? COLLATE NOCASE
                                  GROUP BY d.id ORDER BY d.name COLLATE NOCASE""", (context["name"],)):
            decks.append({"name": deck["name"], "count": deck["count"]})
        contexts.append({"name": context["name"], "learning_language": context["learning_language"], "decks": decks})
    return contexts


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def send_json(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 8_000_000:
            raise ValueError("Arquivo de importação grande demais (limite 8 MB).")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/cards":
            sync_file_collections()
            query = parse_qs(urlparse(self.path).query)
            context, deck = query.get("context", [None])[0], query.get("deck", [None])[0]
            sql, params = "SELECT * FROM cards", []
            if context:
                sql += " WHERE context_name=? COLLATE NOCASE"; params.append(context)
            if deck:
                sql += " AND deck_name=? COLLATE NOCASE" if context else " WHERE deck_name=? COLLATE NOCASE"
                params.append(deck)
            sql += " ORDER BY updated_at DESC, id DESC"
            with connect() as db:
                rows = db.execute(sql, params).fetchall()
            return self.send_json({"cards": [card_dict(r) for r in rows]})
        if path == "/api/structure":
            sync_file_collections()
            with connect() as db:
                return self.send_json({"contexts": get_structure(db)})
        if path == "/api/languages":
            sync_file_collections()
            with connect() as db:
                rows = db.execute("SELECT terms FROM cards").fetchall()
            langs = sorted({lang for row in rows for lang in json.loads(row[0])}, key=str.casefold)
            return self.send_json({"languages": langs})
        if path == "/api/backup":
            with connect() as db:
                rows = db.execute("SELECT * FROM cards ORDER BY id").fetchall()
                contexts = [dict(r) for r in db.execute("SELECT * FROM study_contexts ORDER BY name")]
                decks = [dict(r) for r in db.execute("SELECT context_name,name FROM decks ORDER BY context_name,name")]
            return self.send_json({"version": 2, "exported_at": datetime.now(timezone.utc).isoformat(),
                                   "contexts": contexts, "decks": decks, "cards": [card_dict(r) for r in rows]})
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            body = self.read_json()
            if path == "/api/contexts":
                name = str(body.get("name", "")).strip()
                language = str(body.get("learning_language", "")).strip()
                if not name or not language:
                    raise ValueError("Informe o nome do contexto e o idioma estudado.")
                with connect() as db:
                    db.execute("INSERT INTO study_contexts(name,learning_language) VALUES(?,?)", (name, language))
                    db.execute("INSERT INTO decks(context_name,name) VALUES(?,?)", (name, DEFAULT_DECK))
                    persist_deck_file(db, name, DEFAULT_DECK)
                    return self.send_json({"contexts": get_structure(db)})
            if path == "/api/decks":
                context_name, name = str(body.get("context_name", "")).strip(), str(body.get("name", "")).strip()
                if not context_name or not name:
                    raise ValueError("Informe o contexto e o nome do deck.")
                with connect() as db:
                    ensure_deck(db, context_name, name)
                    persist_deck_file(db, context_name, name)
                    return self.send_json({"contexts": get_structure(db)})
            if path.startswith("/api/cards/") and path.endswith("/status"):
                # Manual move: "learned" jumps to the learned streak (next review in 7 days);
                # "relearn" counts as a miss: it resets the streak and the word comes back right away.
                card_id = int(path.split("/")[-2])
                status = str(body.get("status", ""))
                if status not in ("learned", "relearn"):
                    return self.send_json({"error": "Status inválido."}, 400)
                now = datetime.now(timezone.utc)
                with connect() as db:
                    card = db.execute("SELECT * FROM cards WHERE id=?", (card_id,)).fetchone()
                    if not card:
                        return self.send_json({"error": "Cartão não encontrado."}, 404)
                    if status == "learned":
                        streak = max(int(card["review_streak"] or 0), LEARNED_STREAK)
                        due = now.timestamp() + 7 * 86400
                    total = int(card["review_total"] or 0)
                    if status == "relearn":
                        streak = 0
                        total += 1
                        due = now.timestamp()
                    db.execute("UPDATE cards SET review_streak=?,review_total=?,due_at=? WHERE id=?",
                               (streak, total, datetime.fromtimestamp(due, timezone.utc).isoformat(), card_id))
                    persist_deck_file(db, card["context_name"], card["deck_name"])
                    result = card_dict(db.execute("SELECT * FROM cards WHERE id=?", (card_id,)).fetchone())
                return self.send_json({"card": result})
            if path.startswith("/api/cards/") and path.endswith("/review"):
                card_id = int(path.split("/")[-2])
                remembered = bool(body.get("remembered"))
                now = datetime.now(timezone.utc)
                with connect() as db:
                    card = db.execute("SELECT * FROM cards WHERE id=?", (card_id,)).fetchone()
                    if not card:
                        return self.send_json({"error": "Cartão não encontrado."}, 404)
                    streak = int(card["review_streak"] or 0)
                    correct = int(card["review_correct"] or 0) + int(remembered)
                    total = int(card["review_total"] or 0) + 1
                    if remembered:
                        streak += 1
                        days = [1, 3, 7, 14, 30, 60, 90][min(streak - 1, 6)]
                        due = now.timestamp() + days * 86400
                    else:
                        streak = 0
                        due = now.timestamp() + 600
                    due_at = datetime.fromtimestamp(due, timezone.utc).isoformat()
                    reviewed_at = now.isoformat()
                    db.execute("UPDATE cards SET review_streak=?,review_correct=?,review_total=?,due_at=?,last_reviewed_at=? WHERE id=?",
                               (streak, correct, total, due_at, reviewed_at, card_id))
                    persist_deck_file(db, card["context_name"], card["deck_name"])
                    result = card_dict(db.execute("SELECT * FROM cards WHERE id=?", (card_id,)).fetchone())
                return self.send_json({"card": result})
            if path == "/api/cards":
                context_name, deck_name, language, terms, examples, notes, part_of_speech, source, key = normalize_card(body)
                now = datetime.now(timezone.utc).isoformat()
                with connect() as db:
                    ensure_context(db, context_name, language)
                    ensure_deck(db, context_name, deck_name)
                    prior = db.execute("SELECT * FROM cards WHERE source_key=?", (key,)).fetchone()
                    if prior:
                        merged = json.loads(prior["terms"]); merged.update(terms)
                        merged_examples = merge_examples(json.loads(prior["examples"] or "{}"), examples)
                        merged_notes = "\n".join(dict.fromkeys(x for x in [prior["notes"], notes] if x))
                        db.execute("UPDATE cards SET terms=?,examples=?,notes=?,part_of_speech=?,updated_at=? WHERE source_key=?",
                                   (json.dumps(merged, ensure_ascii=False), json.dumps(merged_examples, ensure_ascii=False), merged_notes, part_of_speech or prior["part_of_speech"], now, key))
                    else:
                        db.execute("INSERT INTO cards(context_name,deck_name,learning_language,terms,examples,notes,part_of_speech,source,source_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                                   (context_name, deck_name, language, json.dumps(terms, ensure_ascii=False), json.dumps(examples, ensure_ascii=False), notes, part_of_speech, source, key, now, now))
                    persist_deck_file(db, context_name, deck_name)
                    result = card_dict(db.execute("SELECT * FROM cards WHERE source_key=?", (key,)).fetchone())
                return self.send_json({"card": result})
            if path == "/api/import":
                cards = body.get("cards", [])
                if not isinstance(cards, list): raise ValueError("'cards' precisa ser uma lista.")
                defaults = {"context_name": str(body.get("context_name", "")).strip(),
                            "deck_name": str(body.get("deck_name", DEFAULT_DECK)).strip() or DEFAULT_DECK,
                            "learning_language": str(body.get("learning_language", "")).strip(),
                            "source": str(body.get("source", "importação")).strip() or "importação"}
                added = existing = skipped = 0; errors = []; touched = set()
                now = datetime.now(timezone.utc).isoformat()
                with connect() as db:
                    for index, raw in enumerate(cards, 1):
                        try:
                            context, deck, language, terms, examples, notes, part_of_speech, source, key = normalize_card(raw, defaults)
                            ensure_context(db, context, language); ensure_deck(db, context, deck)
                            touched.add((context, deck))
                            prior = db.execute("SELECT * FROM cards WHERE source_key=?", (key,)).fetchone()
                            if prior:
                                merged = json.loads(prior["terms"]); merged.update(terms)
                                merged_examples = merge_examples(json.loads(prior["examples"] or "{}"), examples)
                                merged_notes = "\n".join(dict.fromkeys(x for x in [prior["notes"], notes] if x))
                                db.execute("UPDATE cards SET terms=?,examples=?,notes=?,part_of_speech=?,updated_at=? WHERE source_key=?",
                                           (json.dumps(merged, ensure_ascii=False), json.dumps(merged_examples, ensure_ascii=False), merged_notes, part_of_speech or prior["part_of_speech"], now, key))
                                existing += 1
                            else:
                                db.execute("INSERT INTO cards(context_name,deck_name,learning_language,terms,examples,notes,part_of_speech,source,source_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                                           (context, deck, language, json.dumps(terms, ensure_ascii=False), json.dumps(examples, ensure_ascii=False), notes, part_of_speech, source, key, now, now))
                                added += 1
                        except (ValueError, TypeError, sqlite3.IntegrityError) as exc:
                            skipped += 1; errors.append({"row": index, "error": str(exc)})
                    for context, deck in touched:
                        persist_deck_file(db, context, deck)
                return self.send_json({"added": added, "existing": existing, "skipped": skipped, "errors": errors})
            if path == "/api/restore":
                cards = body.get("cards", [])
                with connect() as db:
                    db.execute("DELETE FROM cards"); db.execute("DELETE FROM decks"); db.execute("DELETE FROM study_contexts")
                    for context in body.get("contexts", []):
                        name, language = str(context["name"]).strip(), str(context.get("learning_language", context["name"])).strip()
                        db.execute("INSERT INTO study_contexts(name,learning_language) VALUES(?,?)", (name, language))
                    for deck in body.get("decks", []):
                        db.execute("INSERT OR IGNORE INTO decks(context_name,name) VALUES(?,?)", (deck["context_name"], deck["name"]))
                    now = datetime.now(timezone.utc).isoformat()
                    for raw in cards:
                        context, deck, language, terms, examples, notes, part_of_speech, source, key = normalize_card(raw)
                        ensure_context(db, context, language); ensure_deck(db, context, deck)
                        created = str(raw.get("created_at", now))
                        due_at = str(raw.get("due_at") or now)
                        db.execute("INSERT INTO cards(context_name,deck_name,learning_language,terms,examples,notes,part_of_speech,source,source_key,created_at,updated_at,review_streak,review_correct,review_total,due_at,last_reviewed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                                   (context, deck, language, json.dumps(terms, ensure_ascii=False), json.dumps(examples, ensure_ascii=False), notes, part_of_speech, source, key, created, now, int(raw.get("review_streak", 0)), int(raw.get("review_correct", 0)), int(raw.get("review_total", 0)), due_at, str(raw.get("last_reviewed_at") or "")))
                return self.send_json({"restored": len(cards)})
            return self.send_json({"error": "Rota não encontrada."}, 404)
        except (ValueError, KeyError, json.JSONDecodeError, sqlite3.IntegrityError) as exc:
            return self.send_json({"error": str(exc)}, 400)

    def do_PUT(self):
        path = urlparse(self.path).path
        if not path.startswith("/api/cards/"):
            return self.send_json({"error": "Rota não encontrada."}, 404)
        try:
            card_id = int(path.rsplit("/", 1)[-1]); body = self.read_json()
            context, deck, language, terms, examples, notes, part_of_speech, source, key = normalize_card(body)
            now = datetime.now(timezone.utc).isoformat()
            with connect() as db:
                previous = db.execute("SELECT context_name,deck_name FROM cards WHERE id=?", (card_id,)).fetchone()
                ensure_context(db, context, language); ensure_deck(db, context, deck)
                db.execute("UPDATE cards SET context_name=?,deck_name=?,learning_language=?,terms=?,examples=?,notes=?,part_of_speech=?,source=?,source_key=?,updated_at=? WHERE id=?",
                           (context, deck, language, json.dumps(terms, ensure_ascii=False), json.dumps(examples, ensure_ascii=False), notes, part_of_speech, source, key, now, card_id))
                if previous:
                    persist_deck_file(db, previous["context_name"], previous["deck_name"])
                persist_deck_file(db, context, deck)
                row = db.execute("SELECT * FROM cards WHERE id=?", (card_id,)).fetchone()
            if not row: return self.send_json({"error": "Cartão não encontrado."}, 404)
            return self.send_json({"card": card_dict(row)})
        except (ValueError, KeyError, json.JSONDecodeError, sqlite3.IntegrityError) as exc:
            return self.send_json({"error": str(exc)}, 400)

    def do_DELETE(self):
        path = urlparse(self.path).path
        if not path.startswith("/api/cards/"):
            return self.send_json({"error": "Rota não encontrada."}, 404)
        try:
            card_id = int(path.rsplit("/", 1)[-1])
            with connect() as db:
                old = db.execute("SELECT context_name,deck_name FROM cards WHERE id=?", (card_id,)).fetchone()
                cur = db.execute("DELETE FROM cards WHERE id=?", (card_id,))
                if old:
                    persist_deck_file(db, old["context_name"], old["deck_name"])
            return self.send_json({"deleted": cur.rowcount > 0})
        except ValueError as exc:
            return self.send_json({"error": str(exc)}, 400)


def main():
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}"
    print(f"Flashcards rodando em {url}\nBanco local: {DB_PATH}\nPressione Ctrl+C para encerrar.")
    if os.environ.get("FLASHCARDS_NO_BROWSER") != "1":
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
