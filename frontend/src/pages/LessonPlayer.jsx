import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";

const API_URL = "http://localhost:5000";

function getYouTubeId(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.slice(1);
    }

    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }

      if (parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/embed/")[1];
      }

      if (parsed.pathname.startsWith("/shorts/")) {
        return parsed.pathname.split("/shorts/")[1];
      }
    }
  } catch {
    return null;
  }

  return null;
}
function getYouTubePlaylistUrl(videoUrl, playlistId) {
  const youtubeId = getYouTubeId(videoUrl);

  if (!youtubeId || !playlistId) {
    return videoUrl;
  }

  const finalUrl =
    youtubeId && playlistId
      ? `https://www.youtube.com/watch?v=${youtubeId}&list=${playlistId}`
      : videoUrl;

  console.log("[Cogniv] YouTube URL:", finalUrl);
  console.log("[Cogniv] Video ID:", youtubeId);
  console.log("[Cogniv] Playlist ID:", playlistId);

  return finalUrl;
}

function LessonPlayer() {
  const { courseId, lessonId } = useParams();

  const playerRef = useRef(null);
  const progressTimerRef = useRef(null);

  const [lesson, setLesson] = useState(null);
  const [progress, setProgress] = useState(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

 async function loadLesson() {
  try {
    setLoading(true);
    setError("");

    // Get all courses
    const coursesResponse = await axios.get(
      `${API_URL}/api/courses`
    );

    const course = coursesResponse.data.courses?.find(
      (item) => item.id === Number(courseId)
    );

    if (!course) {
      setError("Course not found.");
      return;
    }

    // Get lessons for this course
    const lessonsResponse = await axios.get(
      `${API_URL}/api/courses/${courseId}/lessons`
    );

    const foundLesson =
      lessonsResponse.data.lessons?.find(
        (item) => item.id === Number(lessonId)
      );

    if (!foundLesson) {
      setError("Lesson not found.");
      return;
    }

    // Attach playlist information to the lesson
    setLesson({
      ...foundLesson,
      youtube_playlist_id:
        course.youtube_playlist_id || null
    });

    // Get latest progress
    try {
      const progressResponse = await axios.get(
        `${API_URL}/api/lessons/${lessonId}/progress?user_id=1`
      );

      setProgress(
        progressResponse.data.progress
      );

    } catch (progressError) {
      console.warn(
        "Unable to load lesson progress:",
        progressError
      );
    }

  } catch (err) {
    console.error(
      "[Cogniv] Unable to load lesson:",
      err
    );

    setError(
      err.response?.data?.message ||
      "Unable to load lesson."
    );

  } finally {
    setLoading(false);
  }
}

  useEffect(() => {
    loadLesson();
  }, [courseId, lessonId]);

  /*
 * Keep Cogniv progress synchronized with the backend.
 *
 * This is important when progress is being updated
 * externally by the Chrome YouTube extension.
 */
  useEffect(() => {
    let cancelled = false;

    async function syncProgress() {
      try {
          const response = await axios.get(
        `${API_URL}/api/lessons/${lessonId}/progress?user_id=1`
      );
        if (cancelled) {
          return;
        }

        const latestProgress = response.data.progress;

        setProgress(latestProgress);

        /*
        * If the embedded player is not currently playing,
        * use the backend value for the displayed position.
        *
        * This allows progress coming from the extension
        * to appear on the Cogniv page.
        */
        if (!isPlaying) {
          setCurrentTime(
            Number(latestProgress?.watched_seconds) || 0
          );
        }

        console.log(
          "[Cogniv] Progress synchronized:",
          latestProgress
        );

      } catch (err) {
        console.warn(
          "[Cogniv] Unable to synchronize progress:",
          err
        );
      }
    }

    // Get the latest value immediately.
    syncProgress();

    // Then synchronize every 5 seconds.
    const interval = setInterval(
      syncProgress,
      2000
    );

    return () => {
      cancelled = true;
      clearInterval(interval);
    };

  }, [lessonId, isPlaying]);
  /*
   * Load YouTube IFrame Player API
   */
  useEffect(() => {
    if (!lesson) return;

    const youtubeId = getYouTubeId(
      lesson.video_url
    );

    if (!youtubeId) return;

    function createPlayer() {
      if (!window.YT || !window.YT.Player) {
        return;
      }

      if (playerRef.current) {
        return;
      }

      playerRef.current = new window.YT.Player(
        "cogniv-youtube-player",
        {
          videoId: youtubeId,

          playerVars: {
            autoplay: 0,
            controls: 1,
            rel: 0,
            modestbranding: 1
          },

          events: {
            onReady: handlePlayerReady,
            onStateChange: handlePlayerStateChange
          }
        }
      );
    }

    if (!window.YT) {
      const existingScript =
        document.querySelector(
          'script[src="https://www.youtube.com/iframe_api"]'
        );

      if (!existingScript) {
        const script =
          document.createElement("script");

        script.src =
          "https://www.youtube.com/iframe_api";

        document.body.appendChild(script);
      }

      window.onYouTubeIframeAPIReady =
        createPlayer;
    } else {
      createPlayer();
    }

    return () => {
      stopProgressTracking();

      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [lesson]);

  function handlePlayerReady(event) {
    console.log(
      "[Cogniv] YouTube player ready."
    );

    /*
     * Resume from saved progress.
     */
    const savedSeconds =
      Number(progress?.watched_seconds) || 0;

    if (savedSeconds > 0) {
      event.target.seekTo(
        savedSeconds,
        true
      );
    }
  }

  function handlePlayerStateChange(event) {
    if (!window.YT) return;

    if (
      event.data ===
      window.YT.PlayerState.PLAYING
    ) {
      setIsPlaying(true);
      startProgressTracking();
    }

    if (
      event.data ===
      window.YT.PlayerState.PAUSED
    ) {
      setIsPlaying(false);
      saveProgress();
      stopProgressTracking();
    }

    if (
      event.data ===
      window.YT.PlayerState.ENDED
    ) {
      setIsPlaying(false);
      saveProgress(true);
      stopProgressTracking();
    }
  }

  function startProgressTracking() {
    if (progressTimerRef.current) {
      return;
    }

    progressTimerRef.current =
      setInterval(() => {

        if (!playerRef.current) {
          return;
        }

        const time =
          Math.floor(
            playerRef.current.getCurrentTime()
          );

        setCurrentTime(time);

      }, 1000);
  }

  function stopProgressTracking() {
    if (progressTimerRef.current) {
      clearInterval(
        progressTimerRef.current
      );

      progressTimerRef.current = null;
    }
  }

  async function saveProgress(completed = false) {
    if (!playerRef.current) {
      return;
    }

    try {
      const watchedSeconds =
        Math.floor(
          playerRef.current.getCurrentTime()
        );

      setCurrentTime(watchedSeconds);

      await axios.put(
        `${API_URL}/api/lessons/${lessonId}/progress`,
        {
          user_id: 1,
          watched_seconds: watchedSeconds,
          completed
        }
      );

      setProgress((previous) => ({
        ...(previous || {}),
        watched_seconds: watchedSeconds,
        completed
      }));

      console.log(
        "[Cogniv] Progress saved:",
        watchedSeconds,
        completed
      );

    } catch (err) {
      console.error(
        "[Cogniv] Unable to save progress:",
        err
      );
    }
  }

  /*
   * Save progress when leaving the page.
   */
  useEffect(() => {
    return () => {
      stopProgressTracking();
    };
  }, []);

  if (loading) {
    return (
      <div className="page">
        <h2>Loading lesson...</h2>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="page">

        <Link
          className="back-link"
          to={`/courses/${courseId}`}
        >
          ← Back to Course
        </Link>

        <div className="error">
          {error || "Lesson not found."}
        </div>

      </div>
    );
  }

  const youtubeId = getYouTubeId(
    lesson.video_url
  );

  return (
    <div className="page">

      <Link
        className="back-link"
        to={`/courses/${courseId}`}
      >
        ← Back to Course
      </Link>

      <section className="page-heading">
        <div>
          <h2>{lesson.title}</h2>

          <p>
            Lesson {lesson.position}
          </p>
        </div>
      </section>

      <section className="dashboard-panel">

        {youtubeId ? (
          <>
            <div
              style={{
                position: "relative",
                width: "100%",
                paddingTop: "56.25%",
                overflow: "hidden",
                borderRadius: "12px"
              }}
            >
              <div
                id="cogniv-youtube-player"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%"
                }}
              />
            </div>

            <div style={{ marginTop: "16px" }}>
              <a
                href={getYouTubePlaylistUrl(
                  lesson.video_url,
                  lesson.youtube_playlist_id
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="back-link"
              >
                ▶ Open this lesson in YouTube Playlist
              </a>
            </div>
          </>
        ) : (
          <div className="error">
            This lesson does not have a valid YouTube URL.
          </div>
        )}

      </section>

      <section className="dashboard-panel">

        <h2>Lesson Progress</h2>

        <p>
          Watched:{" "}
          {Number(progress?.watched_seconds) || 0}{" "}
          seconds
        </p>

        <p>
          Status:{" "}
          {progress?.completed
            ? "Completed"
            : Number(progress?.watched_seconds) > 0
            ? "In Progress"
            : "Not started"}
        </p>

      </section>

    </div>
  );
}

export default LessonPlayer;
