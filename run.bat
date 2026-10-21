@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 (
    py -3 start.py %*
    exit /b
)
where python >nul 2>&1
if not errorlevel 1 (
    python start.py %*
    exit /b
)
echo Mnema needs Python 3.11 or newer: https://www.python.org/downloads/
exit /b 1
