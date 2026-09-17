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
