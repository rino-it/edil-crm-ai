@echo off
cd /d "C:\Users\Ufficio\Desktop\PROGETTO X\Sviluppo\edil-crm-ai"
echo [%date% %time%] Avvio importazione XML >> riconciliazione_log.txt
python riconciliazione_xml.py >> riconciliazione_log.txt 2>&1
echo [%date% %time%] Fine importazione XML >> riconciliazione_log.txt
echo ---------------------------------------- >> riconciliazione_log.txt