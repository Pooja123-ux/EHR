import psycopg2
import urllib.parse
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from app.core.config import settings

url = settings.DATABASE_URL.replace('postgresql://', '')
creds, rest = url.split('@', 1)
user, password = creds.split(':', 1)
password = urllib.parse.unquote(password)
hostport, dbname = rest.split('/', 1)
parts = hostport.split(':')
host = parts[0]
port = parts[1] if len(parts) > 1 else '5432'

conn = psycopg2.connect(host=host, port=port, dbname=dbname, user=user, password=password)
conn.autocommit = True
cur = conn.cursor()

migrations = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS hospital_id INTEGER REFERENCES hospitals(hospital_id)",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS hospital_id INTEGER",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS department VARCHAR(100)",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS visit_type VARCHAR(50) DEFAULT 'In-Person'",
    "ALTER TABLE lab_reports ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Requested'",
    "ALTER TABLE lab_reports ADD COLUMN IF NOT EXISTS doctor_notes TEXT",
    "ALTER TABLE doctors ADD COLUMN IF NOT EXISTS hospital_id INTEGER",
    "ALTER TABLE laboratories ADD COLUMN IF NOT EXISTS hospital_id INTEGER REFERENCES hospitals(hospital_id)",
    # consent_sharing: drop FK on record_id so lab report IDs can be stored
    "ALTER TABLE consent_sharing DROP CONSTRAINT IF EXISTS consent_sharing_record_id_fkey",
    "ALTER TABLE consent_sharing ALTER COLUMN record_id DROP NOT NULL",
    "ALTER TABLE consent_sharing ADD COLUMN IF NOT EXISTS lab_report_id INTEGER",
    "ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS report_type VARCHAR(50)",
]

for sql in migrations:
    cur.execute(sql)
    print(f"OK: {sql}")

for table in ['users', 'appointments', 'consent_sharing', 'lab_reports', 'doctors']:
    cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name='{table}' ORDER BY ordinal_position")
    cols = [r[0] for r in cur.fetchall()]
    print(f"\n{table} columns: {cols}")
conn.close()
