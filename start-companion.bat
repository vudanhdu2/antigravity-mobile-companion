@echo off
chcp 65001 >nul
title Antigravity Mobile Companion - Self-Hosted (100% Privacy)
cd /d "%~dp0"
echo ========================================================================
echo   ANTIGRAVITY MOBILE COMPANION - TU HOST BAO MAT 100%% TREN PC CUA BAN
echo ========================================================================
where python >nul 2>&1
if %errorlevel% equ 0 (
    python companion_server.py --tunnel
    goto :eof
)
if exist "%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe" (
    "%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe" companion_server.py --tunnel
    goto :eof
)
echo [!] Vui long cai dat Python 3.9+ tu https://www.python.org/downloads/
pause
