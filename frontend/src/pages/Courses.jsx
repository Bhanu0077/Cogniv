import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

const API_URL = "http://localhost:5000";
const USER_ID = 1;


function Courses() {

  const [courses, setCourses] =
    useState([]);

  const [title, setTitle] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [source, setSource] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [creating, setCreating] =
    useState(false);

  const [error, setError] =
    useState("");


  async function loadCourses() {

    try {

      setLoading(true);

      const response =
        await axios.get(
          `${API_URL}/api/courses`
        );

      setCourses(
        response.data.courses
      );

      setError("");

    } catch (err) {

      console.error(err);

      setError(
        "Unable to load courses."
      );

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
        <h2>Loading Courses...</h2>
      </div>
    );
  }


  return (

    <div className="page">

      <section className="page-heading">

        <div>

          <h2>
            Courses
          </h2>

          <p>
            Manage your learning courses.
          </p>

        </div>

      </section>


      {error && (
        <div className="error">
          {error}
        </div>
      )}


      <section className="dashboard-panel">

        <h2>
          Add Course
        </h2>


        <form
          className="course-form"
          onSubmit={createCourse}
        >

          <input
            type="text"
            placeholder="Course title"
            value={title}
            onChange={(e) =>
              setTitle(e.target.value)
            }
          />


          <input
            type="text"
            placeholder="Description"
            value={description}
            onChange={(e) =>
              setDescription(e.target.value)
            }
          />


          <input
            type="text"
            placeholder="Source"
            value={source}
            onChange={(e) =>
              setSource(e.target.value)
            }
          />


          <button
            type="submit"
            disabled={creating}
          >
            {creating
              ? "Creating..."
              : "Create Course"}
          </button>

        </form>

      </section>


      <section className="dashboard-panel">

        <div className="section-header">

          <h2>
            My Courses
          </h2>

          <span>
            {courses.length} course
            {courses.length !== 1
              ? "s"
              : ""}
          </span>

        </div>


        {courses.length === 0 ? (

          <div className="empty-state">

            <h3>
              No courses yet
            </h3>

            <p>
              Create your first course above.
            </p>

          </div>

        ) : (

          <div className="course-list">

            {courses.map((course) => (

              <div
                className="course-item"
                key={course.id}
              >

                <div className="course-info">

                  <h3>
                    {course.title}
                  </h3>

                  <p>
                    {course.description ||
                      "No description"}
                  </p>

                  <small>
                    {course.source ||
                      "Manual"}
                  </small>

                </div>


                <Link
                  className="course-button"
                  to={`/courses/${course.id}`}
                >
                  View Lessons
                </Link>

              </div>

            ))}

          </div>

        )}

      </section>

    </div>
  );
}


export default Courses;
