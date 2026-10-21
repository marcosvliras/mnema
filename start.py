#!/usr/bin/env python3
"""Portable Mnema launcher and read-only installation check (no pip dependencies)."""
import sys

if sys.version_info < (3, 11):
    print("Mnema needs Python 3.11 or newer. Download it at https://www.python.org/downloads/", file=sys.stderr)
    raise SystemExit(1)

import argparse
import json
import os
from html.parser import HTMLParser
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent


class AssetParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and attrs.get("src"):
            self.urls.append(attrs["src"])
        if tag == "link" and attrs.get("rel") in ("stylesheet", "preload", "icon"):
            self.urls.append(attrs["href"])


def local_asset(root, url, base=None):
    """Resolve portable paths and catch case mismatches even on macOS/Windows."""
    parsed = urlsplit(url)
    if parsed.scheme or parsed.netloc:
        raise ValueError(f"Expected a bundled local asset, found: {url}")
    relative = unquote(parsed.path)
    if "\\" in relative:
        raise ValueError(f"Use forward slashes in asset paths: {url}")
    # realpath/resolve can canonicalize filename case on Windows and hide a mismatch.
    path = Path(os.path.abspath((root if relative.startswith("/") else base or root) / relative.lstrip("/")))
    try:
        parts = path.relative_to(root.resolve()).parts
    except ValueError:
        raise ValueError(f"Asset is outside the project: {url}") from None
    parent = root
    for part in parts:
        if not parent.is_dir() or part not in {p.name for p in parent.iterdir()}:
            raise ValueError(f"Missing asset or incorrect filename case: {url}")
        parent = parent / part
    if not path.is_file():
        raise ValueError(f"Missing asset: {url}")
    return path


def check_project(root=ROOT):
    """Validate the distributed files without opening or modifying the local database."""
    import sqlite3

    with sqlite3.connect(":memory:") as db:
        db.execute("SELECT 1")
    for filename in ("server.py", "index.html", "styles.css", "themes.css", "theme.js", "app.js"):
        local_asset(root, filename)
    parser = AssetParser()
    parser.feed((root / "index.html").read_text(encoding="utf-8"))
    assets = {local_asset(root, url) for url in parser.urls}
    for css in list(assets):
        if css.suffix == ".css":
            for url in re.findall(r"url\(\s*['\"]?([^)'\"\s]+)['\"]?\s*\)", css.read_text(encoding="utf-8")):
                if not url.startswith("data:"):
                    assets.add(local_asset(root, url, css.parent))
    cards = 0
    images = set()
    for path in sorted((root / "data").rglob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict) or payload.get("schema_version") != 1:
                raise ValueError("expected schema_version 1")
            context = payload.get("context") or {}
            if not context.get("name") or not context.get("learning_language"):
                raise ValueError("missing context name or learning_language")
            collection = payload.get("cards")
            if not isinstance(collection, list):
                raise ValueError("cards must be a list")
            for card in collection:
                if not isinstance(card, dict) or not isinstance(card.get("terms"), dict):
                    raise ValueError("each card must contain terms")
                if card.get("image"):
                    images.add(local_asset(root, card["image"]))
            cards += len(collection)
        except (ValueError, TypeError, AttributeError) as exc:
            raise ValueError(f"{path.relative_to(root)}: {exc}") from exc
    return cards, len(images), len(assets)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Start Mnema locally; no packages or build step required.")
    parser.add_argument("--check", action="store_true", help="validate Python, SQLite, collections and bundled assets, then exit")
    parser.add_argument("--no-browser", action="store_true", help="keep running without opening a browser")
    parser.add_argument("--port", type=int, default=os.environ.get("PORT", "8765"), help="local port (default: PORT or 8765)")
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    try:
        cards, images, assets = check_project()
    except ImportError as exc:
        print(f"Missing Python module: {exc}. Install a full Python distribution with SQLite support.", file=sys.stderr)
        return 1
    except (OSError, ValueError) as exc:
        print(f"Installation check failed: {exc}\nSee SETUP.md. Restore the missing files from the repository; keep your data/ folder.", file=sys.stderr)
        return 1
    print(f"Installation OK: {cards} cards, {images} images, {assets} interface assets.", flush=True)
    if args.check:
        return 0
    os.environ["PORT"] = str(args.port)
    if args.no_browser:
        os.environ["FLASHCARDS_NO_BROWSER"] = "1"
    import sqlite3

    try:
        import server

        server.main()
    except (OSError, sqlite3.Error) as exc:
        print(f"Could not start Mnema: {exc}\nIf port {args.port} is busy, try --port {args.port + 1 if args.port < 65535 else 8765}. Keep the project in a writable folder.", file=sys.stderr)
        return 1
    except (ValueError, ImportError) as exc:
        print(f"Could not start Mnema: {exc}. See SETUP.md.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
