@echo off
echo Avvio Sync Excel MAIN -> Supabase...
cd /d "%~dp0\scripts"
call ..\.venv\Scripts\activate
python sync_excel_supabase.py
echo.
pause
