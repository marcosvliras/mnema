# Mnema card data format

Mnema's durable card content is stored as JSON collections. AI agents should write these files directly; the app reads and syncs them automatically when its API is accessed. CSV remains an optional interchange format through the UI, but is not the main agent workflow.

## File layout

Create one file per deck:

```text
data/<context-slug>/<deck-slug>.json
```

Example: `data/english/airport.json` can describe context “English” and deck “Airport”. Use lowercase ASCII slugs with hyphens for filenames. The JSON fields carry the user-facing names.

## Schema

```json
{
  "schema_version": 1,
  "context": {
    "name": "English",
    "learning_language": "English"
  },
  "deck": "General",
  "source": "Preply",
  "cards": [
    {
      "terms": {
        "English": "save",
        "Portuguese": "poupar; economizar"
      },
      "examples": {
        "English": [
          "I save money every month.",
          "We saved enough for a trip."
        ],
        "Portuguese": [
          "Eu economizo dinheiro todo mês.",
          "Juntamos o suficiente para uma viagem."
        ]
      },
      "part_of_speech": "verb",
      "meaning": "To keep money or resources for later use.",
      "source": "Preply"
    }
  ]
}
```

### Fields

- `schema_version`: currently `1`.
- `context.name`: visible study context, generally the language being learned (English, Spanish, etc.).
- `context.learning_language`: language whose vocabulary is being learned in this context.
- `deck`: visible deck name, such as General, Phrasal Verbs, or Airport.
- `source`: optional collection-level origin; a card may override it with its own `source`.
- `cards`: array of flashcards.
- `terms`: map from language names to the equivalent term or phrase. Every card must contain a term for `learning_language`.
- `examples`: map from language names to arrays of natural example sentences. Prefer multiple examples for the learned term; examples should show the same sense as `meaning`.
- `part_of_speech`: optional class such as `verb`, `noun`, `adjective`, or `expression`.
- `meaning`: optional concise, sense-specific definition. This is stored with the card's notes.

## Deduplication rules for agents

Before adding a card, inspect all JSON files for the same context and compare the normalized learned term: ignore letter case and leading, trailing, or repeated whitespace. Language aliases such as English/inglês are treated as the same language by the app. A matching learned term is a duplicate even if it came from a different source or belongs to another deck. Do not add it again; report the existing deck and card. Enrich an existing card only when the user asks.

The app stores the same identity rule in SQLite as a final safeguard. On refresh, JSON is synchronized into SQLite by stable card identity. Content fields can be updated from JSON while study history (review counts, streaks, and timestamps) remains attached to the card.

## Source and examples

Sources may be Preply, user text, books, web research, or another requested origin. Use the source the user requested, and do not imply that an unverified item came from a source. Include examples in the language being learned; add translations in other languages when available. Keep each card focused on a single sense so the term and examples do not teach conflicting meanings.

## Optional CSV interchange

The in-app importer also accepts CSV/TSV. Use one row per card, language names as term columns, and headers like `example English 1`, `example English 2`, `example Portuguese 1`. Optional columns include `part_of_speech`, `meaning`, and `notes`. CSV is convenient for ad hoc transfer; for agent-managed collections, write the JSON file so it is versioned and automatically synced.
