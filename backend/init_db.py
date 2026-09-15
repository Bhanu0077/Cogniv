import sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DATABASE_DIR = BASE_DIR / "database"
DATABASE_FILE = DATABASE_DIR / "cogniv.db"
SCHEMA_FILE = DATABASE_DIR / "schema.sql"


def initialize_database():
    DATABASE_DIR.mkdir(exist_ok=True)

    connection = sqlite3.connect(DATABASE_FILE)

    with open(SCHEMA_FILE, "r", encoding="utf-8") as file:
        schema = file.read()

    connection.executescript(schema)
    connection.commit()
    connection.close()

    print("Cogniv database initialized successfully.")
    print(f"Database: {DATABASE_FILE}")


if __name__ == "__main__":
    initialize_database()
