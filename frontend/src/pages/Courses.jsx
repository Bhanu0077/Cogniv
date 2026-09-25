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

                </div>

                <div className="course-card-footer">

                  <span>
                    Course #{course.id}
                  </span>

                  <Link
                    className="course-button"
                    to={`/courses/${course.id}`}
                  >
                    Open Course
                  </Link>

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
