-- ============================================
-- COGNIV DATABASE SCHEMA
-- ============================================

PRAGMA foreign_keys = ON;


-- --------------------------------------------
-- Users
-- --------------------------------------------

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


-- --------------------------------------------
-- Courses / Learning Sources
-- --------------------------------------------

CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);


-- --------------------------------------------
-- Videos / Lessons
-- --------------------------------------------

CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    video_url TEXT,
    duration_seconds INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,

    FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE
);


-- --------------------------------------------
-- User progress
-- --------------------------------------------

CREATE TABLE IF NOT EXISTS progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lesson_id INTEGER NOT NULL,

    watched_seconds INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,

    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(user_id, lesson_id),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (lesson_id)
        REFERENCES lessons(id)
        ON DELETE CASCADE
);


-- --------------------------------------------
-- Study sessions
-- --------------------------------------------

CREATE TABLE IF NOT EXISTS study_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,

    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    duration_seconds INTEGER DEFAULT 0,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);