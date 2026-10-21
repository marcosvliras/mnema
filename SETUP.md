# Run Mnema on another computer

Mnema is a local Python server with a bundled HTML/CSS/JavaScript interface. Run the downloaded application; the GitHub repository page is not a hosted instance.

## Requirements

- **Python 3.11 or newer**, including its standard-library SQLite module. A current Python release from [python.org](https://www.python.org/downloads/) is recommended. On Linux, your distribution's Python 3 package normally includes SQLite; if the installation check reports otherwise, install that distribution's SQLite support for Python.
- A current desktop **Chrome, Edge, Firefox, or Safari** browser, with JavaScript enabled.
- A writable local folder containing the **whole repository**, including `data/` and `assets/`.

There are **no pip packages, Node.js/npm dependencies, build steps, Docker requirements, API keys, or paid services**. Git is needed only if you choose to clone/update through Git. Fonts and the included card images are bundled, so studying works without external font or image downloads. Speech depends on voices available on the device/browser; some browser voices require internet access.

## Get the project

Either use **Code → Download ZIP** on [GitHub](https://github.com/marcosvliras/mnema), then extract the entire ZIP, or run:

```sh
git clone https://github.com/marcosvliras/mnema.git
cd mnema
```

Do not download only `index.html`, run inside the ZIP, or copy just the Python files. This public repository includes its author's example/personal collections and progress. A fresh copy starts with those collections; it does not connect to the author's running app or private accounts. Keep your own copy for independent study.

## Start on macOS or Linux

Open a terminal in the extracted project folder:

```sh
python3 start.py --check
python3 start.py
```

Alternatively, `sh run.sh` starts the same launcher. If `python3` is unavailable but `python` is Python 3.11+, use `python start.py` instead. Install Python before retrying if neither command is available.

## Start on Windows

Install Python from [python.org](https://www.python.org/downloads/windows/) if needed, then open PowerShell or Command Prompt in the extracted project folder:

```powershell
py -3 start.py --check
py -3 start.py
```

If your installation provides `python` instead of `py`, use `python start.py --check` and `python start.py`. You can also run `run.bat` from Command Prompt, or `.\run.bat` in PowerShell. Use the terminal for the first launch so errors remain visible.

## Open and stop the app

The launcher validates collections and assets, creates a local SQLite database from the JSON files, prints the URL, and opens the browser. Normally the URL is **http://127.0.0.1:8765**. Keep the terminal running while studying; press **Ctrl+C** to stop.

The server resolves files relative to the project folder, so an agent can also launch it by its absolute path from another working directory. To prevent browser auto-opening, add `--no-browser`. To choose another port:

```sh
python3 start.py --port 8766
```

On Windows, use `py -3` or `python` in place of `python3`. Open the URL actually printed by the launcher. Settings and theme are remembered in each browser for that address; the initial theme is **Marinho**, and **Tema** switches between Marinho and Preto.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Python not found, Microsoft Store opens, or Python is too old | Install a current Python from python.org, reopen the terminal, and check `py -3 --version` or `python3 --version`. Use the command pointing to the new installation. |
| Missing Python module `sqlite3` | Install a complete Python distribution with SQLite support. Do not try `pip install sqlite3`. |
| Missing CSS, fonts, images, or JSON errors | Run `start.py --check` with your Python command. It identifies missing files, incorrect filename case, invalid JSON, and nonportable asset paths. Re-extract or restore the complete repository while preserving your existing `data/`. |
| Port is busy / address already in use | Check whether Mnema is already running at the printed address. Otherwise choose `--port 8766` or another free port. Do not stop unrelated processes. |
| Page loads but data is empty, or `/api/health` returns 404/HTML | Use the printed Mnema URL. Do not open `index.html` with `file://`, GitHub's preview, Live Server, or `python -m http.server`: those do not run Mnema's API. The `/api/health` URL should return JSON containing `"app": "mnema"`. |
| An old or different interface appears | Confirm the URL/port and checkout. Stop the old Mnema process and start this copy. Reload; use Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (macOS) if needed. Bundled assets revalidate after updates. |
| Appearance differs slightly | Compare the selected theme, browser zoom (100%), and window dimensions. Fonts and assets are bundled; operating systems can still differ in font rendering and native controls. Use a current browser. |
| No audio | Click the speaker button. macOS can use installed `say` voices; other systems use browser speech synthesis. Install/enable a voice for the studied language in the OS/browser if needed. Voice quality and availability vary; audio is optional for studying. |
| Cannot write the database or progress | Extract the project into a writable user folder. Do not run inside an archive or read-only application/system folder. |
| Agent cannot keep a background server alive | Launch it in a persistent terminal and keep that terminal open. A process stopped by the agent's execution timeout cannot serve the app. |

## Updating and keeping your study history

`data/` is the portable source of truth, including review history and local images. Keep that folder when moving to another computer. `flashcards.db`, speech caches, and Python caches are generated locally and are not needed in Git.

For an existing Git checkout, inspect `git status` first and preserve local work. Fetch and use `git pull --ff-only` only when it can proceed without losing local changes. Resolve divergent/local collection changes before updating; never reset them to install the app. Restart the server after code updates. Collection JSON edits sync automatically when the API reads them.

For your own remote backup, use a repository you control and choose its visibility deliberately. Do not push your changes back to the original author's repository unless asked and authorized.

## Instructions for an AI agent

Read [AGENTS.md](AGENTS.md), then [.agents/skills/mnema-setup/SKILL.md](.agents/skills/mnema-setup/SKILL.md). This skill is included in the clone/ZIP; it needs no plugin or global installation. Agents without automatic skill discovery can read that file directly.

Suggested request to give an agent with the GitHub link:

> Set up Mnema from https://github.com/marcosvliras/mnema on this computer. Read AGENTS.md and .agents/skills/mnema-setup/SKILL.md. Install any missing runtime, validate the full project, start the local server, and give me the working URL. Preserve any collections and study progress already here.

## Maintainer checks

```sh
python3 start.py --check
python3 -m unittest discover -s tests -v
```

The automated smoke tests launch an isolated fresh copy, with a new database and a path containing spaces/non-ASCII characters, and check the API, saved progress, styles, fonts, images, and startup failures. GitHub Actions runs them on Windows, macOS, and Linux with Python 3.11 and 3.14. They verify distribution/startup behavior; they do not guarantee pixel-identical rendering across browsers.
