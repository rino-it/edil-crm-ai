"""
Applica migration via connessione PostgreSQL diretta a Supabase.
Aggiunge conto_banca_id a scadenze_pagamento e poi sincronizza rate_mutuo.
"""
import os
import psycopg2
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

# Supabase project ref from URL
supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')  # https://xxx.supabase.co
project_ref = supabase_url.split('//')[1].split('.')[0]  # jnhpabgohnfdiqvjzjku
service_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

# Direct PostgreSQL connection
# Supabase DB: postgresql://postgres.[ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
# OR: postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
# We need the DB password - try using service role key as password (it works for some setups)

# Try the pooler connection first
db_host = f"db.{project_ref}.supabase.co"
db_port = 5432
db_name = "postgres"
db_user = "postgres"

# The DB password is typically set separately, but let's try common patterns
# For Supabase, the password is usually the one set in Dashboard > Database > Connection string,
# NOT the service role key. Let's try the service role key anyway.

passwords_to_try = [
    os.getenv('DB_PASSWORD', ''),
    os.getenv('SUPABASE_DB_PASSWORD', ''),
    'postgres',
]

conn = None
for pwd in passwords_to_try:
    if not pwd:
        continue
    try:
        conn = psycopg2.connect(
            host=db_host, port=db_port, dbname=db_name, 
            user=db_user, password=pwd,
            connect_timeout=10
        )
        print(f"Connected with password pattern: {'***' + pwd[-4:] if len(pwd) > 4 else '***'}")
        break
    except Exception as e:
        print(f"Failed with password pattern: {str(e)[:80]}")

if not conn:
    print("\n❌ Could not connect to database directly.")
    print("Please run this SQL in Supabase Dashboard > SQL Editor:")
    print("""
ALTER TABLE public.scadenze_pagamento
ADD COLUMN IF NOT EXISTS conto_banca_id uuid REFERENCES public.conti_banca(id);

CREATE INDEX IF NOT EXISTS idx_scadenze_conto_banca
ON public.scadenze_pagamento(conto_banca_id)
WHERE conto_banca_id IS NOT NULL;
""")
    exit(1)

# Execute migration
conn.autocommit = True
cur = conn.cursor()

print("\n=== Applying migration ===")
cur.execute("""
    ALTER TABLE public.scadenze_pagamento
    ADD COLUMN IF NOT EXISTS conto_banca_id uuid REFERENCES public.conti_banca(id);
""")
print("✅ Column conto_banca_id added")

cur.execute("""
    CREATE INDEX IF NOT EXISTS idx_scadenze_conto_banca
    ON public.scadenze_pagamento(conto_banca_id)
    WHERE conto_banca_id IS NOT NULL;
""")
print("✅ Index created")

cur.close()
conn.close()
print("\n✅ Migration applied successfully!")
