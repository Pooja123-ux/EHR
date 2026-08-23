from sqlalchemy import text
from app.core.database import engine
from app.models.models import Hospital

Hospital.__table__.create(engine, checkfirst=True)
print("ensured hospitals table exists")

with engine.begin() as conn:
    row = conn.execute(
        text("SELECT column_name FROM information_schema.columns WHERE table_name='doctors' AND column_name='hospital_id'")
    ).first()
    print("hospital_id exists:", row is not None)
    if row is None:
        conn.execute(text("ALTER TABLE doctors ADD COLUMN hospital_id INTEGER REFERENCES hospitals(hospital_id)"))
        print("added hospital_id column to doctors")
    else:
        print("hospital_id column already exists on doctors")
