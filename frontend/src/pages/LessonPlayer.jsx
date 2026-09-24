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
  const [courseLessons, setCourseLessons] = useState([]);
  const [progress, setProgress] = useState(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [navigatingNext, setNavigatingNext] = useState(false);

  const [showCourseCelebration, setShowCourseCelebration] =
    useState(false);

  const courseCelebrationShownRef = useRef(false);

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

    const loadedLessons =
      lessonsResponse.data.lessons || [];

    const orderedLessons = [...loadedLessons].sort(
      (a, b) =>
        Number(a.position || 0) -
          Number(b.position || 0) ||
        Number(a.id || 0) -
          Number(b.id || 0)
    );

    setCourseLessons(orderedLessons);

    const foundLesson =
      orderedLessons.find(
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

        if (
          latestProgress?.completed &&
          !nextLesson &&
          !courseCelebrationShownRef.current
        ) {
          celebrateCourseCompletion();
        }

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
      stopProgressTracking();

      saveProgress(true).then((saved) => {
        if (saved && !nextLesson) {
          celebrateCourseCompletion();
        }
      });
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

      return true;

    } catch (err) {
      console.error(
        "[Cogniv] Unable to save progress:",
        err
      );

      return false;
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

  const currentLessonIndex =
    courseLessons.findIndex(
      (item) => item.id === Number(lessonId)
    );

  const nextLesson =
    currentLessonIndex >= 0
      ? courseLessons[currentLessonIndex + 1]
      : null;

  function celebrateCourseCompletion() {
    if (courseCelebrationShownRef.current) {
      return;
    }

    courseCelebrationShownRef.current = true;
    setShowCourseCelebration(true);

    // Automatically close the celebration after 7 seconds.
    window.setTimeout(() => {
      setShowCourseCelebration(false);
    }, 7000);
  }

  async function handleNextLesson() {
    if (!nextLesson || navigatingNext) {
      return;
    }

    try {
      setNavigatingNext(true);

      /*
       * Save the current position before leaving.
       * This does not change completion semantics.
       */
      await saveProgress(false);

      window.location.href =
        `/courses/${courseId}/lessons/${nextLesson.id}`;

    } catch (err) {
      console.error(
        "[Cogniv] Unable to move to next lesson:",
        err
      );

      setNavigatingNext(false);
    }
  }

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

  const watchedSeconds =
    Number(progress?.watched_seconds) || 0;

  const durationSeconds =
    Number(progress?.duration_seconds) ||
    Number(lesson.duration_seconds) ||
    0;

  const progressPercentage =
    durationSeconds > 0
      ? Math.min(
          100,
          Math.round(
            (watchedSeconds / durationSeconds) * 100
          )
        )
      : 0;

  const status =
    progress?.completed
      ? "Completed"
      : watchedSeconds > 0
      ? "In Progress"
      : "Not Started";

  const formatTime = (seconds) => {
    const value = Number(seconds) || 0;
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const remainingSeconds = Math.floor(value % 60);

    if (hours > 0) {
      return `${hours}h ${String(minutes).padStart(2, "0")}m`;
    }

    return `${minutes}m ${String(
      remainingSeconds
    ).padStart(2, "0")}s`;
  };

  return (
    <div className="page lesson-player-page">

      <Link
        className="back-link"
        to={`/courses/${courseId}`}
      >
        ← Back to Course
      </Link>

      <section className="lesson-player-header">

        <div className="lesson-player-title">

          <span className="eyebrow">
            Lesson {lesson.position}
          </span>

          <h2>
            {lesson.title}
          </h2>

          <p>
            Continue learning from where you left off.
          </p>

        </div>

        <div className="lesson-player-status">
          <span
            className={
              progress?.completed
                ? "status-badge completed"
                : watchedSeconds > 0
                ? "status-badge progress"
                : "status-badge"
            }
          >
            {status}
          </span>
        </div>

      </section>

      <section className="lesson-workspace">

        <div className="lesson-video-column">

          <section className="lesson-video-panel">

            {youtubeId ? (
              <>
                <div className="lesson-video-wrapper">
                  <div
                    id="cogniv-youtube-player"
                    className="lesson-video"
                  />
                </div>

                <div className="lesson-video-footer">

                  <div>
                    <span className="eyebrow">
                      Source
                    </span>

                    <p>
                      YouTube
                    </p>
                  </div>

                  <a
                    href={getYouTubePlaylistUrl(
                      lesson.video_url,
                      lesson.youtube_playlist_id
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="youtube-playlist-button"
                  >
                    ▶ Open in YouTube Playlist
                  </a>

                </div>
              </>
            ) : (
              <div className="error">
                This lesson does not have a valid YouTube URL.
              </div>
            )}

          </section>

        </div>

        <section className="lesson-progress-panel">

          <div className="lesson-progress-heading">

            <div>
              <span className="eyebrow">
                Learning Progress
              </span>

              <h2>
                Your Progress
              </h2>
            </div>

            <strong>
              {progressPercentage}%
            </strong>

          </div>

          <div className="lesson-progress-track">
            <div
              className="lesson-progress-fill"
              style={{
                width: `${progressPercentage}%`
              }}
            />
          </div>

          <div className="lesson-progress-stats">

            <div>
              <span>Watched</span>
              <strong>
                {formatTime(watchedSeconds)}
              </strong>
            </div>

            <div>
              <span>Duration</span>
              <strong>
                {durationSeconds > 0
                  ? formatTime(durationSeconds)
                  : "Unknown"}
              </strong>
            </div>

            <div>
              <span>Status</span>
              <strong>
                {status}
              </strong>
            </div>

          </div>

        </section>

      </section>

      <div className="lesson-navigation">

        {nextLesson ? (
          <button
            type="button"
            className="next-lesson-button"
            onClick={handleNextLesson}
            disabled={navigatingNext}
          >
            {navigatingNext
              ? "Saving..."
              : `Next Lesson →`}
          </button>
        ) : (
          <div className="course-complete-message">
            🎉 You have reached the end of this course.
          </div>
        )}

      </div>

      {showCourseCelebration && (
        <div
          className="course-celebration-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Course completed"
        >
          <div className="celebration-fireworks">
            <span />
            <span />
            <span />
            <span />
          </div>

          <div className="celebration-confetti">
            {Array.from({ length: 36 }, (_, index) => (
              <span
                key={index}
                style={{
                  "--confetti-x": `${(index * 37) % 100}%`,
                  "--confetti-delay": `${(index % 12) * 0.08}s`,
                  "--confetti-rotate": `${(index * 47) % 360}deg`
                }}
              />
            ))}
          </div>

          <div className="course-celebration-card">
            <div className="celebration-trophy">
              🏆
            </div>

            <span className="eyebrow">
              Course Complete
            </span>

            <h2>
              You did it!
            </h2>

            <p>
              You completed every lesson in this course.
            </p>

            <div className="celebration-stars">
              ✦ ✦ ✦
            </div>

            <button
              type="button"
              className="celebration-close-button"
              onClick={() =>
                setShowCourseCelebration(false)
              }
            >
              Continue
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default LessonPlayer;
