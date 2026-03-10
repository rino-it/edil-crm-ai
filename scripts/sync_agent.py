"""
sync_agent.py — Agent locale per la pipeline di sincronizzazione dati.

Gira in background sul PC dell'ufficio. Poll ogni 5s su Supabase per task
pending, li esegue in sequenza e scrive i risultati.

Uso:
  python scripts/sync_agent.py
  (oppure doppio click su run_sync_agent.bat)
"""

import os
import re
import sys
import json
import time
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

# Carica .env.local dalla root del progetto
ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / '.env.local')

from supabase import create_client, Client

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devono essere in .env.local")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

SCRIPTS_DIR = Path(__file__).resolve().parent
PYTHON = sys.executable  # usa lo stesso python del venv

STEPS = [
    {"name": "riconciliazione_xml",  "script": "riconciliazione_xml.py",  "args": ["--json"], "label": "Importazione XML Fornitori"},
    {"name": "import_fatture_pdf",   "script": "import_fatture_pdf.py",   "args": ["--json"], "label": "Associazione PDF Fatture"},
    {"name": "crea_scadenze_orfane", "script": "crea_scadenze_orfane.py", "args": ["--execute", "--json"], "label": "Creazione Scadenze Orfane"},
]

POLL_INTERVAL = 5  # secondi


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_json_result(stdout: str) -> dict:
    """Estrae il JSON dal marker ###JSON_RESULT### nello stdout dello script."""
    match = re.search(r'###JSON_RESULT###(.+)', stdout)
    if match:
        try:
            return json.loads(match.group(1))
        except Exception:
            pass
    return {}


def run_step(step: dict) -> dict:
    """Esegue uno script Python e ritorna il risultato."""
    script_path = SCRIPTS_DIR / step["script"]
    if not script_path.exists():
        return {
            "name": step["name"],
            "label": step["label"],
            "status": "error",
            "duration_ms": 0,
            "error": f"Script non trovato: {step['script']}",
        }

    start = time.time()
    try:
        result = subprocess.run(
            [str(PYTHON), str(script_path)] + step["args"],
            cwd=str(SCRIPTS_DIR),
            capture_output=True,
            text=True,
            timeout=180,  # 3 minuti per script
        )
        duration_ms = int((time.time() - start) * 1000)
        data = parse_json_result(result.stdout)

        if result.returncode != 0:
            return {
                "name": step["name"],
                "label": step["label"],
                "status": "error",
                "duration_ms": duration_ms,
                "data": data,
                "error": (result.stderr or result.stdout or "Exit code non zero")[-500:],
            }

        return {
            "name": step["name"],
            "label": step["label"],
            "status": "success",
            "duration_ms": duration_ms,
            "data": data,
        }
    except subprocess.TimeoutExpired:
        return {
            "name": step["name"],
            "label": step["label"],
            "status": "error",
            "duration_ms": int((time.time() - start) * 1000),
            "error": "Timeout (3 minuti superato)",
        }
    except Exception as e:
        return {
            "name": step["name"],
            "label": step["label"],
            "status": "error",
            "duration_ms": int((time.time() - start) * 1000),
            "error": str(e),
        }


def process_task(task: dict):
    task_id = task["id"]
    print(f"\n🚀 [{now_iso()}] Avvio task {task_id}")

    # Segna come running
    supabase.table("sync_tasks").update({
        "status": "running",
        "started_at": now_iso(),
    }).eq("id", task_id).execute()

    step_results = []
    try:
        for step in STEPS:
            print(f"  ▶ {step['label']}...")
            res = run_step(step)
            step_results.append(res)
            icon = "✅" if res["status"] == "success" else "❌"
            print(f"  {icon} {step['label']} — {res['duration_ms']}ms")

        all_success = all(r["status"] == "success" for r in step_results)

        supabase.table("sync_tasks").update({
            "status": "completed",
            "completed_at": now_iso(),
            "results": step_results,
        }).eq("id", task_id).execute()

        label = "COMPLETATO" if all_success else "COMPLETATO CON ERRORI"
        print(f"✅ Task {task_id} {label}")

    except Exception as e:
        print(f"❌ Errore fatale nel task {task_id}: {e}")
        supabase.table("sync_tasks").update({
            "status": "error",
            "completed_at": now_iso(),
            "results": step_results,
            "error": str(e),
        }).eq("id", task_id).execute()


def poll_once():
    """Cerca il primo task pending e lo esegue."""
    try:
        res = supabase.table("sync_tasks") \
            .select("id") \
            .eq("status", "pending") \
            .order("created_at") \
            .limit(1) \
            .execute()

        if res.data:
            process_task(res.data[0])
            return True
    except Exception as e:
        print(f"⚠️  Errore poll: {e}")
    return False


def main():
    print("=" * 50)
    print("  Edil CRM — Sync Agent")
    print(f"  Root: {ROOT}")
    print(f"  Python: {PYTHON}")
    print(f"  Poll interval: {POLL_INTERVAL}s")
    print("=" * 50)
    print("In ascolto per task di sincronizzazione... (Ctrl+C per fermare)\n")

    while True:
        try:
            found = poll_once()
            if not found:
                time.sleep(POLL_INTERVAL)
        except KeyboardInterrupt:
            print("\n🛑 Agent fermato.")
            sys.exit(0)


if __name__ == "__main__":
    main()
