import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

const API_URL = "http://localhost:5000";
const USER_ID = 1;

function Courses() {
  const [courses, setCourses] = useState([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [updating, setUpdating] = useState(false);
  const [deletingCourseId, setDeletingCourseId] = useState(null);
  const [error, setError] = useState("");

  async function loadCourses() {
    try {
      setLoading(true);

      const response = await axios.get(
        `${API_URL}/api/courses`
      );

      setCourses(response.data.courses || []);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Unable to load courses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCourses();
  }, []);

  async function createCourse(event) {
    event.preventDefault();

    if (!title.trim()) {
      return;
    }

    try {
      setCreating(true);
      setError("");

      await axios.post(
        `${API_URL}/api/courses`,
        {
          user_id: USER_ID,
          title: title.trim(),
          description: description.trim(),
          source: source.trim()
        }
      );

      setTitle("");
      setDescription("");
      setSource("");

      await loadCourses();
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.message ||
        "Failed to create course."
      );
    } finally {
      setCreating(false);
    }
  }

  async function updateCourse(courseId) {
    if (!editTitle.trim()) {
      setError("Course title is required.");
      return;
    }

    try {
      setUpdating(true);
      setError("");

      await axios.put(
        `${API_URL}/api/courses/${courseId}`,
        {
          user_id: USER_ID,
          title: editTitle.trim(),
          description: editDescription.trim()
        }
      );

      setEditingCourseId(null);
      setEditTitle("");
      setEditDescription("");

      await loadCourses();
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.message ||
        "Failed to update course."
      );
    } finally {
      setUpdating(false);
    }
  }

  async function deleteCourse(courseId) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this course?"
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingCourseId(courseId);
      setError("");

      await axios.delete(
        `${API_URL}/api/courses/${courseId}`,
        {
          data: {
            user_id: USER_ID
          }
        }
      );

      await loadCourses();
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.message ||
        "Failed to delete course."
      );
    } finally {
      setDeletingCourseId(null);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-heading">
          <span className="eyebrow">
            LEARNING LIBRARY
          </span>

          <h2>Courses</h2>

          <p>
            Loading your courses...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page courses-page">

      <section className="page-heading">
        <span className="eyebrow">
          LEARNING LIBRARY
        </span>

        <h2>Courses</h2>

        <p>
          Manage your learning courses and continue
          where you left off.
        </p>
      </section>

      {error && (
        <div className="error">
          {error}
        </div>
      )}

      <section className="dashboard-panel course-create-panel">

        <div className="section-header">
          <div>
            <h2>Add Course</h2>

            <p>
              Create a course for your learning library.
            </p>
          </div>
        </div>

        <form
          className="course-form"
          onSubmit={createCourse}
        >

          <div className="form-field">
            <label htmlFor="course-title">
              Course title
            </label>

            <input
              id="course-title"
              type="text"
              placeholder="e.g. Machine Learning"
              value={title}
              onChange={(e) =>
                setTitle(e.target.value)
              }
            />
          </div>

          <div className="form-field">
            <label htmlFor="course-description">
              Description
            </label>

            <input
              id="course-description"
              type="text"
              placeholder="What are you learning?"
              value={description}
              onChange={(e) =>
                setDescription(e.target.value)
              }
            />
          </div>

          <div className="form-field">
            <label htmlFor="course-source">
              Source
            </label>

            <input
              id="course-source"
              type="text"
              placeholder="YouTube, Coursera, College, etc."
              value={source}
              onChange={(e) =>
                setSource(e.target.value)
              }
            />
          </div>

          <button
            className="primary-button"
            type="submit"
            disabled={creating}
          >
            {creating
              ? "Creating..."
              : "Create Course"}
          </button>

        </form>

      </section>

      <section className="courses-section">

        <div className="section-header">
          <div>
            <h2>Your Courses</h2>

            <p>
              {courses.length}{" "}
              {courses.length === 1
                ? "course"
                : "courses"}
            </p>
          </div>
        </div>

        {courses.length === 0 ? (

          <div className="dashboard-panel">
            <div className="empty-state">
              <h3>No courses yet</h3>

              <p>
                Create your first course above.
              </p>
            </div>
          </div>

        ) : (

          <div className="course-grid">

            {courses.map((course) => (

              <article
                className="course-card"
                key={course.id}
              >

                {course.thumbnail_url ? (
                  <img
                    className="course-thumbnail"
                    src={course.thumbnail_url}
                    alt={`${course.title} thumbnail`}
                  />
                ) : (
                  <div className="course-thumbnail-placeholder">
                    <span>Thumbnail</span>
                  </div>
                )}

                <div className="course-card-content">

                  {editingCourseId === course.id ? (

                    <div className="course-edit-form">

                      <div className="form-field">
                        <label>
                          Course title
                        </label>

                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) =>
                            setEditTitle(e.target.value)
                          }
                        />
                      </div>

                      <div className="form-field">
                        <label>
                          Description
                        </label>

                        <input
                          type="text"
                          value={editDescription}
                          onChange={(e) =>
                            setEditDescription(e.target.value)
                          }
                        />
                      </div>

                      <div className="course-edit-actions">

                        <button
                          className="primary-button"
                          type="button"
                          disabled={updating}
                          onClick={() =>
                            updateCourse(course.id)
                          }
                        >
                          {updating ? "Saving..." : "Save"}
                        </button>

                        <button
                          className="course-cancel-button"
                          type="button"
                          disabled={updating}
                          onClick={() => {
                            setEditingCourseId(null);
                            setEditTitle("");
                            setEditDescription("");
                          }}
                        >
                          Cancel
                        </button>

                      </div>

                    </div>

                  ) : (

                    <>
                      <div className="course-card-source">
                        {course.source || "Course"}
                      </div>

                      <h3>
                        {course.title}
                      </h3>

                      <p>
                        {course.description ||
                          "No description available."}
                      </p>
                    </>

                  )}

                </div>

                <div className="course-card-footer">

                  <span>
                    Course #{course.id}
                  </span>

                  <div className="course-card-actions">

                    <button
                      className="course-edit-button"
                      type="button"
                      onClick={() => {
                        setEditingCourseId(course.id);
                        setEditTitle(course.title);
                        setEditDescription(course.description || "");
                        setError("");
                      }}
                    >
                      Edit
                    </button>

                    <Link
                      className="course-button"
                      to={`/courses/${course.id}`}
                    >
                      Open Course
                    </Link>

                    <button
                      className="course-delete-button"
                      type="button"
                      disabled={deletingCourseId === course.id}
                      onClick={() => deleteCourse(course.id)}
                    >
                      {deletingCourseId === course.id
                        ? "Deleting..."
                        : "Delete"}
                    </button>

                  </div>

                </div>

              </article>

            ))}

          </div>

        )}

      </section>

    </div>
  );
}

export default Courses;
