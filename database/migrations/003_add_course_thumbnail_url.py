from pathlib import Path
import sqlite3


BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATABASE_FILE = BASE_DIR / "database" / "cogniv.db"


def migrate():
    connection = sqlite3.connect(DATABASE_FILE)

    try:
        columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(courses)"
            ).fetchall()
        }

        if "thumbnail_url" not in columns:
            connection.execute(
                """
                ALTER TABLE courses
                ADD COLUMN thumbnail_url TEXT
                """
            )

            print("Added courses.thumbnail_url.")
        else:
            print("courses.thumbnail_url already exists.")

        connection.commit()

    finally:
        connection.close()


if __name__ == "__main__":
    migrate()
