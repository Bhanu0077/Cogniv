from pathlib import Path
import sqlite3

BASE_DIR = Path(__file__).resolve().parent.parent
DATABASE_FILE = BASE_DIR / "database" / "cogniv.db"
SCHEMA_FILE = BASE_DIR / "database" / "schema.sql"


def initialize_database():
    DATABASE_FILE.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(DATABASE_FILE)

    try:
        schema = SCHEMA_FILE.read_text(encoding="utf-8")
        connection.executescript(schema)

        connection.execute(
            """
            INSERT OR IGNORE INTO users
                (id, name, email)
            VALUES
                (1, 'Bhanu', 'bhanu@localhost')
            """
        )

        connection.commit()

    finally:
        connection.close()


if __name__ == "__main__":
    initialize_database()
    print(f"Database initialized: {DATABASE_FILE}")
