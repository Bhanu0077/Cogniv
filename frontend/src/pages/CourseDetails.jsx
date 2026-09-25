import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";

const API_URL = "http://localhost:5000";


function CourseDetails() {

  const { courseId } = useParams();

  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [progressMap, setProgressMap] = useState({});

  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [duration, setDuration] = useState("");

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState(null);
  const [editLessonTitle, setEditLessonTitle] = useState("");
  const [editLessonVideoUrl, setEditLessonVideoUrl] = useState("");
  const [editLessonDuration, setEditLessonDuration] = useState("");
  const [updatingLesson, setUpdatingLesson] = useState(false);
  const [deletingLessonId, setDeletingLessonId] = useState(null);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");


  async function loadCourse() {

    try {

      setLoading(true);
      setError("");

      const coursesResponse =
        await axios.get(
          `${API_URL}/api/courses`
        );

      const foundCourse =
        coursesResponse.data.courses.find(
          (item) =>
            item.id === Number(courseId)
        );

      if (!foundCourse) {
        setError("Course not found.");
        return;
      }

      setCourse(foundCourse);


      const lessonsResponse =
        await axios.get(
          `${API_URL}/api/courses/${courseId}/lessons`
        );

      const loadedLessons =
        lessonsResponse.data.lessons || [];

      setLessons(loadedLessons);

      const progressResponse =
        await axios.get(
          `${API_URL}/api/users/1/progress`
        );

      const progressLookup = {};

      (progressResponse.data.progress || []).forEach(
        (item) => {
          progressLookup[item.lesson_id] = item;
        }
      );

      setProgressMap(progressLookup);

    } catch (err) {

      console.error(err);

      setError(
        "Unable to load course."
      );

    } finally {

      setLoading(false);

    }
  }


  useEffect(() => {
    loadCourse();
  }, [courseId]);


  async function addLesson(event) {

    event.preventDefault();

    if (!title.trim()) {

      setError(
        "Lesson title is required."
      );

      return;
    }

    try {

      setCreating(true);
      setError("");
      setMessage("");

      await axios.post(
        `${API_URL}/api/courses/${courseId}/lessons`,
        {
          title: title.trim(),
          video_url: videoUrl.trim(),
          duration_seconds:
            Number(duration) || 0,
          position: lessons.length + 1
        }
      );

      setTitle("");
      setVideoUrl("");
      setDuration("");

      setMessage(
        "Lesson added successfully."
      );

      await loadCourse();

    } catch (err) {

      console.error(err);

      setError(
        err.response?.data?.message ||
        "Unable to add lesson."
      );

    } finally {

      setCreating(false);

    }
  }


  async function updateLesson(lesson) {
    if (!editLessonTitle.trim()) {
      setError("Lesson title is required.");
      return;
    }

    try {
      setUpdatingLesson(true);
      setError("");
      setMessage("");

      await axios.put(
        `${API_URL}/api/lessons/${lesson.id}`,
        {
          title: editLessonTitle.trim(),
          video_url: editLessonVideoUrl.trim(),
          duration_seconds:
            Number(editLessonDuration) || 0,
          position: lesson.position
        }
      );

      setEditingLessonId(null);
      setEditLessonTitle("");
      setEditLessonVideoUrl("");
      setEditLessonDuration("");

      setMessage("Lesson updated successfully.");

      await loadCourse();

    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.message ||
        "Unable to update lesson."
      );

    } finally {
      setUpdatingLesson(false);
    }
  }

  async function deleteLesson(lessonId) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this lesson?"
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingLessonId(lessonId);
      setError("");
      setMessage("");

      await axios.delete(
        `${API_URL}/api/lessons/${lessonId}`
      );

      setMessage("Lesson deleted successfully.");

      await loadCourse();

    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.message ||
        "Unable to delete lesson."
      );

    } finally {
      setDeletingLessonId(null);
    }
  }

  if (loading) {

    return (
      <div className="page">
        <h2>Loading course...</h2>
      </div>
    );
  }


  if (error && !course) {

    return (
      <div className="page">

        <Link
          className="back-link"
          to="/courses"
        >
          ← Back to Courses
        </Link>

        <div className="error">
          {error}
        </div>

      </div>
    );
  }


  return (

    <div className="page">

      <Link
        className="back-link"
        to="/courses"
      >
        ← Back to Courses
      </Link>


      <section className="course-details-header">

        {course.thumbnail_url ? (
          <img
            className="course-details-thumbnail"
            src={course.thumbnail_url}
            alt={`${course.title} thumbnail`}
          />
        ) : (
          <div className="course-details-thumbnail-placeholder">
            <span>Thumbnail</span>
          </div>
        )}

        <div className="course-details-header-main">

          <span className="eyebrow">
            Course
          </span>

          <h2>
            {course.title}
          </h2>

          <p>
            {course.description ||
              "No description"}
          </p>

        </div>

        <div className="course-details-meta">
          <span>
            {lessons.length} lesson
            {lessons.length !== 1 ? "s" : ""}
          </span>

          <span>
            Course #{course.id}
          </span>
        </div>

      </section>


      {(() => {
        const completedCount = lessons.filter(
          (lesson) =>
            Boolean(
              progressMap[lesson.id]?.completed
            )
        ).length;

        const inProgressCount = lessons.filter(
          (lesson) => {
            const progress =
              progressMap[lesson.id];

            return (
              !progress?.completed &&
              Number(progress?.watched_seconds || 0) > 0
            );
          }
        ).length;

        const notStartedCount =
          lessons.length -
          completedCount -
          inProgressCount;

        const overallProgress =
          lessons.length > 0
            ? (completedCount / lessons.length) * 100
            : 0;

        return (
          <section className="course-progress-summary">

            <div className="course-progress-header">
              <div>
                <span className="eyebrow">
                  Course Progress
                </span>

                <h2>
                  Your learning progress
                </h2>
              </div>

              <strong>
                {overallProgress.toFixed(0)}%
              </strong>
            </div>

            <div className="course-overall-progress-track">
              <div
                className="course-overall-progress-fill"
                style={{
                  width: `${overallProgress}%`
                }}
              />
            </div>

            <div className="course-progress-stats">

              <div className="course-progress-stat completed">
                <strong>
                  {completedCount}
                </strong>
                <span>
                  Completed
                </span>
              </div>

              <div className="course-progress-stat in-progress">
                <strong>
                  {inProgressCount}
                </strong>
                <span>
                  In Progress
                </span>
              </div>

              <div className="course-progress-stat not-started">
                <strong>
                  {notStartedCount}
                </strong>
                <span>
                  Not Started
                </span>
              </div>

            </div>

          </section>
        );
      })()}


      {error && (
        <div className="error">
          {error}
        </div>
      )}


      {message && (
        <div className="success">
          {message}
        </div>
      )}


      <section className="course-create-panel">

        <div className="course-section-heading">

          <div>
            <span className="eyebrow">
              Course Content
            </span>

            <h2>
              Add Lesson
            </h2>

            <p>
              Add a video to this course manually.
            </p>
          </div>

        </div>

        <form
          className="course-form"
          onSubmit={addLesson}
        >

          <div className="form-field">
            <label htmlFor="lesson-title">
              Lesson title
            </label>

            <input
              id="lesson-title"
              type="text"
              placeholder="e.g. Introduction to Arrays"
              value={title}
              onChange={(e) =>
                setTitle(e.target.value)
              }
            />
          </div>


          <div className="form-field">
            <label htmlFor="lesson-video">
              YouTube video URL
            </label>

            <input
              id="lesson-video"
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              value={videoUrl}
              onChange={(e) =>
                setVideoUrl(e.target.value)
              }
            />
          </div>


          <div className="form-field">
            <label htmlFor="lesson-duration">
              Duration
            </label>

            <input
              id="lesson-duration"
              type="number"
              min="0"
              placeholder="Seconds"
              value={duration}
              onChange={(e) =>
                setDuration(e.target.value)
              }
            />
          </div>


          <button
            className="primary-button"
            type="submit"
            disabled={creating}
          >
            {creating
              ? "Adding..."
              : "Add Lesson"}
          </button>

        </form>

      </section>


      <section className="course-lessons-panel">

        <div className="course-section-heading">

          <div>
            <span className="eyebrow">
              Learning Path
            </span>

            <h2>
              Lessons
            </h2>

            <p>
              Continue where you left off.
            </p>
          </div>

          <span className="lesson-count">
            {lessons.length} lesson
            {lessons.length !== 1 ? "s" : ""}
          </span>

        </div>


        {lessons.length === 0 ? (

          <div className="empty-state">

            <h3>
              No lessons yet
            </h3>

            <p>
              Add your first lesson above.
            </p>

          </div>

        ) : (

          <div className="lesson-list">

            {lessons.map((lesson) => {

              const progress =
                progressMap[lesson.id];

              const watchedSeconds =
                Number(
                  progress?.watched_seconds || 0
                );

              const durationSeconds =
                Number(
                  progress?.duration_seconds ||
                  lesson.duration_seconds ||
                  0
                );

              let percentage =
                Number(
                  progress?.percentage || 0
                );

              if (
                percentage === 0 &&
                watchedSeconds > 0 &&
                durationSeconds > 0
              ) {
                percentage =
                  (watchedSeconds /
                    durationSeconds) *
                  100;
              }

              percentage = Math.min(
                100,
                Math.max(0, percentage)
              );

              const completed =
                Boolean(progress?.completed);

              const inProgress =
                !completed &&
                watchedSeconds > 0;

              let status = "Not Started";
              let statusClass = "not-started";

              if (completed) {
                status = "Completed";
                statusClass = "completed";
              } else if (inProgress) {
                status = "In Progress";
                statusClass = "in-progress";
              }

              return (
                <div
                  className="lesson-card-wrapper"
                  key={lesson.id}
                >

                  {editingLessonId === lesson.id ? (

                    <div className="lesson-edit-form">

                      <div className="form-field">
                        <label>
                          Lesson title
                        </label>

                        <input
                          type="text"
                          value={editLessonTitle}
                          onChange={(e) =>
                            setEditLessonTitle(e.target.value)
                          }
                        />
                      </div>

                      <div className="form-field">
                        <label>
                          Video URL
                        </label>

                        <input
                          type="text"
                          value={editLessonVideoUrl}
                          onChange={(e) =>
                            setEditLessonVideoUrl(e.target.value)
                          }
                        />
                      </div>

                      <div className="form-field">
                        <label>
                          Duration (seconds)
                        </label>

                        <input
                          type="number"
                          value={editLessonDuration}
                          onChange={(e) =>
                            setEditLessonDuration(e.target.value)
                          }
                        />
                      </div>

                      <div className="lesson-edit-actions">

                        <button
                          className="primary-button"
                          type="button"
                          disabled={updatingLesson}
                          onClick={() =>
                            updateLesson(lesson)
                          }
                        >
                          {updatingLesson
                            ? "Saving..."
                            : "Save"}
                        </button>

                        <button
                          className="lesson-cancel-button"
                          type="button"
                          disabled={updatingLesson}
                          onClick={() => {
                            setEditingLessonId(null);
                            setEditLessonTitle("");
                            setEditLessonVideoUrl("");
                            setEditLessonDuration("");
                          }}
                        >
                          Cancel
                        </button>

                      </div>

                    </div>

                  ) : (

                    <div className="lesson-view">

                      <Link
                        className="lesson-card"
                        to={`/courses/${courseId}/lessons/${lesson.id}`}
                      >

                    <div className="lesson-number">
                    {lesson.position}
                  </div>

                  <div className="lesson-info">

                    <h3>
                      {lesson.title}
                    </h3>

                    <p>
                      {lesson.video_url ||
                        "No video URL"}
                    </p>

                    <div className="lesson-status-row">

                      <span
                        className={`lesson-status ${statusClass}`}
                      >
                        {status}
                      </span>

                      {inProgress && (
                        <span className="lesson-percentage">
                          {percentage.toFixed(0)}%
                        </span>
                      )}

                    </div>

                    {inProgress && (
                      <div className="lesson-progress-area">

                        <div className="lesson-progress-track">

                          <div
                            className="lesson-progress-fill"
                            style={{
                              width: `${percentage}%`
                            }}
                          />

                        </div>

                      </div>
                    )}

                  </div>

                  <div className="lesson-meta">

                    <span>
                      {lesson.duration_seconds > 0
                        ? `${Math.floor(
                            lesson.duration_seconds / 60
                          )} min`
                        : "Duration not set"}
                    </span>

                    <strong>
                      →
                    </strong>

                  </div>

                      </Link>

                      <button
                        className="lesson-edit-button"
                  type="button"
                  onClick={() => {
                    setEditingLessonId(lesson.id);
                    setEditLessonTitle(lesson.title);
                    setEditLessonVideoUrl(lesson.video_url || "");
                    setEditLessonDuration(
                      lesson.duration_seconds || ""
                    );
                    setError("");
                    setMessage("");
                  }}
                >
                  Edit
                      </button>

                      <button
                        className="lesson-delete-button"
                        type="button"
                        disabled={deletingLessonId === lesson.id}
                        onClick={() =>
                          deleteLesson(lesson.id)
                        }
                      >
                        {deletingLessonId === lesson.id
                          ? "Deleting..."
                          : "Delete"}
                      </button>

                    </div>

                  )}

                </div>
              );
            })}

          </div>

        )}

      </section>

    </div>
  );
}


export default CourseDetails;
