# Instructions for AI agents

Mnema is agent-first: collect and curate flashcards in JSON files. Do not populate cards through the app UI or browser. Use a browser only to read a requested source when its content is not otherwise available.

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
      "part_of_speech": "verb",
      "meaning": "To keep money or resources for later use.",
      "source": "Preply"
    }
  ]
}
```

Each card must include the learned term under a language key matching `learning_language`. Include translations, a concise sense-specific meaning, and natural examples in the learned language. Add examples in other languages when useful and supported. Keep the same sense across the examples. Use UTF-8 and valid JSON.

## Backup and synchronization

The `data/` folder is the portable source of truth for both card content and review progress. Keep existing review metadata when editing a card. Before working on another computer, synchronize the repository; after adding cards or studying, commit and push the updated data files when the user requests a backup. Never push personal data to a public repository unless the user explicitly authorizes that specific public disclosure. If repository visibility or GitHub authentication prevents a sync, explain that clearly rather than claiming the backup was uploaded.

## After writing

- Re-read/parse the JSON you changed and summarize how many cards were added, skipped as duplicates, and which sources were used.
- Do not restart the server just to load changed JSON: Mnema syncs file collections as the app reads its API.
- Never commit `flashcards.db`; the portable JSON files are the backup format.
