import { useEffect, useState } from "react";
import axios from "axios";

const API_URL = "http://localhost:5000";

function formatStudyTime(seconds) {
  const totalSeconds = Number(seconds) || 0;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
}

function Dashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    try {
      setLoading(true);

      const response = await axios.get(
        `${API_URL}/api/dashboard`
      );

      setDashboard(response.data.data);
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
        <div className="page-heading">
          <h2>Dashboard</h2>
          <p>Loading your learning overview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="page-heading">
          <h2>Dashboard</h2>
          <p>Your learning overview.</p>
        </div>

        <div className="error">
          {error}
        </div>
      </div>
    );
  }

  const totalLessons =
    Number(dashboard?.lessons) || 0;

  const completedLessons =
    Number(dashboard?.completed_lessons) || 0;

  const completionPercentage =
    totalLessons > 0
      ? Math.min(
          100,
          (completedLessons / totalLessons) * 100
        )
      : 0;

  return (
    <div className="page">

      <section className="page-heading dashboard-heading">
        <div>
          <span className="eyebrow">
            LEARNING OVERVIEW
          </span>

          <h2>Dashboard</h2>

          <p>
            Keep track of your courses, lessons,
            and study time.
          </p>
        </div>
      </section>

      <section className="cards dashboard-stats">

        <div className="card dashboard-stat-card">
          <div className="stat-label">
            Courses
          </div>

          <strong>
            {dashboard.courses}
          </strong>

          <p>
            Courses in your library
          </p>
        </div>

        <div className="card dashboard-stat-card">
          <div className="stat-label">
            Lessons
          </div>

          <strong>
            {dashboard.lessons}
          </strong>

          <p>
            Total lessons available
          </p>
        </div>

        <div className="card dashboard-stat-card">
          <div className="stat-label">
            Completed
          </div>

          <strong>
            {dashboard.completed_lessons}
          </strong>

          <p>
            Lessons completed
          </p>
        </div>

        <div className="card dashboard-stat-card">
          <div className="stat-label">
            Study Time
          </div>

          <strong>
            {formatStudyTime(
              dashboard.study_time_seconds
            )}
          </strong>

          <p>
            Recorded study sessions
          </p>
        </div>

      </section>

      <section className="dashboard-panel dashboard-progress-panel">

        <div className="section-header">
          <div>
            <h2>Learning Progress</h2>

            <p>
              {completedLessons} of {totalLessons} lessons completed
            </p>
          </div>

          <strong className="progress-percentage">
            {completionPercentage.toFixed(1)}%
          </strong>
        </div>

        <div className="progress-track">
          <div
            className="progress-fill"
            style={{
              width: `${completionPercentage}%`
            }}
          />
        </div>

      </section>

      <section className="dashboard-panel dashboard-empty-panel">

        <div className="empty-state">
          <h3>
            Your learning workspace
          </h3>

          <p>
            Continue adding courses and completing
            lessons. More learning insights will appear
            here as your activity grows.
          </p>
        </div>

      </section>

    </div>
  );
}

export default Dashboard;
