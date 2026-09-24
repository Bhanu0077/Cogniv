import { useEffect, useState } from "react";
import axios from "axios";

const API_URL = "http://localhost:5000";

function Settings() {
  const [stats, setStats] = useState({
    courses: 0,
    lessons: 0
  });

  const [backendConnected, setBackendConnected] =
    useState(false);

  useEffect(() => {
    async function loadSettingsData() {
      try {
        const response = await axios.get(
          `${API_URL}/api/dashboard`
        );

        const data = response.data?.data || {};

        setStats({
          courses: Number(data.courses) || 0,
          lessons: Number(data.lessons) || 0
        });

        setBackendConnected(true);
      } catch (error) {
        console.error(
          "[Cogniv] Unable to load settings data:",
          error
        );

        setBackendConnected(false);
      }
    }

    loadSettingsData();
  }, []);

  return (
    <div className="page settings-page">

      <section className="page-heading">

        <div>
          <span className="eyebrow">
            Application
          </span>

          <h2>
            Settings
          </h2>

          <p>
            Manage your Cogniv workspace and view application information.
          </p>
        </div>

      </section>


      <section className="settings-grid">

        <div className="settings-card">

          <div className="settings-card-heading">
            <div>
              <span className="eyebrow">
                Workspace
              </span>

              <h2>
                Cogniv
              </h2>
            </div>
          </div>

          <div className="settings-info-list">

            <div className="settings-info-row">
              <span>
                Product
              </span>

              <strong>
                Learning OS
              </strong>
            </div>

            <div className="settings-info-row">
              <span>
                Environment
              </span>

              <strong>
                Development
              </strong>
            </div>

            <div className="settings-info-row">
              <span>
                Backend
              </span>

              <strong
                className={
                  backendConnected
                    ? "settings-status connected"
                    : "settings-status"
                }
              >
                <span className="settings-status-dot" />

                {backendConnected
                  ? "Connected"
                  : "Offline"}
              </strong>
            </div>

          </div>

        </div>


        <div className="settings-card">

          <div className="settings-card-heading">
            <div>
              <span className="eyebrow">
                Learning Data
              </span>

              <h2>
                Your Workspace
              </h2>
            </div>
          </div>

          <div className="settings-info-list">

            <div className="settings-info-row">
              <span>
                Courses
              </span>

              <strong>
                {stats.courses}
              </strong>
            </div>

            <div className="settings-info-row">
              <span>
                Lessons
              </span>

              <strong>
                {stats.lessons}
              </strong>
            </div>

            <div className="settings-info-row">
              <span>
                Storage
              </span>

              <strong>
                Local SQLite
              </strong>
            </div>

          </div>

        </div>


        <div className="settings-card settings-card-wide">

          <div className="settings-card-heading">
            <div>
              <span className="eyebrow">
                About
              </span>

              <h2>
                Cogniv
              </h2>
            </div>
          </div>

          <p className="settings-about-text">
            Cogniv is a personal learning and progress
            tracking platform designed to bring your
            courses, lessons, YouTube activity and study
            sessions into one workspace.
          </p>

          <div className="settings-future">

            <span>
              Coming later
            </span>

            <div className="settings-future-list">
              <span>Account</span>
              <span>YouTube Integration</span>
              <span>Data Export</span>
              <span>Notifications</span>
            </div>

          </div>

        </div>

      </section>

    </div>
  );
}

export default Settings;
