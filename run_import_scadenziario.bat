@echo off
echo Avvio Sincronizzazione Excel -> Supabase...
cd /d "%~dp0\scripts"
call ..\.venv\Scripts\activate
python import_scadenziario.py
echo.
pause