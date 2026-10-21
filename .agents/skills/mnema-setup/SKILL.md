---
name: mnema-setup
description: Install, validate, launch, update, or troubleshoot a local Mnema checkout on Windows, macOS, or Linux. Use when setting up Mnema from its GitHub link or fixing missing styles, images, or startup problems.
---

# Set up Mnema

Work in the target Mnema repository. Read its root `AGENTS.md` and `SETUP.md`; the latter is the canonical source for commands, requirements, and troubleshooting. This skill travels with the repository and needs no global installation or additional agent tooling.

## Installation

- For a new installation, clone the whole requested repository or extract the complete GitHub ZIP. Preserve existing work if a checkout is already present; do not overwrite `data/` or reset Git history. The public checkout includes the author's collections and review history; do not silently remove or reset them for a new user.
- Find a working Python **3.11+ with SQLite**: `python3` on macOS/Linux, `py -3` or `python` on Windows. Check its version. If missing, install a current Python through the OS's normal installer/package manager within the user's permissions, or identify the exact installer action still needed. No `pip install`, npm, Docker, API key, or database download is required.
- Run `<python> start.py --check`. It checks SQLite, collection JSON, styles/scripts, local fonts, and card images without touching review progress or the local database. Repair missing runtime/files before launch; do not regenerate the interface, replace themes, or substitute images to make an incomplete download appear usable.

## Launch and verify

- Start `<python> start.py` in a persistent terminal or a supported background session; add `--no-browser` when opening the URL yourself. Paths may contain spaces and accented characters: quote them. `run.sh` and `run.bat` are equivalent wrappers.
- Keep the process alive. Use its printed URL, normally `http://127.0.0.1:8765`. If the port is occupied, check for an existing Mnema instance or pass `--port 8766`; do not terminate unrelated processes. Do not bind to a public/network address for ordinary local setup.
- Read `<url>/api/health` and confirm `app` is `mnema` and `status` is `ok`. Check `/api/structure` and `/api/cards` against the local collections, and check HTTP responses for `styles.css`, `themes.css`, `assets/fonts/fonts.css`, its font files, and referenced card images. Respect `AGENTS.md`'s browser restriction; HTTP requests suffice to verify these resources. Do not populate cards through the UI.
- Open or provide that URL once the server works. Opening `index.html` directly, a GitHub preview, Live Server, or a generic static server cannot run the API. Diagnose an unexpected interface by checking the exact running checkout/port, asset responses, cache, theme, zoom, and viewport before editing CSS.
- macOS native speech is optional; Windows/Linux use browser voices. Voice availability/quality depends on the device. A missing native `say` executable is not an installation failure and does not require installing a macOS tool on other systems.

## Updates and handoff

For an update, inspect Git status, preserve local changes and portable JSON review metadata, and prefer a fast-forward update when possible. Restart for code changes, not for ordinary collection edits. Do not copy or commit `flashcards.db` or generated caches. A third-party user's study changes belong to their chosen backup destination; installation does not authorize pushing to the upstream author's account.

Report the exact working URL, how to stop/restart the server, whether validation passed, and any remaining platform limitation. If the process could not remain running or a dependency could not be installed, say so explicitly rather than reporting the app as ready.
