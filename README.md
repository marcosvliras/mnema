# Mnema

**Mnema** is a local-first, agent-ready flashcard app for language learning. The name comes from *Mnemosyne*, the Greek figure associated with memory and the origin of “mnemonic.” AI agents are the intended way to build and maintain a collection: they research or receive words, check for duplicates, write cards directly to JSON, and Mnema presents them for review.

## Run locally

Requires Python 3. No package installation or external database is needed.

### macOS / Linux

```sh
./run.sh
```

### Windows

```powershell
py server.py
```

Open <http://127.0.0.1:8765>. Stop the server with Ctrl+C. Set `PORT=9000` (macOS/Linux) or `$env:PORT=9000` (PowerShell) to use a different port.

The server binds to localhost by default. To use Mnema from another device on the same trusted network, start it with `FLASHCARDS_HOST=0.0.0.0` (PowerShell: `$env:FLASHCARDS_HOST='0.0.0.0'`) and open `http://<computer-local-IP>:8765` on that device. This exposes the app to the local network; do not expose it directly to the public internet.

## The agent-first workflow

The app is the study interface. **Agents are the content workflow:** an agent can use any source the user requests—Preply, a pasted list, a book, a website, or research—and write the resulting cards straight into JSON. Browser automation is useful only when needed to read a source that requires an authenticated browser session. It is not needed to enter cards into Mnema.

1. Read [AGENTS.md](AGENTS.md) and the existing JSON files under `data/`.
2. Identify the study context (the language being learned) and deck (for example, `English/General` or `English/Airport`).
3. Check existing cards in that context for the same learned-language term before adding anything. Duplicate identity is the normalized term + learning language + context, across sources and decks. Report duplicates instead of adding a second card.
4. Add only new cards to `data/<context-slug>/<deck-slug>.json`, preserving the existing schema and cards.
5. Refresh Mnema. The server syncs JSON content on API reads, so new or edited cards appear without restarting it. Review progress remains in the local SQLite database and is not overwritten by JSON sync.

Agents should not use the app's manual entry or import UI to populate the collection. JSON files are the durable content source and can be reviewed, versioned, and moved with the project. Mnema's interface is for studying and managing the local review experience.

## Organizing a collection

Each study context represents a language being learned, such as English or Spanish. Each context contains any number of decks, such as General, Phrasal Verbs, Airport, or Road Trips. Store one collection per deck:

```text
data/
  english/
    general.json
    airport.json
  spanish/
    general.json
```

The context name and learning language are stored in each file. Deck names do not need to match the filename exactly.

## Card format

See [IMPORT_FORMAT.md](IMPORT_FORMAT.md) for the JSON schema and complete field descriptions. A compact example:

```json
{
  "schema_version": 1,
  "context": { "name": "English", "learning_language": "English" },
  "deck": "General",
  "source": "user-provided list",
  "cards": [
    {
      "terms": { "English": "save", "Portuguese": "poupar; economizar" },
      "examples": {
        "English": ["I save money every month."],
        "Portuguese": ["Eu economizo dinheiro todo mês."]
      },
      "part_of_speech": "verb",
      "meaning": "To keep money or resources for later use."
    }
  ]
}
```

Add useful, natural examples in the studied language and translations where available. A term can have multiple senses; keep each card focused on one sense and use its examples to make that sense clear.

## Local data and portability

Mnema stores study progress and app state in `flashcards.db` (SQLite) on the computer running the server. The database and all `data/**/*.json` personal card collections are ignored by Git, so they cannot accidentally be published with this public project. To carry review progress to another computer, copy `flashcards.db` with Mnema closed; to carry just the collection, copy the `data/` files or keep them in a separate private repository.

A public code repository should contain generic example content only. Keep personal collections and review databases out of public commits.

## Study sessions

A deck starts with a 10-card package. Use its three-dot menu to choose 20, 30, or 50 cards. Mark a card “Já sei” or “Ainda não sei” as often as you like; no due date blocks another session. Review totals and correct answers are tracked per deck.
