@echo off
echo ============================================================
echo   SYNC EXCEL -^> SUPABASE  v2
echo   Fonte: REPORT XML + MAIN
echo   Modalita: Insert nuove + Update saldi esistenti
echo ============================================================
echo.

cd /d "%~dp0\scripts"
call ..\.venv\Scripts\activate

:: Usa --dry-run per test sicuro senza scrivere sul DB
:: Per esecuzione reale, rimuovi --dry-run oppure lancia run_sync_live.bat
python sync_excel_supabase.py %*

echo.
pause
