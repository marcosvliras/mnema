#!/bin/sh
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
    exec python3 start.py "$@"
elif command -v python >/dev/null 2>&1; then
    exec python start.py "$@"
fi
echo "Mnema needs Python 3.11 or newer: https://www.python.org/downloads/" >&2
exit 1
