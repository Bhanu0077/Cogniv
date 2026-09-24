import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_URL = "http://localhost:5000";

function formatTime(seconds) {
  const value = Number(seconds) || 0;

  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function Progress() {
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadProgress() {
    try {
      setLoading(true);
      setError("");

      const response = await axios.get(
        `${API_URL}/api/users/1/progress`
      );

      setProgress(response.data.progress || []);
    } catch (err) {
      console.error(
        "[Cogniv] Unable to load progress:",
        err
      );

      setError(
        err.response?.data?.message ||
          "Unable to load learning progress."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProgress();
  }, []);

  const statistics = useMemo(() => {
    const completed = progress.filter(
      (item) => Number(item.completed) === 1
    );

    const inProgress = progress.filter(
      (item) =>
        Number(item.completed) !== 1 &&
        Number(item.watched_seconds) > 0
    );

    const watchedSeconds = progress.reduce(
      (total, item) =>
        total + (Number(item.watched_seconds) || 0),
      0
    );

    const averageProgress =
      progress.length > 0
        ? progress.reduce(
            (total, item) =>
              total + (Number(item.percentage) || 0),
            0
          ) / progress.length
        : 0;

    return {
      completed: completed.length,
      inProgress: inProgress.length,
      watchedSeconds,
      averageProgress
    };
  }, [progress]);

  const recentProgress = progress
    .filter(
      (item) => Number(item.completed) !== 1
    )
    .slice(0, 8);

  const completedLessons = progress.filter(
    (item) => Number(item.completed) === 1
  );

  if (loading) {
    return (
      <div className="page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">
              Learning
            </span>

            <h2>Progress</h2>

            <p>
              Loading your learning activity...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page progress-page">

      <section className="page-heading progress-heading">

        <div>
          <span className="eyebrow">
            Learning Analytics
          </span>

          <h2>
            Progress
          </h2>

          <p>
            See what you've watched and what you've completed.
          </p>
        </div>

        <button
          className="progress-refresh-button"
          onClick={loadProgress}
          type="button"
        >
          ↻ Refresh
        </button>

      </section>

      {error && (
        <div className="error">
          {error}
        </div>
      )}

      <section className="progress-stat-grid">

        <div className="progress-stat-card">

          <span className="stat-label">
            Completed
          </span>

          <strong>
            {statistics.completed}
          </strong>

          <p>
            Finished lessons
          </p>

        </div>

        <div className="progress-stat-card">

          <span className="stat-label">
            In Progress
          </span>

          <strong>
            {statistics.inProgress}
          </strong>

          <p>
            Lessons you've started
          </p>

        </div>

        <div className="progress-stat-card">

          <span className="stat-label">
            Watch Time
          </span>

          <strong>
            {formatTime(statistics.watchedSeconds)}
          </strong>

          <p>
            Total recorded time
          </p>

        </div>

        <div className="progress-stat-card">

          <span className="stat-label">
            Average Progress
          </span>

          <strong>
            {statistics.averageProgress.toFixed(1)}%
          </strong>

          <p>
            Across tracked lessons
          </p>

        </div>

      </section>

      <section className="progress-section">

        <div className="progress-section-heading">

          <div>
            <span className="eyebrow">
              Continue Learning
            </span>

            <h2>
              Recent Lessons
            </h2>
          </div>

          <span className="progress-section-count">
            {recentProgress.length}
          </span>

        </div>

        {recentProgress.length === 0 ? (

          <div className="progress-empty-state">

            <h3>
              Nothing in progress
            </h3>

            <p>
              Start a lesson and your learning activity
              will appear here.
            </p>

          </div>

        ) : (

          <div className="progress-lesson-list">

            {recentProgress.map((item) => {

              const percentage = Math.min(
                100,
                Math.max(
                  0,
                  Number(item.percentage) || 0
                )
              );

              return (
                <div
                  className="progress-lesson-card"
                  key={item.lesson_id}
                >

                  <div className="progress-lesson-top">

                    <div className="progress-lesson-title">

                      <h3>
                        {item.title}
                      </h3>

                      <span>
                        {Number(
                          item.watched_seconds
                        ) || 0}
                        {" / "}
                        {Number(
                          item.duration_seconds
                        ) || 0}
                        {" seconds"}
                      </span>

                    </div>

                    <strong>
                      {percentage.toFixed(1)}%
                    </strong>

                  </div>

                  <div className="progress-bar">

                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${percentage}%`
                      }}
                    />

                  </div>

                </div>
              );
            })}

          </div>

        )}

      </section>

      <section className="progress-section">

        <div className="progress-section-heading">

          <div>
            <span className="eyebrow">
              Finished
            </span>

            <h2>
              Completed Lessons
            </h2>
          </div>

          <span className="progress-section-count">
            {completedLessons.length}
          </span>

        </div>

        {completedLessons.length === 0 ? (

          <div className="progress-empty-state">

            <h3>
              No completed lessons yet
            </h3>

            <p>
              Complete a lesson and it will appear here.
            </p>

          </div>

        ) : (

          <div className="completed-lesson-list">

            {completedLessons.map((item) => (

              <div
                className="completed-lesson-card"
                key={item.lesson_id}
              >

                <div className="completed-check">
                  ✓
                </div>

                <div>
                  <h3>
                    {item.title}
                  </h3>

                  <span>
                    Completed
                  </span>
                </div>

              </div>

            ))}

          </div>

        )}

      </section>

    </div>
  );
}

export default Progress;
