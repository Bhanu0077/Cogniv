import { useEffect, useState } from "react";
import axios from "axios";

const API_URL = "http://localhost:5000";

function formatStudyTime(seconds) {

  const hours = Math.floor(seconds / 3600);

  const minutes = Math.floor(
    (seconds % 3600) / 60
  );

  const remainingSeconds =
    seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
}


function Dashboard() {

  const [dashboard, setDashboard] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");


  async function loadDashboard() {

    try {

      const response =
        await axios.get(
          `${API_URL}/api/dashboard`
        );

      setDashboard(
        response.data.data
      );

      setError("");

    } catch (err) {

      console.error(err);

      setError(
        "Unable to connect to Cogniv backend."
      );

    } finally {

      setLoading(false);

    }
  }


  useEffect(() => {
    loadDashboard();
  }, []);


  if (loading) {

    return (
      <div className="page">
        <h2>Loading Dashboard...</h2>
      </div>
    );
  }


  if (error) {

    return (
      <div className="page">

        <h2>Dashboard</h2>

        <div className="error">
          {error}
        </div>

      </div>
    );
  }


  return (

    <div className="page">

      <section className="page-heading">

        <div>

          <h2>
            Dashboard
          </h2>

          <p>
            Your learning overview.
          </p>

        </div>

      </section>


      <section className="cards">

        <div className="card">

          <h3>
            Courses
          </h3>

          <strong>
            {dashboard.courses}
          </strong>

          <p>
            Courses you're learning
          </p>

        </div>


        <div className="card">

          <h3>
            Lessons
          </h3>

          <strong>
            {dashboard.lessons}
          </strong>

          <p>
            Total lessons
          </p>

        </div>


        <div className="card">

          <h3>
            Completed
          </h3>

          <strong>
            {dashboard.completed_lessons}
          </strong>

          <p>
            Lessons completed
          </p>

        </div>


        <div className="card">

          <h3>
            Study Time
          </h3>

          <strong>
            {formatStudyTime(
              dashboard.study_time_seconds
            )}
          </strong>

          <p>
            Total study time
          </p>

        </div>

      </section>


      <section className="dashboard-panel">

        <h2>
          Getting Started
        </h2>

        <p>
          Add a course and start learning.
          Your progress will appear here.
        </p>

      </section>

    </div>
  );
}

export default Dashboard;
