import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";

const API_URL = "http://localhost:5000";


function CourseDetails() {

  const { courseId } = useParams();

  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);

  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [duration, setDuration] = useState("");

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

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

      setLessons(
        lessonsResponse.data.lessons || []
      );

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


      <section className="page-heading">

        <div>

          <h2>
            {course.title}
          </h2>

          <p>
            {course.description ||
              "No description"}
          </p>

        </div>

      </section>


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


      <section className="dashboard-panel">

        <h2>
          Add Lesson
        </h2>

        <form
          className="course-form"
          onSubmit={addLesson}
        >

          <input
            type="text"
            placeholder="Lesson title"
            value={title}
            onChange={(e) =>
              setTitle(e.target.value)
            }
          />


          <input
            type="url"
            placeholder="YouTube video URL"
            value={videoUrl}
            onChange={(e) =>
              setVideoUrl(e.target.value)
            }
          />


          <input
            type="number"
            min="0"
            placeholder="Duration in seconds"
            value={duration}
            onChange={(e) =>
              setDuration(e.target.value)
            }
          />


          <button
            type="submit"
            disabled={creating}
          >
            {creating
              ? "Adding..."
              : "Add Lesson"}
          </button>

        </form>

      </section>


      <section className="dashboard-panel">

        <div className="section-header">

          <h2>
            Lessons
          </h2>

          <span>
            {lessons.length} lesson
            {lessons.length !== 1
              ? "s"
              : ""}
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

          <div className="course-list">

            {lessons.map((lesson) => (

              <Link
                className="course-item"
                key={lesson.id}
                to={`/courses/${courseId}/lessons/${lesson.id}`}
              >

                <div>

                  <h3>
                    {lesson.position}.{" "}
                    {lesson.title}
                  </h3>

                  <p>
                    {lesson.video_url ||
                      "No video URL"}
                  </p>

                </div>


                <span>

                  {lesson.duration_seconds > 0
                    ? `${Math.floor(
                        lesson.duration_seconds / 60
                      )} min`
                    : "Duration not set"}

                </span>

              </Link>

            ))}

          </div>

        )}

      </section>

    </div>
  );
}


export default CourseDetails;
