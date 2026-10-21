# Instructions for AI agents

Mnema is agent-first: collect and curate flashcards in JSON files. Do not populate cards through the app UI or browser. Use a browser only to read a requested source when its content is not otherwise available.

## Setup, launch, and troubleshooting

- For a new computer or startup/interface problem, read [SETUP.md](SETUP.md) and the repository's [mnema-setup skill](.agents/skills/mnema-setup/SKILL.md). The skill is included for other agents to read directly, even without automatic skill discovery.
- Require Python 3.11+ with SQLite and a current browser. No pip/npm dependencies or build step are needed. Keep the whole checkout, including local fonts in `assets/` and collection images in `data/`.
- Validate with `python3 start.py --check`, then launch `python3 start.py` (Windows: `py -3 start.py` or `python start.py`). Use the printed HTTP URL and keep the server process alive. Do not open the HTML directly or start a generic static server.
- Check `/api/health`, API data, and static assets through HTTP. Diagnose the running checkout, port, missing files, cache, and theme before changing the interface. Preserve existing collections and review progress throughout setup.

## Before changing cards

- Read this file and the relevant files in `data/`.
- Confirm the target study context (language being learned) and deck.
- Use only sources requested or approved by the user. Cite the source in each card's `source` field or collection's `source`.
- Preserve existing card content and review progress. Do not replace a collection with a partial import.

## Deduplication

A card's identity is the normalized term in the context's `learning_language`, scoped to the context. Search all decks and sources within that context before adding. Comparison should ignore case, repeated/leading/trailing whitespace, and common language-name aliases. If the term already exists, do not add it again; tell the user which existing card/deck matched. Do not treat a new translation or example as a new card; only update an existing card when the user requests enrichment.

## Writing cards

Write directly to `data/<context-slug>/<deck-slug>.json`. Create parent directories and a file if needed. Follow this schema:

```json
{
  "schema_version": 1,
  "context": { "name": "English", "learning_language": "English" },
  "deck": "General",
  "source": "Preply",
  "cards": [
    {
      "terms": { "English": "save", "Portuguese": "poupar; economizar" },
      "examples": {
        "English": ["I save money every month.", "She saved enough for a trip."],
        "Portuguese": ["Eu economizo dinheiro todo mês.", "Ela juntou o bastante para uma viagem."]
      },
      "pronunciation": "/seɪv/",
      "part_of_speech": "verb",
      "meaning": "To keep money or resources for later use.",
      "source": "Preply"
    }
  ]
}
```

Each card must include the learned term under a language key matching `learning_language`. Include translations, the IPA pronunciation of the learned term (`pronunciation`, American English for English), a concise sense-specific meaning, and natural examples in the learned language. Add examples in other languages when useful and supported. Keep the same sense across the examples. Use UTF-8 and valid JSON.

## Backup and synchronization

The `data/` folder is the portable source of truth for both card content and review progress. Keep existing review metadata when editing a card. Before working on another computer, synchronize the repository; after adding cards or studying, commit and push the updated data files when the user requests a backup. Never push personal data to a public repository unless the user explicitly authorizes that specific public disclosure. If repository visibility or GitHub authentication prevents a sync, explain that clearly rather than claiming the backup was uploaded.

## After writing

- Re-read/parse the JSON you changed and summarize how many cards were added, skipped as duplicates, and which sources were used.
- Do not restart the server just to load changed JSON: Mnema syncs file collections as the app reads its API.
- Never commit `flashcards.db`; the portable JSON files are the backup format.
