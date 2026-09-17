from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATABASE_FILE = BASE_DIR / "database" / "cogniv.db"

app = Flask(__name__)
CORS(app)


def get_db():
    connection = sqlite3.connect(DATABASE_FILE)
    connection.row_factory = sqlite3.Row
    return connection


# ============================================
# BASIC
# ============================================

@app.route("/")
def home():
    return jsonify({
        "project": "Cogniv",
        "status": "running"
    })


@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "backend": "online"
    })


# ============================================
# DATABASE
# ============================================

@app.route("/api/database")
def database_test():

    try:
        db = get_db()

        result = db.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type='table'
            ORDER BY name
            """
        ).fetchall()

        db.close()

        return jsonify({
            "status": "ok",
            "database": "connected",
            "tables": [row["name"] for row in result]
        })

    except Exception as error:

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500


# ============================================
# DASHBOARD
# ============================================

@app.route("/api/dashboard")
def dashboard():

    try:
        db = get_db()

        user_count = db.execute(
            "SELECT COUNT(*) AS count FROM users"
        ).fetchone()["count"]

        course_count = db.execute(
            "SELECT COUNT(*) AS count FROM courses"
        ).fetchone()["count"]

        lesson_count = db.execute(
            "SELECT COUNT(*) AS count FROM lessons"
        ).fetchone()["count"]

        completed_lessons = db.execute(
            """
            SELECT COUNT(*) AS count
            FROM progress
            WHERE completed = 1
            """
        ).fetchone()["count"]

        total_study_seconds = db.execute(
            """
            SELECT COALESCE(SUM(duration_seconds), 0) AS total
            FROM study_sessions
            """
        ).fetchone()["total"]

        db.close()

        return jsonify({
            "status": "ok",
            "data": {
                "users": user_count,
                "courses": course_count,
                "lessons": lesson_count,
                "completed_lessons": completed_lessons,
                "study_time_seconds": total_study_seconds
            }
        })

    except Exception as error:

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500


# ============================================
# COURSES
# ============================================

@app.route("/api/courses", methods=["GET"])
def get_courses():

    try:
        db = get_db()

        courses = db.execute(
            """
            SELECT
                id,
                title,
                description,
                source,
                youtube_playlist_id,
                created_at
            FROM courses
            """
        ).fetchall()

        db.close()

        return jsonify({
            "status": "ok",
            "courses": [dict(course) for course in courses]
        })

    except Exception as error:

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500


@app.route("/api/courses", methods=["POST"])
def create_course():

    try:

        data = request.get_json()

        if not data:
            return jsonify({
                "status": "error",
                "message": "Request body is required"
            }), 400

        title = data.get("title", "").strip()
        description = data.get("description", "").strip()
        source = data.get("source", "").strip()
        user_id = data.get("user_id")

        if not title:
            return jsonify({
                "status": "error",
                "message": "Course title is required"
            }), 400

        if not user_id:
            return jsonify({
                "status": "error",
                "message": "User ID is required"
            }), 400

        db = get_db()

        user = db.execute(
            "SELECT id FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()

        if not user:
            db.close()

            return jsonify({
                "status": "error",
                "message": "User not found"
            }), 404

        cursor = db.execute(
            """
            INSERT INTO courses
            (user_id, title, description, source)
            VALUES (?, ?, ?, ?)
            """,
            (
                user_id,
                title,
                description,
                source
            )
        )

        db.commit()

        course_id = cursor.lastrowid

        db.close()

        return jsonify({
            "status": "ok",
            "message": "Course created successfully",
            "course_id": course_id
        }), 201

    except Exception as error:

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500


# ============================================
# LESSONS
# ============================================

@app.route(
    "/api/courses/<int:course_id>/lessons",
    methods=["GET"]
)
def get_lessons(course_id):

    try:

        db = get_db()

        lessons = db.execute(
            """
            SELECT
                id,
                course_id,
                title,
                video_url,
                duration_seconds,
                position
            FROM lessons
            WHERE course_id = ?
            ORDER BY position ASC, id ASC
            """,
            (course_id,)
        ).fetchall()

        db.close()

        return jsonify({
            "status": "ok",
            "course_id": course_id,
            "lessons": [dict(lesson) for lesson in lessons]
        })

    except Exception as error:

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500


@app.route(
    "/api/courses/<int:course_id>/lessons",
    methods=["POST"]
)
def create_lesson(course_id):

    try:

        data = request.get_json()

        if not data:
            return jsonify({
                "status": "error",
                "message": "Request body is required"
            }), 400

        title = data.get("title", "").strip()
        video_url = data.get("video_url", "").strip()
        duration_seconds = data.get(
            "duration_seconds",
            0
        )
        position = data.get("position", 0)

        if not title:
            return jsonify({
                "status": "error",
                "message": "Lesson title is required"
            }), 400

        db = get_db()

        course = db.execute(
            "SELECT id FROM courses WHERE id = ?",
            (course_id,)
        ).fetchone()

        if not course:
            db.close()

            return jsonify({
                "status": "error",
                "message": "Course not found"
            }), 404

        cursor = db.execute(
            """
            INSERT INTO lessons
            (
                course_id,
                title,
                video_url,
                duration_seconds,
                position
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                course_id,
                title,
                video_url,
                duration_seconds,
                position
            )
        )

        db.commit()

        lesson_id = cursor.lastrowid

        db.close()

        return jsonify({
            "status": "ok",
            "message": "Lesson created successfully",
            "lesson_id": lesson_id
        }), 201

    except Exception as error:

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500


# ============================================
# PROGRESS
# ============================================

@app.route(
    "/api/lessons/<int:lesson_id>/progress",
    methods=["GET"]
)
def get_lesson_progress(lesson_id):

    user_id = request.args.get(
        "user_id",
        type=int
    )

    if not user_id:
        return jsonify({
            "status": "error",
            "message": "user_id is required"
        }), 400

    try:

        db = get_db()

        progress = db.execute(
            """
            SELECT
                progress.id,
                progress.user_id,
                progress.lesson_id,
                progress.watched_seconds,
                progress.completed,
                progress.updated_at,
                lessons.duration_seconds
            FROM progress
            JOIN lessons
                ON progress.lesson_id = lessons.id
            WHERE progress.user_id = ?
            AND progress.lesson_id = ?
            """,
            (
                user_id,
                lesson_id
            )
        ).fetchone()

        db.close()

        if not progress:

            return jsonify({
                "status": "ok",
                "progress": {
                    "user_id": user_id,
                    "lesson_id": lesson_id,
                    "watched_seconds": 0,
                    "completed": 0,
                    "duration_seconds": 0
                }
            })

        result = dict(progress)

        duration = result["duration_seconds"]

        if duration > 0:
            result["percentage"] = min(
                100,
                round(
                    result["watched_seconds"]
                    / duration
                    * 100,
                    1
                )
            )
        else:
            result["percentage"] = 0

        return jsonify({
            "status": "ok",
            "progress": result
        })

    except Exception as error:

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500


@app.route(
    "/api/lessons/<int:lesson_id>/progress",
    methods=["POST"]
)
def update_lesson_progress(lesson_id):

    try:

        data = request.get_json()

        if not data:

            return jsonify({
                "status": "error",
                "message": "Request body is required"
            }), 400

        user_id = data.get("user_id")

        watched_seconds = max(
            0,
            int(data.get("watched_seconds", 0))
        )

        completed = 1 if data.get(
            "completed",
            False
        ) else 0

        if not user_id:

            return jsonify({
                "status": "error",
                "message": "user_id is required"
            }), 400

        db = get_db()

        lesson = db.execute(
            """
            SELECT
                id,
                duration_seconds
            FROM lessons
            WHERE id = ?
            """,
            (lesson_id,)
        ).fetchone()

        if not lesson:

            db.close()

            return jsonify({
                "status": "error",
                "message": "Lesson not found"
            }), 404

        duration = lesson["duration_seconds"]

        if duration > 0 and watched_seconds >= duration:
            watched_seconds = duration
            completed = 1

        existing = db.execute(
            """
            SELECT id
            FROM progress
            WHERE user_id = ?
            AND lesson_id = ?
            """,
            (
                user_id,
                lesson_id
            )
        ).fetchone()

        if existing:

            db.execute(
                """
                UPDATE progress
                SET
                    watched_seconds = ?,
                    completed = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
                AND lesson_id = ?
                """,
                (
                    watched_seconds,
                    completed,
                    user_id,
                    lesson_id
                )
            )

        else:

            db.execute(
                """
                INSERT INTO progress
                (
                    user_id,
                    lesson_id,
                    watched_seconds,
                    completed
                )
                VALUES (?, ?, ?, ?)
                """,
                (
                    user_id,
                    lesson_id,
                    watched_seconds,
                    completed
                )
            )

        db.commit()

        db.close()

        percentage = 0

        if duration > 0:
            percentage = min(
                100,
                round(
                    watched_seconds
                    / duration
                    * 100,
                    1
                )
            )

        return jsonify({
            "status": "ok",
            "message": "Progress updated",
            "progress": {
                "lesson_id": lesson_id,
                "user_id": user_id,
                "watched_seconds": watched_seconds,
                "completed": completed,
                "percentage": percentage
            }
        })

    except Exception as error:

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500


# ============================================
# USER PROGRESS
# ============================================

@app.route(
    "/api/users/<int:user_id>/progress",
    methods=["GET"]
)
def get_user_progress(user_id):

    try:

        db = get_db()

        progress = db.execute(
            """
            SELECT
                progress.lesson_id,
                lessons.title,
                lessons.duration_seconds,
                progress.watched_seconds,
                progress.completed,
                progress.updated_at
            FROM progress
            JOIN lessons
                ON progress.lesson_id = lessons.id
            WHERE progress.user_id = ?
            ORDER BY progress.updated_at DESC
            """,
            (user_id,)
        ).fetchall()

        db.close()

        results = []

        for row in progress:

            item = dict(row)

            duration = item["duration_seconds"]

            if duration > 0:
                item["percentage"] = min(
                    100,
                    round(
                        item["watched_seconds"]
                        / duration
                        * 100,
                        1
                    )
                )
            else:
                item["percentage"] = 0

            results.append(item)

        return jsonify({
            "status": "ok",
            "user_id": user_id,
            "progress": results
        })

    except Exception as error:

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500


# ============================================
# STUDY SESSIONS
# ============================================

@app.route(
    "/api/users/<int:user_id>/study-sessions",
    methods=["GET"]
)
def get_study_sessions(user_id):

    try:

        db = get_db()

        sessions = db.execute(
            """
            SELECT
                id,
                user_id,
                started_at,
                duration_seconds
            FROM study_sessions
            WHERE user_id = ?
            ORDER BY id DESC
            """,
            (user_id,)
        ).fetchall()

        db.close()

        return jsonify({
            "status": "ok",
            "user_id": user_id,
            "sessions": [dict(session) for session in sessions]
        })

    except Exception as error:

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500


@app.route(
    "/api/users/<int:user_id>/study-sessions",
    methods=["POST"]
)
def create_study_session(user_id):

    try:

        data = request.get_json()

        if not data:
            return jsonify({
                "status": "error",
                "message": "Request body is required"
            }), 400

        duration_seconds = int(
            data.get("duration_seconds", 0)
        )

        if duration_seconds <= 0:
            return jsonify({
                "status": "error",
                "message": "Duration must be greater than zero"
            }), 400

        db = get_db()

        user = db.execute(
            "SELECT id FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()

        if not user:

            db.close()

            return jsonify({
                "status": "error",
                "message": "User not found"
            }), 404

        cursor = db.execute(
            """
            INSERT INTO study_sessions
            (
                user_id,
                duration_seconds
            )
            VALUES (?, ?)
            """,
            (
                user_id,
                duration_seconds
            )
        )

        db.commit()

        session_id = cursor.lastrowid

        db.close()

        return jsonify({
            "status": "ok",
            "message": "Study session saved",
            "session_id": session_id,
            "duration_seconds": duration_seconds
        }), 201

    except Exception as error:

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500


# ============================================
# YOUTUBE PLAYLIST IMPORT
# ============================================

@app.route(
    "/api/import/youtube-playlist",
    methods=["POST"]
)
def import_youtube_playlist():

    try:

        data = request.get_json()

        if not data:
            return jsonify({
                "status": "error",
                "message": "Request body is required"
            }), 400

        user_id = data.get("user_id")

        playlist_id = str(
            data.get(
                "playlist_id",
                ""
            )
        ).strip()

        playlist_title = str(
            data.get(
                "playlist_title",
                ""
            )
        ).strip()

        playlist_url = str(
            data.get(
                "playlist_url",
                ""
            )
        ).strip()

        videos = data.get("videos", [])

        if not user_id:
            return jsonify({
                "status": "error",
                "message": "user_id is required"
            }), 400

        if not playlist_id:
            return jsonify({
                "status": "error",
                "message": "playlist_id is required"
            }), 400

        if not playlist_title:
            return jsonify({
                "status": "error",
                "message": "playlist_title is required"
            }), 400

        if not isinstance(videos, list):
            return jsonify({
                "status": "error",
                "message": "videos must be an array"
            }), 400

        db = get_db()

        # ------------------------------------
        # Verify user
        # ------------------------------------

        user = db.execute(
            """
            SELECT id
            FROM users
            WHERE id = ?
            """,
            (user_id,)
        ).fetchone()

        if not user:
            db.close()

            return jsonify({
                "status": "error",
                "message": "User not found"
            }), 404

        # ------------------------------------
        # Check for existing playlist
        # ------------------------------------

        existing_course = db.execute(
            """
            SELECT
                id,
                title,
                source
            FROM courses
            WHERE user_id = ?
              AND youtube_playlist_id = ?
            ORDER BY id ASC
            LIMIT 1
            """,
            (
                user_id,
                playlist_id
            )
        ).fetchone()

        if existing_course:

                course_id = existing_course["id"]

                updated_lessons = []
                added_lessons = []

                for index, video in enumerate(videos, start=1):

                    title = str(
                        video.get("title", "")
                    ).strip()

                    video_url = str(
                        video.get("video_url", "")
                    ).strip()

                    try:
                        duration_seconds = int(
                            video.get(
                                "duration_seconds",
                                0
                            ) or 0
                        )
                    except (TypeError, ValueError):
                        duration_seconds = 0

                    try:
                        position = int(
                            video.get(
                                "position",
                                index
                            ) or index
                        )
                    except (TypeError, ValueError):
                        position = index

                    if not title:
                        continue

                    # Try to identify the existing lesson
                    existing_lesson = None

                    if video_url:
                        existing_lesson = db.execute(
                            """
                            SELECT
                                id,
                                title,
                                video_url,
                                duration_seconds,
                                position
                            FROM lessons
                            WHERE course_id = ?
                            AND video_url = ?
                            LIMIT 1
                            """,
                            (
                                course_id,
                                video_url
                            )
                        ).fetchone()

                    # Fallback to position when the old
                    # lesson has an empty video URL.
                    if not existing_lesson:
                        existing_lesson = db.execute(
                            """
                            SELECT
                                id,
                                title,
                                video_url,
                                duration_seconds,
                                position
                            FROM lessons
                            WHERE course_id = ?
                            AND position = ?
                            LIMIT 1
                            """,
                            (
                                course_id,
                                position
                            )
                        ).fetchone()

                    if existing_lesson:

                        # Only replace the URL when the
                        # newly scanned URL is valid.
                        new_video_url = (
                            video_url
                            if video_url
                            else existing_lesson["video_url"]
                        )

                        new_duration = (
                            duration_seconds
                            if duration_seconds > 0
                            else existing_lesson["duration_seconds"]
                        )

                        db.execute(
                            """
                            UPDATE lessons
                            SET
                                title = ?,
                                video_url = ?,
                                duration_seconds = ?,
                                position = ?
                            WHERE id = ?
                            """,
                            (
                                title,
                                new_video_url,
                                new_duration,
                                position,
                                existing_lesson["id"]
                            )
                        )

                        updated_lessons.append({
                            "id": existing_lesson["id"],
                            "title": title,
                            "video_url": new_video_url,
                            "duration_seconds": new_duration,
                            "position": position
                        })

                    else:

                        cursor = db.execute(
                            """
                            INSERT INTO lessons
                            (
                                course_id,
                                title,
                                video_url,
                                duration_seconds,
                                position
                            )
                            VALUES (?, ?, ?, ?, ?)
                            """,
                            (
                                course_id,
                                title,
                                video_url,
                                duration_seconds,
                                position
                            )
                        )

                        added_lessons.append({
                            "id": cursor.lastrowid,
                            "title": title,
                            "video_url": video_url,
                            "duration_seconds":
                                duration_seconds,
                            "position": position
                        })

                db.commit()

                all_lessons = db.execute(
                    """
                    SELECT
                        id,
                        title,
                        video_url,
                        duration_seconds,
                        position
                    FROM lessons
                    WHERE course_id = ?
                    ORDER BY position ASC, id ASC
                    """,
                    (course_id,)
                ).fetchall()

                db.close()

                return jsonify({
                    "status": "ok",
                    "already_imported": True,
                    "message":
                        "YouTube playlist synchronized successfully",
                    "course": {
                        "id": course_id,
                        "title": existing_course["title"],
                        "source": existing_course["source"]
                    },
                    "updated_count":
                        len(updated_lessons),
                    "added_count":
                        len(added_lessons),
                    "lessons": [
                        dict(lesson)
                        for lesson in all_lessons
                    ]
                }), 200

        # ------------------------------------
        # Create course
        # ------------------------------------

        cursor = db.execute(
            """
            INSERT INTO courses
            (
                user_id,
                title,
                description,
                source,
                youtube_playlist_id
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                user_id,
                playlist_title,
                "Imported from YouTube",
                playlist_url,
                playlist_id
            )
        )

        course_id = cursor.lastrowid

        # ------------------------------------
        # Create lessons
        # ------------------------------------

        imported_lessons = []

        for index, video in enumerate(
            videos,
            start=1
        ):

            title = str(
                video.get(
                    "title",
                    ""
                )
            ).strip()

            video_url = str(
                video.get(
                    "video_url",
                    ""
                )
            ).strip()

            try:
                duration_seconds = int(
                    video.get(
                        "duration_seconds",
                        0
                    ) or 0
                )
            except (TypeError, ValueError):
                duration_seconds = 0

            try:
                position = int(
                    video.get(
                        "position",
                        index
                    ) or index
                )
            except (TypeError, ValueError):
                position = index

            if not title:
                continue

            cursor = db.execute(
                """
                INSERT INTO lessons
                (
                    course_id,
                    title,
                    video_url,
                    duration_seconds,
                    position
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    course_id,
                    title,
                    video_url,
                    duration_seconds,
                    position
                )
            )

            imported_lessons.append({
                "id": cursor.lastrowid,
                "title": title,
                "video_url": video_url,
                "duration_seconds":
                    duration_seconds,
                "position": position
            })

        db.commit()

        db.close()

        return jsonify({
            "status": "ok",
            "already_imported": False,
            "message":
                "YouTube playlist imported successfully",
            "course": {
                "id": course_id,
                "title": playlist_title,
                "source": playlist_url
            },
            "imported_count":
                len(imported_lessons),
            "lessons":
                imported_lessons
        }), 201

    except Exception as error:

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500

# ============================================
# EXTENSION YOUTUBE PROGRESS
# ============================================

@app.route(
    "/api/extension/progress",
    methods=["POST"]
)
def extension_progress():

    try:

        data = request.get_json()

        if not data:
            return jsonify({
                "status": "error",
                "message": "Request body is required"
            }), 400

        user_id = data.get("user_id")

        video_url = str(
            data.get("video_url", "")
        ).strip()

        watched_seconds = int(
            data.get("watched_seconds", 0) or 0
        )

        duration_seconds = int(
            data.get("duration_seconds", 0) or 0
        )

        completed = bool(
            data.get("completed", False)
        )

        if not user_id:
            return jsonify({
                "status": "error",
                "message": "user_id is required"
            }), 400

        if not video_url:
            return jsonify({
                "status": "error",
                "message": "video_url is required"
            }), 400

        db = get_db()

        user = db.execute(
            """
            SELECT id
            FROM users
            WHERE id = ?
            """,
            (user_id,)
        ).fetchone()

        if not user:
            db.close()

            return jsonify({
                "status": "error",
                "message": "User not found"
            }), 404

        # Find the Cogniv lesson using the YouTube URL.
        lesson = db.execute(
            """
            SELECT
                id,
                course_id,
                duration_seconds
            FROM lessons
            WHERE video_url = ?
            LIMIT 1
            """,
            (video_url,)
        ).fetchone()

        if not lesson:

            db.close()

            return jsonify({
                "status": "ok",
                "tracked": False,
                "message":
                    "Video is not linked to a Cogniv lesson"
            }), 200

        lesson_id = lesson["id"]

        if duration_seconds <= 0:
            duration_seconds = (
                lesson["duration_seconds"] or 0
            )

        # Automatically consider a video complete
        # when the user reaches 90% of it.
        if (
            duration_seconds > 0
            and watched_seconds >=
                int(duration_seconds * 0.90)
        ):
            completed = True

        existing = db.execute(
            """
            SELECT id
            FROM progress
            WHERE user_id = ?
              AND lesson_id = ?
            LIMIT 1
            """,
            (
                user_id,
                lesson_id
            )
        ).fetchone()

        if existing:

            db.execute(
                """
                UPDATE progress
                SET
                    watched_seconds = ?,
                    completed = ?,
                    updated_at =
                        CURRENT_TIMESTAMP
                WHERE user_id = ?
                  AND lesson_id = ?
                """,
                (
                    watched_seconds,
                    int(completed),
                    user_id,
                    lesson_id
                )
            )

        else:

            db.execute(
                """
                INSERT INTO progress
                (
                    user_id,
                    lesson_id,
                    watched_seconds,
                    completed
                )
                VALUES (?, ?, ?, ?)
                """,
                (
                    user_id,
                    lesson_id,
                    watched_seconds,
                    int(completed)
                )
            )

        db.commit()
        db.close()

        return jsonify({
            "status": "ok",
            "tracked": True,
            "lesson_id": lesson_id,
            "watched_seconds":
                watched_seconds,
            "completed": completed
        }), 200

    except Exception as error:

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 500

# ============================================
# APPLICATION START
# ============================================

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )