import { useEffect, useState } from "react";
import axios from "axios";

const API_URL = "http://localhost:5000";
const USER_ID = 1;


function formatTime(seconds) {

  const hours = Math.floor(
    seconds / 3600
  );

  const minutes = Math.floor(
    (seconds % 3600) / 60
  );

  const remainingSeconds =
    seconds % 60;

  return [
    hours,
    minutes,
    remainingSeconds
  ]
    .map(
      value =>
        String(value).padStart(2, "0")
    )
    .join(":");
}


function StudyTimer() {

  const [seconds, setSeconds] =
    useState(0);

  const [running, setRunning] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");


  useEffect(() => {

    if (!running) {
      return;
    }

    const interval =
      setInterval(() => {

        setSeconds(
          value => value + 1
        );

      }, 1000);

    return () =>
      clearInterval(interval);

  }, [running]);


  async function stopAndSave() {

    setRunning(false);

    if (seconds <= 0) {
      return;
    }

    try {

      setSaving(true);

      await axios.post(
        `${API_URL}/api/users/${USER_ID}/study-sessions`,
        {
          duration_seconds: seconds
        }
      );

      setSeconds(0);

      setMessage(
        "Study session saved successfully."
      );

    } catch (error) {

      console.error(error);

      setMessage(
        "Failed to save study session."
      );

    } finally {

      setSaving(false);

    }
  }


  return (

    <div className="page">

      <section className="page-heading">

        <div>

          <h2>
            Study Timer
          </h2>

          <p>
            Track your focused study time.
          </p>

        </div>

      </section>


      <section className="timer-panel">

        <div className="timer-panel-header">
          <span className="eyebrow">
            Focus Session
          </span>

          <span
            className={`timer-status ${
              running ? "running" : ""
            }`}
          >
            <span className="timer-status-dot" />
            {running ? "Focusing" : "Ready"}
          </span>
        </div>

        <div className="timer-display">
          {formatTime(seconds)}
        </div>

        <p className="timer-subtitle">
          {running
            ? "Stay focused. Your session is being tracked."
            : "Start a session when you're ready to study."}
        </p>

        <div className="timer-controls">

          {!running ? (

            <button
              className="timer-primary-button"
              onClick={() => {
                setMessage("");
                setRunning(true);
              }}
            >
              Start Studying
            </button>

          ) : (

            <button
              className="timer-stop-button"
              onClick={stopAndSave}
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : "Stop & Save"}
            </button>

          )}

        </div>

        {message && (
          <p className="timer-message">
            {message}
          </p>
        )}

      </section>

    </div>
  );
}

export default StudyTimer;
