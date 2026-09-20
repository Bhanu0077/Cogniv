console.log("[Cogniv] YouTube content script loaded.");

let currentVideo = null;
let currentVideoUrl = "";
let currentPlaylistId = "";
let trackingInterval = null;
let lastSentSeconds = -1;
let trackerInitialized = false;


/* =========================================================
   PLAYLIST EXTRACTION
   ========================================================= */

function getPlaylistId() {
  const params = new URLSearchParams(
    window.location.search
  );

  return params.get("list") || "";
}


function getPlaylistTitle() {
  const selectors = [
    "ytd-playlist-header-renderer h1",
    "ytd-playlist-header-renderer #title",
    "ytd-playlist-panel-renderer #title"
  ];

  for (const selector of selectors) {
    const element =
      document.querySelector(selector);

    if (element?.textContent?.trim()) {
      return element.textContent.trim();
    }
  }

  return document.title
    .replace(" - YouTube", "")
    .trim();
}


function getPlaylistVideos() {
  const selectors = [
    "ytd-playlist-panel-video-renderer",
    "ytd-playlist-video-renderer"
  ];

  let elements = [];

  for (const selector of selectors) {
    elements = Array.from(
      document.querySelectorAll(selector)
    );

    if (elements.length > 0) {
      break;
    }
  }

  return elements
    .map((element, index) => {
      // Find the title
      const titleElement =
        element.querySelector("#video-title") ||
        element.querySelector(
          "a[href*='/watch?v=']"
        );

      const title =
        titleElement?.textContent?.trim() || "";

      // YouTube can expose the video URL through
      // different anchor elements depending on the
      // playlist type.
      const linkElement =
        element.querySelector("a#video-title") ||
        element.querySelector("a[href*='/watch?v=']") ||
        element.querySelector("a[href*='watch?v=']");

      let videoUrl = "";

      if (linkElement) {
        const href =
          linkElement.getAttribute("href") ||
          linkElement.href ||
          "";

        if (href) {
          try {
            const parsedUrl = new URL(
              href,
              window.location.origin
            );

            const videoId =
              parsedUrl.searchParams.get("v");

            if (videoId) {
              videoUrl =
                `https://www.youtube.com/watch?v=${videoId}`;
            }
          } catch (error) {
            console.warn(
              "[Cogniv] Could not parse video URL:",
              href,
              error
            );
          }
        }
      }

      // Fallback: inspect every anchor inside the item
      if (!videoUrl) {
        const anchors =
          Array.from(
            element.querySelectorAll("a")
          );

        for (const anchor of anchors) {
          const href =
            anchor.getAttribute("href") ||
            anchor.href ||
            "";

          if (
            href.includes("/watch?v=") ||
            href.includes("watch?v=")
          ) {
            try {
              const parsedUrl = new URL(
                href,
                window.location.origin
              );

              const videoId =
                parsedUrl.searchParams.get("v");

              if (videoId) {
                videoUrl =
                  `https://www.youtube.com/watch?v=${videoId}`;
                break;
              }
            } catch (error) {
              // Ignore invalid URLs
            }
          }
        }
      }

      // Duration
      const durationElement =
        element.querySelector(
          ".ytd-thumbnail-overlay-time-status-renderer"
        ) ||
        element.querySelector(
          "ytd-thumbnail-overlay-time-status-renderer"
        );

      const durationText =
        durationElement?.textContent?.trim() || "";

      return {
        title,
        video_url: videoUrl,
        duration_seconds:
          parseDuration(durationText),
        duration_text: durationText,
        position: index + 1
      };
    })
    .filter(video => video.title);
}


function parseDuration(text) {
  if (!text) {
    return 0;
  }

  const parts =
    text.split(":").map(Number);

  if (
    parts.some(
      part => Number.isNaN(part)
    )
  ) {
    return 0;
  }

  let seconds = 0;

  for (const part of parts) {
    seconds =
      seconds * 60 + part;
  }

  return seconds;
}


function getPlaylistData() {
  const playlistId =
    getPlaylistId();

  if (!playlistId) {
    throw new Error(
      "No YouTube playlist detected."
    );
  }

  const playlistTitle =
    getPlaylistTitle();

  const videos =
    getPlaylistVideos();

  if (!videos.length) {
    throw new Error(
      "Playlist detected, but no videos were found."
    );
  }

  return {
    playlist_id: playlistId,
    playlist_title: playlistTitle,
    playlist_url:
      window.location.href,
    videos
  };
}


/* =========================================================
   VIDEO TRACKING
   ========================================================= */

function getCurrentVideoElement() {
  return document.querySelector(
    "video.html5-main-video"
  );
}


function getCurrentVideoUrl() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const videoId =
    params.get("v");

  if (!videoId) {
    return "";
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
}


function getCurrentVideoId() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  return params.get("v") || "";
}


function sendProgress(completed = false) {
    const video = getCurrentVideoElement();

    if (!video) {
        return;
    }

    const currentTime = Number(video.currentTime);
    const duration = Number(video.duration);

    // Ignore invalid YouTube playback states
    if (!Number.isFinite(currentTime) || currentTime < 0) {
        return;
    }

    // Live streams / videos without a usable duration
    if (!Number.isFinite(duration) || duration <= 0) {
        console.log("[Cogniv] Skipping progress: invalid duration");
        return;
    }

    // Never allow progress to exceed the actual video duration
    const watchedSeconds = Math.min(
        Math.floor(currentTime),
        Math.floor(duration)
    );

    const videoUrl = getCurrentVideoUrl();

    if (!videoUrl) {
        return;
    }

    const finalCompleted =
        completed || watchedSeconds >= Math.floor(duration * 0.9);

    const progressData = {
        user_id: 1,
        video_url: videoUrl,
        watched_seconds: watchedSeconds,
        duration_seconds: Math.floor(duration),
        completed: finalCompleted
    };

    console.log("[Cogniv] Sending progress:", progressData);

    chrome.runtime.sendMessage(
        {
            type: "VIDEO_PROGRESS",
            data: progressData
        },
        (response) => {
            if (chrome.runtime.lastError) {
                console.error(
                    "[Cogniv] Progress message error:",
                    chrome.runtime.lastError.message
                );
                return;
            }

            console.log("[Cogniv] Progress response:", response);
        }
    );
}


function handlePlay() {
  console.log(
    "[Cogniv Tracker] Video playing."
  );

  startTracking();
}


function handlePause() {
  console.log(
    "[Cogniv Tracker] Video paused."
  );

  sendProgress(false);
  stopTracking();
}


function handleEnded() {
  console.log(
    "[Cogniv Tracker] Video ended."
  );

  sendProgress(true);
  stopTracking();
}


function attachVideoListeners(video) {
  if (!video) {
    return;
  }

  if (
    video.dataset.cognivTracking ===
    "true"
  ) {
    return;
  }

  video.dataset.cognivTracking =
    "true";

  console.log(
    "[Cogniv Tracker] Attaching video listeners."
  );

  video.addEventListener(
    "play",
    handlePlay
  );

  video.addEventListener(
    "pause",
    handlePause
  );

  video.addEventListener(
    "ended",
    handleEnded
  );
}


function startTracking() {
  if (trackingInterval) {
    return;
  }

  trackingInterval =
    setInterval(() => {

      const video =
        getCurrentVideoElement();

      if (!video) {
        return;
      }

      currentVideo =
        video;

      currentVideoUrl =
        getCurrentVideoUrl();

      sendProgress(false);

    }, 10000);
}


function stopTracking() {
  if (!trackingInterval) {
    return;
  }

  clearInterval(
    trackingInterval
  );

  trackingInterval = null;
}


function initializeVideoTracker() {
  const video =
    getCurrentVideoElement();

  if (!video) {
    return;
  }

  if (
    currentVideo !== video
  ) {
    /*
     * Save the previous video's
     * latest position before switching.
     */
    if (currentVideo) {
      sendProgress(false);
      stopTracking();
    }

    currentVideo = video;

    currentVideoUrl =
      getCurrentVideoUrl();

    lastSentSeconds = -1;

    console.log(
      "[Cogniv Tracker] Current video:",
      currentVideoUrl
    );
  }

  attachVideoListeners(video);

  trackerInitialized = true;
}


/* =========================================================
   YOUTUBE SPA NAVIGATION
   ========================================================= */

let lastUrl =
  window.location.href;


setInterval(() => {

  if (
    window.location.href !== lastUrl
  ) {

    lastUrl =
      window.location.href;

    console.log(
      "[Cogniv Tracker] YouTube navigation detected."
    );

    stopTracking();

    currentVideo = null;
    currentVideoUrl = "";
    lastSentSeconds = -1;

    setTimeout(
      initializeVideoTracker,
      1000
    );
  }

}, 1000);


/* =========================================================
   MESSAGE HANDLER
   ========================================================= */

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {

    if (
      message.type ===
      "GET_PLAYLIST_DATA"
    ) {

      try {

        const data =
          getPlaylistData();

        sendResponse(data);

      } catch (error) {

        sendResponse({
          error: error.message
        });
      }

      return true;
    }


    if (
      message.type ===
      "GET_VIDEO_STATUS"
    ) {

      const video =
        getCurrentVideoElement();

      if (!video) {

        sendResponse({
          detected: false
        });

        return true;
      }

      sendResponse({
        detected: true,
        video_url:
          getCurrentVideoUrl(),
        video_id:
          getCurrentVideoId(),
        current_time:
          Math.floor(
            video.currentTime || 0
          ),
        duration:
          Math.floor(
            video.duration || 0
          ),
        paused:
          video.paused
      });

      return true;
    }
  }
);


/* =========================================================
   INITIALIZATION
   ========================================================= */

setInterval(
  initializeVideoTracker,
  2000
);

setTimeout(
  initializeVideoTracker,
  1500
);

setTimeout(() => {

  currentPlaylistId =
    getPlaylistId();

  console.log(
    "[Cogniv] Playlist ID:",
    currentPlaylistId
  );

  try {

    const data =
      getPlaylistData();

    console.log(
      "[Cogniv] Initial playlist:",
      data.playlist_title
    );

    console.log(
      "[Cogniv] Initial video count:",
      data.videos.length
    );

  } catch (error) {

    console.log(
      "[Cogniv] Playlist scan unavailable:",
      error.message
    );

  }

}, 3000);

// ============================================================
// COGNIV YOUTUBE UI
// ============================================================

function createCognivPanel() {
  if (document.getElementById("cogniv-panel")) {
    return true;
  }

  const playlistRenderer =
    document.querySelector("ytd-playlist-panel-renderer#playlist");

  if (!playlistRenderer) {
    return false;
  }

  const playlistItems =
    playlistRenderer.querySelector("#items");

  if (!playlistItems) {
    return false;
  }

  // ------------------------------------------------------------
  // Create panel
  // ------------------------------------------------------------

  const panel = document.createElement("div");

  panel.id = "cogniv-panel";

  panel.style.cssText = `
    width: 100%;
    box-sizing: border-box;
    background: #111827;
    color: #f9fafb;
    border-bottom: 1px solid #374151;
    font-family: Arial, Helvetica, sans-serif;
    position: sticky;
    top: 0;
    z-index: 100;
  `;

  // ------------------------------------------------------------
  // Header
  // ------------------------------------------------------------

  const header = document.createElement("div");

  header.className = "cogniv-panel-header";

  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid #374151;
  `;

  const titleContainer = document.createElement("div");

  const title = document.createElement("div");

  title.textContent = "Cogniv";

  title.style.cssText = `
    font-size: 17px;
    font-weight: 700;
  `;

  const subtitle = document.createElement("div");

  subtitle.textContent = "Learning Tracker";

  subtitle.style.cssText = `
    margin-top: 3px;
    font-size: 12px;
    color: #9ca3af;
  `;

  titleContainer.appendChild(title);
  titleContainer.appendChild(subtitle);

  // ------------------------------------------------------------
  // Close button
  // ------------------------------------------------------------

  const closeButton = document.createElement("button");

  closeButton.type = "button";
  closeButton.textContent = "×";
  closeButton.setAttribute(
    "aria-label",
    "Close Cogniv"
  );

  closeButton.style.cssText = `
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #9ca3af;
    font-size: 22px;
    cursor: pointer;
  `;

  closeButton.addEventListener("mouseenter", () => {
    closeButton.style.background = "#1f2937";
    closeButton.style.color = "#ffffff";
  });

  closeButton.addEventListener("mouseleave", () => {
    closeButton.style.background = "transparent";
    closeButton.style.color = "#9ca3af";
  });

  closeButton.addEventListener("click", () => {
    panel.remove();
  });

  header.appendChild(titleContainer);
  header.appendChild(closeButton);

  // ------------------------------------------------------------
  // Body
  // ------------------------------------------------------------

  const body = document.createElement("div");

  body.className = "cogniv-panel-body";

  body.style.cssText = `
    padding: 14px 16px;
  `;

  const loading = document.createElement("div");

  loading.textContent = "Loading playlist...";

  loading.style.cssText = `
    padding: 8px 0;
    text-align: center;
    font-size: 13px;
    color: #9ca3af;
  `;

  body.appendChild(loading);

  // ------------------------------------------------------------
  // Load real playlist progress
  // ------------------------------------------------------------

  loadCognivPlaylistProgress(panel, body);

  // ------------------------------------------------------------
  // Assemble
  // ------------------------------------------------------------

  panel.appendChild(header);
  panel.appendChild(body);

  // ------------------------------------------------------------
  // Insert BEFORE YouTube playlist items
  // ------------------------------------------------------------

  playlistItems.before(panel);

  return true;
}


// ============================================================
// Detect the active YouTube playlist ID
// ============================================================

function getCognivPlaylistId() {
  // ----------------------------------------------------------
  // Method 1: current URL
  // ----------------------------------------------------------

  try {
    const currentUrl =
      new URL(window.location.href);

    const urlPlaylistId =
      currentUrl.searchParams.get("list");

    if (urlPlaylistId) {
      return urlPlaylistId;
    }
  } catch (error) {
    console.warn(
      "[Cogniv] Could not read current URL:",
      error
    );
  }

  // ----------------------------------------------------------
  // Method 2: playlist links in YouTube's playlist renderer
  // ----------------------------------------------------------

  const playlistRenderer =
    document.querySelector(
      "ytd-playlist-panel-renderer#playlist"
    );

  if (!playlistRenderer) {
    return null;
  }

  const links =
    playlistRenderer.querySelectorAll("a[href]");

  for (const link of links) {
    try {
      const linkUrl =
        new URL(link.href);

      const playlistId =
        linkUrl.searchParams.get("list");

      if (playlistId) {
        return playlistId;
      }
    } catch {
      // Ignore malformed links.
    }
  }

  return null;
}

// ============================================================
// Load Cogniv playlist progress
// ============================================================

async function loadCognivPlaylistProgress(panel, body) {
  const playlistId =
    getCognivPlaylistId();

  if (!playlistId) {
    showCognivMessage(
      body,
      "Cogniv could not detect the YouTube playlist."
    );
    return;
  }

  try {
    const response = await fetch(
      `http://localhost:5000/api/youtube/playlist/${encodeURIComponent(playlistId)}/progress?user_id=1`
    );

    const data = await response.json();

    if (!response.ok || data.status !== "ok") {
      showCognivMessage(
        body,
        "This playlist is not imported into Cogniv yet."
      );
      return;
    }

    window.cognivPlaylistProgress = data;

    renderCognivProgress(body, data);

    applyCognivLessonStatuses(data);

    // Do NOT observe the playlist DOM yet.
    // YouTube constantly mutates this DOM, and our status
    // badges also modify it. Observing it can create a loop.

  } catch (error) {
    console.error(
      "[Cogniv] Failed to load playlist progress:",
      error
    );

    showCognivMessage(
      body,
      "Cogniv backend is not reachable."
    );
  }
}


// ============================================================
// Message helper
// ============================================================

function showCognivMessage(body, message) {
  body.replaceChildren();

  const messageElement = document.createElement("div");

  messageElement.textContent = message;

  messageElement.style.cssText = `
    padding: 12px 0;
    text-align: center;
    font-size: 13px;
    line-height: 1.4;
    color: #9ca3af;
  `;

  body.appendChild(messageElement);
}


// ============================================================
// Render playlist progress
// ============================================================

function renderCognivProgress(body, data) {
  body.replaceChildren();

  const course = data.course;
  const summary = data.summary;

  // ----------------------------------------------------------
  // Course title
  // ----------------------------------------------------------

  const courseTitle = document.createElement("div");

  courseTitle.textContent =
    course?.title || "YouTube Playlist";

  courseTitle.style.cssText = `
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 12px;
    line-height: 1.35;
  `;

  body.appendChild(courseTitle);


  // ----------------------------------------------------------
  // Percentage
  // ----------------------------------------------------------

  const percentage = document.createElement("div");

  percentage.textContent =
    `${summary.completion_percentage}% watched`;

  percentage.style.cssText = `
    font-size: 22px;
    font-weight: 700;
    margin-bottom: 8px;
  `;

  body.appendChild(percentage);


  // ----------------------------------------------------------
  // Progress bar
  // ----------------------------------------------------------

  const progressTrack = document.createElement("div");

  progressTrack.style.cssText = `
    width: 100%;
    height: 7px;
    background: #374151;
    border-radius: 999px;
    overflow: hidden;
  `;

  const progressFill = document.createElement("div");

  progressFill.style.cssText = `
    width: ${Math.min(
      100,
      Math.max(
        0,
        Number(summary.completion_percentage) || 0
      )
    )}%;
    height: 100%;
    background: #3b82f6;
    border-radius: 999px;
    transition: width 0.3s ease;
  `;

  progressTrack.appendChild(progressFill);
  body.appendChild(progressTrack);


  // ----------------------------------------------------------
  // Statistics
  // ----------------------------------------------------------

  const stats = document.createElement("div");

  stats.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 12px;
  `;

  const watched = document.createElement("div");

  watched.textContent =
    `${summary.completed_lessons} / ${summary.total_lessons} completed`;

  watched.style.cssText = `
    padding: 9px;
    background: #1f2937;
    border-radius: 8px;
    font-size: 12px;
    color: #d1d5db;
  `;

  const remaining = document.createElement("div");

  remaining.textContent =
    `${formatCognivDuration(summary.remaining_seconds)} left`;

  remaining.style.cssText = `
    padding: 9px;
    background: #1f2937;
    border-radius: 8px;
    font-size: 12px;
    color: #d1d5db;
  `;

  stats.appendChild(watched);
  stats.appendChild(remaining);

  body.appendChild(stats);


  // ----------------------------------------------------------
  // Current lesson
  // ----------------------------------------------------------

  if (data.current_lesson) {
    const current = document.createElement("div");

    current.textContent =
      `Current: ${data.current_lesson.title}`;

    current.style.cssText = `
      margin-top: 12px;
      padding: 9px;
      background: #172033;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.4;
      color: #dbeafe;
    `;

    body.appendChild(current);
  }


  // ----------------------------------------------------------
  // Continue lesson
  // ----------------------------------------------------------

  if (data.continue_lesson) {
    const continueBox = document.createElement("div");

    continueBox.textContent =
      `Continue: ${data.continue_lesson.title}`;

    continueBox.style.cssText = `
      margin-top: 8px;
      padding: 9px;
      background: #111827;
      border: 1px solid #374151;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.4;
      color: #e5e7eb;
    `;

    body.appendChild(continueBox);
  }
}


// ============================================================
// Duration formatter
// ============================================================

function formatCognivDuration(seconds) {
  const totalSeconds =
    Math.max(0, Number(seconds) || 0);

  const hours =
    Math.floor(totalSeconds / 3600);

  const minutes =
    Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}


// ============================================================
// Add Cogniv status indicators to YouTube playlist
// ============================================================

function getCognivVideoId(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url, window.location.origin);

    if (parsed.hostname.includes("youtube.com")) {
      return parsed.searchParams.get("v");
    }

    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.replace("/", "");
    }
  } catch (error) {
    console.warn(
      "[Cogniv] Could not parse video URL:",
      url
    );
  }

  return null;
}


function applyCognivLessonStatuses(data) {
  const playlistRenderer =
    document.querySelector(
      "ytd-playlist-panel-renderer#playlist"
    );

  if (!playlistRenderer) {
    console.log(
      "[Cogniv] Playlist renderer not found."
    );
    return;
  }

  const items =
    playlistRenderer.querySelector("#items");

  if (!items) {
    console.log(
      "[Cogniv] Playlist items container not found."
    );
    return;
  }

  const lessons = data?.lessons || [];

  if (!lessons.length) {
    console.log(
      "[Cogniv] No lessons received from backend."
    );
    return;
  }

  // ----------------------------------------------------------
  // Build video-id → lesson map
  // ----------------------------------------------------------

  const lessonMap = new Map();

  lessons.forEach((lesson) => {
    const videoId =
      getCognivVideoId(lesson.video_url);

    if (videoId) {
      lessonMap.set(videoId, lesson);
    }
  });

  // ----------------------------------------------------------
  // Find YouTube playlist videos
  // ----------------------------------------------------------

  const youtubeItems = [
    ...items.querySelectorAll(
      "ytd-playlist-panel-video-renderer"
    )
  ];

  let matched = 0;
  let added = 0;

  youtubeItems.forEach((videoItem) => {
    // Remove an existing Cogniv indicator.
    videoItem
      .querySelector(".cogniv-lesson-status")
      ?.remove();

    const thumbnail =
      videoItem.querySelector("a#thumbnail");

    if (!thumbnail) {
      return;
    }

    const videoId =
      getCognivVideoId(thumbnail.href);

    if (!videoId) {
      return;
    }

    const lesson =
      lessonMap.get(videoId);

    if (!lesson) {
      return;
    }

    matched++;

    // --------------------------------------------------------
    // Create status badge
    // --------------------------------------------------------

    const badge =
      document.createElement("span");

    badge.className =
      "cogniv-lesson-status";

    badge.style.cssText = `
      position: absolute;
      top: 6px;
      left: 6px;

      min-width: 20px;
      height: 20px;

      padding: 0 5px;

      display: flex;
      align-items: center;
      justify-content: center;

      box-sizing: border-box;

      border-radius: 5px;

      font-family: Arial, sans-serif;
      font-size: 13px;
      font-weight: 700;

      z-index: 50;

      pointer-events: none;
    `;

    if (lesson.completed) {
      badge.textContent = "✓";
      badge.title = "Completed";

      badge.style.background =
        "rgba(22, 163, 74, 0.95)";

      badge.style.color = "#ffffff";

    } else if (
      Number(lesson.watched_seconds) > 0
    ) {
      badge.textContent = "▶";

      badge.title =
        `${lesson.percentage}% watched`;

      badge.style.background =
        "rgba(37, 99, 235, 0.95)";

      badge.style.color = "#ffffff";

    } else {
      // Not started — don't add a badge.
      return;
    }

    // YouTube thumbnails are positioned elements,
    // but make sure this remains a safe positioning context.
    if (
      getComputedStyle(thumbnail).position ===
      "static"
    ) {
      thumbnail.style.position = "relative";
    }

    thumbnail.appendChild(badge);

    added++;
  });

  // Keep the latest mapping available for debugging without
  // flooding the YouTube console on every DOM mutation.
  window.cognivPlaylistStatusStats = {
    lessons: lessons.length,
    youtubeItems: youtubeItems.length,
    matched,
    added,
  };
}


// ============================================================
// Watch for YouTube playlist changes
// ============================================================

function startCognivPlaylistStatusObserver() {
  const playlistRenderer =
    document.querySelector(
      "ytd-playlist-panel-renderer#playlist"
    );

  if (!playlistRenderer) {
    return;
  }

  const items =
    playlistRenderer.querySelector("#items");

  if (!items) {
    return;
  }

  if (window.cognivPlaylistStatusObserver) {
    window.cognivPlaylistStatusObserver.disconnect();
  }

  let statusUpdateTimer = null;

  const observer =
    new MutationObserver(() => {
      if (!window.cognivPlaylistProgress) {
        return;
      }

      clearTimeout(statusUpdateTimer);

      statusUpdateTimer = setTimeout(() => {
        applyCognivLessonStatuses(
          window.cognivPlaylistProgress
        );
      }, 300);
    });

  observer.observe(items, {
    childList: true,
    subtree: true,
  });

  window.cognivPlaylistStatusObserver =
    observer;
}

// ============================================================
// Watch for YouTube playlist changes
// ============================================================

function startCognivPlaylistStatusObserver() {
  const playlistRenderer =
    document.querySelector("ytd-playlist-panel-renderer#playlist");

  if (!playlistRenderer) {
    return;
  }

  const items =
    playlistRenderer.querySelector("#items");

  if (!items) {
    return;
  }

  const observer = new MutationObserver(() => {
    const panel =
      document.getElementById("cogniv-panel");

    if (!panel) {
      return;
    }

    // Statuses are applied when playlist DOM changes.
    if (window.cognivPlaylistProgress) {
      applyCognivLessonStatuses(
        window.cognivPlaylistProgress
      );
    }
  });

  observer.observe(items, {
    childList: true,
    subtree: true,
  });

  window.cognivPlaylistStatusObserver = observer;
}


// ============================================================
// Initialize Cogniv panel
// ============================================================

function initializeCognivPanel() {
  if (createCognivPanel()) {
    return;
  }

  const observer = new MutationObserver(() => {
    if (createCognivPanel()) {
      observer.disconnect();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  setTimeout(() => {
    observer.disconnect();
  }, 15000);
}


initializeCognivPanel();

