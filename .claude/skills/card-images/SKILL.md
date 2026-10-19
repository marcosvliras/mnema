---
name: card-images
description: Adds illustrations to Mnema flashcards, but only for words an image can actually show (concrete objects, places, animals, food, vehicles, weather, clear physical actions), and skips abstract or function words. Use this whenever the user asks to add, create, generate or review images/pictures/illustrations for cards or a deck in this repo, asks which words "deserve" an image, or adds new cards to a deck that already uses images, even if they don't say "skill".
---

# Card images for Mnema

Mnema shows a card with an image in a special layout: the picture fills the card, with the word on top of it. An image only helps memory when someone could guess the word from the picture alone. A picture for *integrity* or *whatsoever* just adds noise and teaches the wrong association. So the job here has two halves. First decide which cards get an image. Then draw those images in one consistent style.

Read `AGENTS.md` first. Its rules still apply: preserve card content and review progress, keep the JSON valid, and report what changed.

## 1. Choose the cards

Work from the deck file the user names (for example `data/english/general.json`). If they don't name one, ask which deck. For each card, read the learned term **and its examples**, because the examples fix the sense. *Ship* in "They will ship the order tomorrow" is a verb about sending, not a boat.

Give a card an image only when all of these are true:

- **Picturable:** the sense used in the examples is a visible thing, place, creature, food, vehicle, weather or body part. A clear physical action or state also counts (*squinting*, *boiling*, *sweat*).
- **Guessable:** a learner seeing only the picture would land on this word or a very close synonym. *Gloves* passes. *Equipment* fails, because a picture of gear reads as "tools" or "backpack".
- **One sense:** if the examples mix senses (*track*: footprints, shipment tracking and a running track), only draw it when one dominant sense is clearly pictured. Otherwise skip it.

Skip these, even when some image is technically possible:

- abstract nouns (*integrity, controversy, adversity*);
- function words, adverbs and connectors (*whatsoever, likewise, otherwise, roughly*);
- most phrasal verbs and idioms whose meaning isn't literal (*sleep on it, hold back, drop out*);
- feelings and judgments (*reluctant, naive, appealing*);
- words where the picture would give away a translation trick instead of the meaning.

When in doubt, skip. A missing image costs nothing; a misleading one costs the learner.

Present the decision **before drawing anything**, as a short table:

- **Will get an image:** term and what the picture will show.
- **Borderline:** term and why it's doubtful.
- **Skipped:** the count, with a few examples.

Then wait for the user's go-ahead. They know their vocabulary, and this step is cheap to redo.

## 2. Draw the images

Each image is a hand-written SVG file. The agent draws it, so nothing is downloaded and there's no licence to track. Use this style so a deck looks like one set:

- `viewBox="0 0 400 260"` (landscape), and no `width`/`height`, so it scales to the card.
- A full-bleed flat background (sky, room, street, table) that fills the whole frame, because the app shows it edge to edge behind the word. Keep the bottom third calm and fairly dark or plain, since the word is drawn over it.
- Flat shapes, no gradients beyond a simple two-stop background, no outlines thicker than 4px.
- Palette: navy `#0A1F44`, blue `#2E6BFF`, sky `#9EC2FF`/`#E4EEFF`, red `#E5484D`, green `#5DB874`/`#8FD19E`, amber `#F5A524`, sun `#FFE29A`, white.
- The subject sits in the upper two-thirds, large and centred, and is recognisable at 120px wide.
- **No text, letters or numbers inside the image.** They would give the answer away on the front of the card.
- No `<script>`, no external references, no embedded raster images, under about 15 KB.

Save each file to `data/<context-slug>/images/<deck-slug>/<term-slug>.svg`, for example `data/english/images/general/helicopter.svg`. The slug is lowercase ASCII with hyphens.

## 3. Write the card field

Add an `image` field to the card, holding the path relative to the project root:

```json
"image": "data/english/images/general/helicopter.svg"
```

Only add or change `image` on the approved cards. Leave every other field, and every card without an image, exactly as it was. Write the deck file back as UTF-8 with 2-space indentation.

## 4. Check and report

1. Parse the JSON again. Then check that every `image` path exists, that each file starts with `<svg` and has the 400×260 viewBox, and that none contains `<text` or `<script`.
2. Mnema picks up file changes on its next API read, so there's no need to restart the server.
3. Report how many cards got images, which ones were skipped as borderline, and the total size of the new files.
