@echo off
title Edil CRM - Sync Agent
cd /d "%~dp0"
echo ============================================
echo   Edil CRM - Sync Agent
echo   Ctrl+C per fermare
echo ============================================
echo.
.venv\Scripts\python.exe scripts\sync_agent.py
pause
