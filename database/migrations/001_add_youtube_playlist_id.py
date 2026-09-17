import sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]
DATABASE_FILE = BASE_DIR / "database" / "cogniv.db"


def migrate():
    db = sqlite3.connect(DATABASE_FILE)

    try:
        # Add the column only if it doesn't already exist.
        columns = db.execute(
            "PRAGMA table_info(courses)"
        ).fetchall()

        column_names = {column[1] for column in columns}

        if "youtube_playlist_id" not in column_names:
            db.execute(
                """
                ALTER TABLE courses
                ADD COLUMN youtube_playlist_id TEXT
                """
            )

            print("Added youtube_playlist_id column.")
        else:
            print("youtube_playlist_id column already exists.")

        # Populate playlist IDs for existing YouTube courses.
        courses = db.execute(
            """
            SELECT id, source
            FROM courses
            WHERE source LIKE '%youtube.com/playlist?list=%'
            """
        ).fetchall()

        for course_id, source in courses:
            if not source:
                continue

            marker = "list="

            if marker not in source:
                continue

            playlist_id = source.split(marker, 1)[1].split("&", 1)[0]

            if playlist_id:
                db.execute(
                    """
                    UPDATE courses
                    SET youtube_playlist_id = ?
                    WHERE id = ?
                    """,
                    (playlist_id, course_id)
                )

        db.commit()

        print("Existing YouTube playlist IDs populated.")

        # Show current values for verification.
        rows = db.execute(
            """
            SELECT
                id,
                title,
                youtube_playlist_id
            FROM courses
            WHERE youtube_playlist_id IS NOT NULL
            ORDER BY id
            """
        ).fetchall()

        print("\nYouTube courses:")
        for row in rows:
            print(row)

    finally:
        db.close()


if __name__ == "__main__":
    migrate()
