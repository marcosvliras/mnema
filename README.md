# Mnema

A personal space for learning languages with flashcards, organized and updated by an AI agent.

The name comes from *Mnemosyne*, the Greek figure associated with memory and the origin of the word “mnemonic.” Mnema helps you keep new words in mind and recall them when you need them.

## Run on your computer

Download and extract the **whole repository**, or clone it with Git. You need **Python 3.11+ with SQLite** and a current browser. There are no pip/npm packages or build steps. Styles, fonts, and the included images are bundled.

On **macOS/Linux**, open a terminal in the project folder:

```sh
python3 start.py --check
python3 start.py
```

On **Windows**, use PowerShell or Command Prompt in the project folder:

```powershell
py -3 start.py --check
py -3 start.py
```

If Windows provides `python` instead of `py`, use `python start.py`. The app opens at **http://127.0.0.1:8765**; keep the terminal running. Do not open `index.html` directly or use a generic static server.

See [SETUP.md](SETUP.md) for Python installation, ZIP downloads, alternative commands, audio support, and troubleshooting. To let an AI agent do the setup, give it this repository URL and ask it to read `AGENTS.md` and `.agents/skills/mnema-setup/SKILL.md`.

## How to use it

You do not need to configure folders, edit files, or understand how cards are stored. Talk to an AI agent: ask it to set up Mnema on this computer, organize your studies, find words, and open the app for you.

### Organize your studies

Create a study context for each language you are learning. Add as many decks as you like inside each context:

- **English**: General, Airport, Phrasal Verbs
- **Spanish**: General, Travel, Restaurant

Each deck keeps its own review progress and statistics.

### Choose where your words come from

Ask the agent to work with whichever source makes sense:

- your Preply flashcards;
- a list you paste into the conversation;
- words or expressions you find online;
- a topic, such as “travel vocabulary.”

Before adding cards, the agent checks what is already in your study context. If a word is already there, it tells you and skips it instead of creating a duplicate. New cards can include translations, meanings, parts of speech, and natural usage examples.

### Study your way

Open a deck, choose which language appears on the front and which appears on the back, then start reviewing. Each session starts with 10 cards; change it to 20, 30, or 50 whenever you like. Study as often as you want. Mark each card **I know it** or **I don't know it yet**, and track your progress for that deck.

## Example requests

> Set up Mnema on this computer and open the app for me. I want to study English.

> In my English context, create the General and Airport decks. Read my Preply cards and add only words that are not already in my collection. Add meanings and usage examples to the new cards.

> Add these words to my English Phrasal Verbs deck. Check whether they already exist first; tell me about duplicates instead of adding them again.

> I want to start learning Spanish. Create that context with General and Travel decks, then make cards for these words.

> Use `$contextual-language-study` to create a lesson about airports in English. Prioritize these words: boarding pass, layover, and gate.

## Your data

Mnema stores your decks as JSON files in the repository's `data/` folder. Review progress is saved with each card, so the collection can be backed up and moved with the project. If you use a public copy of this repository, anything committed to `data/` is visible to everyone; use a private repository for personal collections you do not want to share. Ask your AI agent to sync the repository before and after making changes on another computer.

## For AI agents

Start with [AGENTS.md](AGENTS.md) and the included [mnema-setup skill](.agents/skills/mnema-setup/SKILL.md). Installation commands and troubleshooting are in [SETUP.md](SETUP.md). The data format is documented in [IMPORT_FORMAT.md](IMPORT_FORMAT.md).
