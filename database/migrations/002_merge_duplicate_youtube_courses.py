import sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]
DATABASE_FILE = BASE_DIR / "database" / "cogniv.db"


def merge_duplicates():
    db = sqlite3.connect(DATABASE_FILE)
    db.execute("PRAGMA foreign_keys = ON")

    try:
        duplicates = db.execute("""
            SELECT
                user_id,
                youtube_playlist_id,
                COUNT(*) AS course_count
            FROM courses
            WHERE youtube_playlist_id IS NOT NULL
            GROUP BY user_id, youtube_playlist_id
            HAVING COUNT(*) > 1
        """).fetchall()

        if not duplicates:
            print("No duplicate YouTube courses found.")
            return

        for user_id, playlist_id, _ in duplicates:

            courses = db.execute("""
                SELECT id, title, source
                FROM courses
                WHERE user_id = ?
                  AND youtube_playlist_id = ?
                ORDER BY id ASC
            """, (user_id, playlist_id)).fetchall()

            canonical_id = courses[0][0]

            print(
                f"\nPlaylist: {playlist_id}"
            )
            print(
                f"Keeping course: {canonical_id}"
            )

            for duplicate_id, title, source in courses[1:]:

                print(
                    f"Merging duplicate course: {duplicate_id}"
                )

                duplicate_lessons = db.execute("""
                    SELECT
                        id,
                        title,
                        video_url,
                        duration_seconds,
                        position
                    FROM lessons
                    WHERE course_id = ?
                    ORDER BY position, id
                """, (duplicate_id,)).fetchall()

                for (
                    lesson_id,
                    title,
                    video_url,
                    duration_seconds,
                    position
                ) in duplicate_lessons:

                    # Look for the same video in the canonical course.
                    existing = db.execute("""
                        SELECT id
                        FROM lessons
                        WHERE course_id = ?
                          AND video_url = ?
                        LIMIT 1
                    """, (
                        canonical_id,
                        video_url
                    )).fetchone()

                    if existing:
                        canonical_lesson_id = existing[0]

                        # Preserve progress from duplicate lesson
                        # if canonical lesson has no progress.
                        progress_rows = db.execute("""
                            SELECT
                                user_id,
                                watched_seconds,
                                completed,
                                updated_at
                            FROM progress
                            WHERE lesson_id = ?
                        """, (lesson_id,)).fetchall()

                        for (
                            progress_user_id,
                            watched_seconds,
                            completed,
                            updated_at
                        ) in progress_rows:

                            existing_progress = db.execute("""
                                SELECT id
                                FROM progress
                                WHERE user_id = ?
                                  AND lesson_id = ?
                            """, (
                                progress_user_id,
                                canonical_lesson_id
                            )).fetchone()

                            if not existing_progress:
                                db.execute("""
                                    INSERT INTO progress
                                    (
                                        user_id,
                                        lesson_id,
                                        watched_seconds,
                                        completed,
                                        updated_at
                                    )
                                    VALUES (?, ?, ?, ?, ?)
                                """, (
                                    progress_user_id,
                                    canonical_lesson_id,
                                    watched_seconds,
                                    completed,
                                    updated_at
                                ))

                    else:
                        # Move unique lesson into canonical course.
                        db.execute("""
                            UPDATE lessons
                            SET course_id = ?
                            WHERE id = ?
                        """, (
                            canonical_id,
                            lesson_id
                        ))

                # Delete the now-empty duplicate course.
                db.execute("""
                    DELETE FROM courses
                    WHERE id = ?
                """, (duplicate_id,))

        db.commit()

        print("\nDuplicate merge completed successfully.")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    merge_duplicates()
