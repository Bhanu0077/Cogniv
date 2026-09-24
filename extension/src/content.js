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


async function getPlaylistVideos() {
  /*
     YouTube lazily renders playlist items.

     A normal querySelectorAll() only returns the items that
     currently exist in the DOM. For large playlists this can
     be substantially smaller than the real playlist.

     This scanner deliberately scrolls the playlist container,
     allows YouTube to load more items, and collects unique
     videos by YouTube video ID.

     IMPORTANT:
     This is a one-shot scan.
     It is NOT a MutationObserver.
  */

  const selectors = [
    "ytd-playlist-panel-video-renderer",
    "ytd-playlist-video-renderer"
  ];

  function getElements() {
    for (const selector of selectors) {
      const elements =
        Array.from(
          document.querySelectorAll(selector)
        );

      if (elements.length > 0) {
        return elements;
      }
    }

    return [];
  }


  function extractVideoFromElement(
    element,
    fallbackPosition
  ) {
    if (!element) {
      return null;
    }

    const titleElement =
      element.querySelector("#video-title") ||
      element.querySelector(
        "a[href*='/watch?v=']"
      );

    const title =
      titleElement?.textContent?.trim() || "";

    if (!title) {
      return null;
    }

    const links =
      Array.from(
        element.querySelectorAll("a[href]")
      );

    let videoUrl = "";

    for (const link of links) {
      const href =
        link.getAttribute("href") ||
        link.href ||
        "";

      if (
        !href.includes("watch?v=")
      ) {
        continue;
      }

      try {
        const parsed =
          new URL(
            href,
            window.location.origin
          );

        const videoId =
          parsed.searchParams.get("v");

        if (videoId) {
          videoUrl =
            `https://www.youtube.com/watch?v=${videoId}`;

          break;
        }

      } catch {
        // Ignore malformed links.
      }
    }

    if (!videoUrl) {
      return null;
    }

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
      position: fallbackPosition
    };
  }


  /*
     Find the scrollable playlist container.

     On the YouTube playlist side panel, the actual scrolling
     may occur on #items or one of its ancestors.
  */

  function findScrollContainer() {
    const firstItem =
      getElements()[0];

    if (!firstItem) {
      return null;
    }

    let node =
      firstItem.parentElement;

    while (
      node &&
      node !== document.body &&
      node !== document.documentElement
    ) {
      const style =
        window.getComputedStyle(node);

      const canScroll =
        (
          style.overflowY === "auto" ||
          style.overflowY === "scroll"
        ) &&
        node.scrollHeight >
        node.clientHeight + 10;

      if (canScroll) {
        return node;
      }

      node =
        node.parentElement;
    }

    /*
       Fallback: use the playlist items container.
    */

    const items =
      document.querySelector(
        "ytd-playlist-panel-renderer#playlist #items"
      );

    if (
      items &&
      items.scrollHeight >
      items.clientHeight + 10
    ) {
      return items;
    }

    return null;
  }


  const initialElements =
    getElements();

  if (!initialElements.length) {
    return [];
  }


  const videoMap =
    new Map();


  function collectVisibleVideos() {
    const elements =
      getElements();

    for (const element of elements) {
      const temporaryPosition =
        videoMap.size + 1;

      const video =
        extractVideoFromElement(
          element,
          temporaryPosition
        );

      if (!video) {
        continue;
      }

      let videoId = "";

      try {
        videoId =
          new URL(video.video_url)
            .searchParams
            .get("v") || "";
      } catch {
        continue;
      }

      if (!videoId) {
        continue;
      }

      /*
         Preserve the first occurrence of a video.
         YouTube can recycle DOM nodes while scrolling.
      */

      if (!videoMap.has(videoId)) {
        videoMap.set(
          videoId,
          video
        );
      }
    }
  }


  /*
     First collection before scrolling.
  */

  collectVisibleVideos();


  const scrollContainer =
    findScrollContainer();

  if (!scrollContainer) {
    console.log(
      "[Cogniv] No dedicated playlist scroll container found. " +
      `Returning ${videoMap.size} videos.`
    );

    return Array.from(
      videoMap.values()
    ).map((video, index) => ({
      ...video,
      position: index + 1
    }));
  }


  const originalScrollTop =
    scrollContainer.scrollTop;


  console.log(
    "[Cogniv] Starting full playlist scan..."
  );


  let stableRounds = 0;
  let previousCount =
    videoMap.size;

  const maxRounds = 120;


  for (
    let round = 0;
    round < maxRounds;
    round++
  ) {

    /*
       Scroll by roughly one viewport.
       This lets YouTube's lazy loader react naturally.
    */

    const step =
      Math.max(
        300,
        Math.floor(
          scrollContainer.clientHeight * 0.8
        )
      );

    const nextTop =
      Math.min(
        scrollContainer.scrollTop + step,
        scrollContainer.scrollHeight
      );

    scrollContainer.scrollTop =
      nextTop;


    /*
       Give YouTube time to render newly loaded items.
    */

    await new Promise(
      resolve =>
        setTimeout(resolve, 250)
    );


    collectVisibleVideos();


    const currentCount =
      videoMap.size;


    if (
      currentCount ===
      previousCount
    ) {
      stableRounds++;
    } else {
      stableRounds = 0;

      console.log(
        "[Cogniv] Playlist scan:",
        currentCount,
        "videos found"
      );
    }


    previousCount =
      currentCount;


    /*
       We consider the scan complete when:
       - we are at the bottom, AND
       - no new videos appeared for several rounds.
    */

    const atBottom =
      scrollContainer.scrollTop +
      scrollContainer.clientHeight >=
      scrollContainer.scrollHeight - 20;


    if (
      atBottom &&
      stableRounds >= 5
    ) {
      break;
    }


    /*
       YouTube may increase scrollHeight after loading more
       videos, so continue even when we temporarily reach the
       previous bottom.
    */

    if (
      atBottom
    ) {
      await new Promise(
        resolve =>
          setTimeout(resolve, 500)
      );

      collectVisibleVideos();

      if (
        videoMap.size ===
        previousCount
      ) {
        stableRounds++;
      } else {
        stableRounds = 0;
        previousCount =
          videoMap.size;
      }
    }
  }


  /*
     Restore the user's original position.
  */

  scrollContainer.scrollTop =
    originalScrollTop;


  /*
     Convert Map → ordered array.

     The DOM order can change while YouTube recycles nodes,
     so we use the order in which unique videos were first
     discovered.
  */

  const videos =
    Array.from(
      videoMap.values()
    ).map(
      (video, index) => ({
        ...video,
        position: index + 1
      })
    );


  console.log(
    "[Cogniv] Full playlist scan complete:",
    videos.length,
    "videos"
  );


  return videos;
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


async function getPlaylistData() {
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
    await getPlaylistVideos();

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


/*
   =========================================================
   COGNIV VIDEO PROGRESS TRACKER
   =========================================================

   Important rule:

   The video element and the YouTube URL must represent the
   SAME video before progress is sent.

   YouTube uses SPA navigation, so during navigation the URL
   can change before the old <video> element is replaced.
   Never mix those two states.
*/

let cognivTrackedVideoId = "";
let cognivEnsuredLessonId = null;
let cognivTrackerGeneration = 0;
let cognivInitTimer = null;


async function ensureCurrentVideoLesson(video, videoId, videoUrl) {
  if (
    !video ||
    !videoId ||
    !videoUrl
  ) {
    return null;
  }

  const playlistId =
    getPlaylistId();

  if (!playlistId) {
    console.log(
      "[Cogniv Tracker] No playlist ID found; skipping lesson ensure."
    );

    return null;
  }

  const title =
    document.title
      .replace(" - YouTube", "")
      .trim();

  const durationSeconds =
    Number.isFinite(Number(video.duration))
      ? Math.floor(Number(video.duration))
      : 0;

  const response =
    await chrome.runtime.sendMessage({
      type: "ENSURE_LESSON",
      data: {
        user_id: 1,
        playlist_id: playlistId,
        video_id: videoId,
        video_url: videoUrl,
        title,
        duration_seconds: durationSeconds,
        position: 0
      }
    });

  if (
    !response ||
    response.status !== "ok" ||
    !response.lesson
  ) {
    throw new Error(
      response?.message ||
      "Failed to ensure Cogniv lesson."
    );
  }

  cognivEnsuredLessonId =
    response.lesson.id;

  console.log(
    "[Cogniv Tracker] Lesson ensured:",
    response.lesson
  );

  return response.lesson;
}


function getTrackerVideoId() {
  try {
    const params = new URLSearchParams(
      window.location.search
    );

    return params.get("v") || "";
  } catch (error) {
    return "";
  }
}


function isTrackerVideoValid(video) {
  if (!video) {
    return false;
  }

  if (video !== currentVideo) {
    return false;
  }

  const urlVideoId = getTrackerVideoId();

  if (!urlVideoId) {
    return false;
  }

  const elementVideoId =
    video.dataset.cognivVideoId || "";

  if (!elementVideoId) {
    return false;
  }

  if (urlVideoId !== elementVideoId) {
    console.log(
      "[Cogniv Tracker] Ignoring mismatched video:",
      {
        urlVideoId,
        elementVideoId
      }
    );

    return false;
  }

  return true;
}


async function sendProgress(
  completed = false,
  eventVideo = null,
  eventVideoId = ""
) {
  const video =
    eventVideo || currentVideo;

  if (!isTrackerVideoValid(video)) {
    console.log(
      "[Cogniv Tracker] Ignoring stale progress event."
    );

    return;
  }

  const currentVideoId =
    getTrackerVideoId();

  if (
    eventVideoId &&
    eventVideoId !== currentVideoId
  ) {
    console.log(
      "[Cogniv Tracker] Ignoring old video event:",
      {
        eventVideoId,
        currentVideoId
      }
    );

    return;
  }

  const trackedVideoId =
    video.dataset.cognivVideoId || "";

  if (
    !trackedVideoId ||
    trackedVideoId !== currentVideoId
  ) {
    console.log(
      "[Cogniv Tracker] Video identity mismatch."
    );

    return;
  }

  const currentTime =
    Number(video.currentTime);

  const duration =
    Number(video.duration);

  if (
    !Number.isFinite(currentTime) ||
    currentTime < 0
  ) {
    return;
  }

  if (
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return;
  }

  const watchedSeconds =
    Math.min(
      Math.floor(currentTime),
      Math.floor(duration)
    );

  const videoUrl =
    getCurrentVideoUrl();

  if (!videoUrl) {
    return;
  }

  const finalCompleted =
    completed ||
    watchedSeconds >=
    Math.floor(duration * 0.9);

  const progressData = {
    user_id: 1,
    video_url: videoUrl,
    watched_seconds: watchedSeconds,
    duration_seconds: Math.floor(duration),
    completed: finalCompleted
  };

  console.log(
    "[Cogniv] Sending VERIFIED progress:",
    progressData
  );

  try {
    const response =
      await chrome.runtime.sendMessage({
        type: "VIDEO_PROGRESS",
        data: progressData
      });

    console.log(
      "[Cogniv] Progress response:",
      response
    );

    return response;

  } catch (error) {
    console.error(
      "[Cogniv] Progress message error:",
      error
    );

    return null;
  }
}


function handlePlay(event) {
  const video =
    event.currentTarget;

  if (
    video !== currentVideo ||
    !isTrackerVideoValid(video)
  ) {
    return;
  }

  console.log(
    "[Cogniv Tracker] Video playing:",
    cognivTrackedVideoId
  );

  startTracking();
}


function handlePause(event) {
  const video =
    event.currentTarget;

  if (
    video !== currentVideo ||
    !isTrackerVideoValid(video)
  ) {
    return;
  }

  console.log(
    "[Cogniv Tracker] Video paused:",
    cognivTrackedVideoId
  );

  sendProgress(
    false,
    video,
    cognivTrackedVideoId
  );

  stopTracking();
}


function handleEnded(event) {
  const video =
    event.currentTarget;

  if (
    video !== currentVideo ||
    !isTrackerVideoValid(video)
  ) {
    return;
  }

  console.log(
    "[Cogniv Tracker] Video ended:",
    cognivTrackedVideoId
  );

  sendProgress(
    true,
    video,
    cognivTrackedVideoId
  );

  stopTracking();
}


function attachVideoListeners(video, videoId) {
  if (!video || !videoId) {
    return;
  }

  /*
     If this DOM element was previously used for another
     YouTube video, remove the old Cogniv listeners first.
  */

  if (
    video.dataset.cognivTracking === "true"
  ) {
    if (
      video.dataset.cognivVideoId === videoId
    ) {
      return;
    }

    video.removeEventListener(
      "play",
      handlePlay
    );

    video.removeEventListener(
      "pause",
      handlePause
    );

    video.removeEventListener(
      "ended",
      handleEnded
    );

    delete video.dataset.cognivTracking;
  }

  video.dataset.cognivTracking =
    "true";

  video.dataset.cognivVideoId =
    videoId;

  console.log(
    "[Cogniv Tracker] Attaching listeners:",
    videoId
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

  const generation =
    cognivTrackerGeneration;

  trackingInterval =
    setInterval(() => {

      /*
         Stop immediately if YouTube navigated to another
         video while this interval was still alive.
      */

      if (
        generation !==
        cognivTrackerGeneration
      ) {
        stopTracking();
        return;
      }

      const video =
        currentVideo;

      if (
        !video ||
        !isTrackerVideoValid(video)
      ) {
        return;
      }

      sendProgress(
        false,
        video,
        cognivTrackedVideoId
      );

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


function invalidateCurrentTracker() {
  cognivTrackerGeneration++;

  stopTracking();

  currentVideo = null;
  currentVideoUrl = "";
  cognivTrackedVideoId = "";

  lastSentSeconds = -1;
}


function scheduleTrackerInitialization(delay = 500) {
  if (cognivInitTimer) {
    clearTimeout(cognivInitTimer);
  }

  cognivInitTimer =
    setTimeout(() => {
      cognivInitTimer = null;

      initializeVideoTracker();

    }, delay);
}


function initializeVideoTracker() {
  const video =
    getCurrentVideoElement();

  const videoId =
    getTrackerVideoId();

  const videoUrl =
    getCurrentVideoUrl();

  if (
    !video ||
    !videoId ||
    !videoUrl
  ) {
    return;
  }

  /*
     YouTube may have changed the URL while the old video
     element is still in the DOM.

     Never attach the old element to the new URL.
  */

  const existingElementId =
    video.dataset.cognivVideoId || "";

  if (
    existingElementId &&
    existingElementId !== videoId
  ) {
    console.log(
      "[Cogniv Tracker] Waiting for new video element:",
      {
        urlVideoId: videoId,
        elementVideoId: existingElementId
      }
    );

    scheduleTrackerInitialization(300);

    return;
  }

  /*
     Wait until YouTube has loaded metadata for the new
     video. This prevents reading stale duration/currentTime.
  */

  if (
    !Number.isFinite(
      Number(video.duration)
    ) ||
    Number(video.duration) <= 0
  ) {
    scheduleTrackerInitialization(300);
    return;
  }

  const changed =
    currentVideo !== video ||
    currentVideoUrl !== videoUrl ||
    cognivTrackedVideoId !== videoId;

  if (changed) {
    /*
       IMPORTANT:
       Do NOT call sendProgress() for the old video here.

       At this point window.location may already point to
       the NEW video. Sending the old element's currentTime
       would corrupt the new video's progress.
    */

    stopTracking();

    cognivTrackerGeneration++;

    currentVideo = video;

    currentVideoUrl =
      videoUrl;

    cognivTrackedVideoId =
      videoId;

    lastSentSeconds = -1;

    video.dataset.cognivVideoId =
      videoId;

    console.log(
      "[Cogniv Tracker] Current video VERIFIED:",
      {
        videoId,
        videoUrl
      }
    );

    /*
       The video has passed all stale-video checks.
       Ensure its Cogniv lesson exists before normal
       progress tracking continues.
    */

    ensureCurrentVideoLesson(
      video,
      videoId,
      videoUrl
    ).catch(error => {
      console.error(
        "[Cogniv Tracker] Lesson ensure failed:",
        error
      );
    });
  }

  attachVideoListeners(
    video,
    videoId
  );

  if (!video.paused) {
    startTracking();
  }

  trackerInitialized = true;
}


/* =========================================================
   YOUTUBE SPA NAVIGATION
   ========================================================= */

let lastUrl =
  window.location.href;


setInterval(() => {

  const currentUrl =
    window.location.href;

  if (
    currentUrl === lastUrl
  ) {
    return;
  }

  console.log(
    "[Cogniv Tracker] YouTube navigation detected:",
    {
      from: lastUrl,
      to: currentUrl
    }
  );

  lastUrl =
    currentUrl;

  /*
     Immediately invalidate the old video.

     This is the critical protection against:

       OLD currentTime + NEW URL
  */

  invalidateCurrentTracker();

  /*
     YouTube needs time to replace/load the new video
     element. Initialization will retry until the video
     is actually ready.
  */

  scheduleTrackerInitialization(500);

}, 250);



/* =========================================================
   MESSAGE HANDLER
   ========================================================= */

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {

    if (
      message.type ===
      "GET_PLAYLIST_DATA"
    ) {

      getPlaylistData()
        .then(data => {
          sendResponse(data);
        })
        .catch(error => {
          sendResponse({
            error: error.message
          });
        });

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

setTimeout(async () => {

  currentPlaylistId =
    getPlaylistId();

  console.log(
    "[Cogniv] Playlist ID:",
    currentPlaylistId
  );

  try {

    const data =
      await getPlaylistData();

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
  // Playlist filters
  // ----------------------------------------------------------

  const filterBar =
    document.createElement("div");

  filterBar.id =
    "cogniv-playlist-filters";

  filterBar.style.cssText = `
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    margin-bottom: 10px;
  `;

  const filters = [
    ["all", "All"],
    ["in-progress", "Active"],
    ["completed", "Done"],
    ["not-started", "New"],
  ];

  filters.forEach(([value, label], index) => {
    const button =
      document.createElement("button");

    button.type = "button";
    button.dataset.filter = value;
    button.textContent = label;

    button.style.cssText = `
      border: 1px solid #374151;
      border-radius: 6px;
      padding: 6px 3px;

      background: ${index === 0
        ? "#2563eb"
        : "#1f2937"};

      color: #e5e7eb;

      font-family: Arial, sans-serif;
      font-size: 10px;
      font-weight: 600;

      cursor: pointer;
    `;

    button.addEventListener(
      "click",
      () => {
        document
          .querySelectorAll(
            "#cogniv-playlist-filters button"
          )
          .forEach((other) => {
            other.style.background =
              "#1f2937";
          });

        button.style.background =
          "#2563eb";

        applyCognivPlaylistFilter(
          value,
          data
        );
      }
    );

    filterBar.appendChild(button);
  });

  body.appendChild(filterBar);


  // ----------------------------------------------------------
  // Course title
  // ----------------------------------------------------------

  const courseTitle = document.createElement("div");

  courseTitle.textContent =
    course?.title || "YouTube Playlist";

  courseTitle.style.cssText = `
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 10px;
    line-height: 1.35;
  `;

  body.appendChild(courseTitle);


  // ----------------------------------------------------------
  // Overall playlist percentage
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
  // Overall playlist progress bar
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
  // Current video section
  // ----------------------------------------------------------

  const currentSection = document.createElement("div");

  currentSection.id =
    "cogniv-current-video-section";

  currentSection.style.cssText = `
    margin-top: 12px;
    padding: 10px;

    background: #172033;

    border-radius: 8px;

    box-sizing: border-box;
  `;

  const currentLabel = document.createElement("div");

  currentLabel.textContent =
    "CURRENT VIDEO";

  currentLabel.style.cssText = `
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #9ca3af;
    margin-bottom: 5px;
  `;

  currentSection.appendChild(currentLabel);


  const currentTitle = document.createElement("div");

  currentTitle.id =
    "cogniv-current-video-title";

  currentTitle.style.cssText = `
    font-size: 12px;
    font-weight: 600;
    line-height: 1.35;
    color: #f3f4f6;
    margin-bottom: 7px;
  `;

  currentSection.appendChild(currentTitle);


  const currentTimes = document.createElement("div");

  currentTimes.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;

    font-size: 11px;
    color: #d1d5db;

    margin-bottom: 6px;
  `;

  const currentElapsed =
    document.createElement("span");

  currentElapsed.id =
    "cogniv-current-elapsed";

  const currentRemaining =
    document.createElement("span");

  currentRemaining.id =
    "cogniv-current-remaining";

  currentTimes.appendChild(currentElapsed);
  currentTimes.appendChild(currentRemaining);

  currentSection.appendChild(currentTimes);


  const currentTrack =
    document.createElement("div");

  currentTrack.style.cssText = `
    width: 100%;
    height: 5px;

    background: #374151;

    border-radius: 999px;

    overflow: hidden;
  `;

  const currentFill =
    document.createElement("div");

  currentFill.id =
    "cogniv-current-progress-fill";

  currentFill.style.cssText = `
    width: 0%;
    height: 100%;

    background: #60a5fa;

    border-radius: 999px;

    transition: width 0.2s linear;
  `;

  currentTrack.appendChild(currentFill);
  currentSection.appendChild(currentTrack);

  body.appendChild(currentSection);


  // ----------------------------------------------------------
  // Statistics
  // ----------------------------------------------------------

  const stats = document.createElement("div");

  stats.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 10px;
  `;

  const completed =
    document.createElement("div");

  completed.textContent =
    `${summary.completed_lessons} / ${summary.total_lessons} completed`;

  completed.style.cssText = `
    padding: 9px;
    background: #1f2937;
    border-radius: 8px;
    font-size: 12px;
    color: #d1d5db;
  `;

  const remaining =
    document.createElement("div");

  remaining.textContent =
    `${formatCognivDuration(summary.remaining_seconds)} left`;

  remaining.style.cssText = `
    padding: 9px;
    background: #1f2937;
    border-radius: 8px;
    font-size: 12px;
    color: #d1d5db;
  `;

  stats.appendChild(completed);
  stats.appendChild(remaining);

  body.appendChild(stats);


  // ----------------------------------------------------------
  // Continue lesson
  // ----------------------------------------------------------

  if (data.continue_lesson) {
    const continueLesson =
      data.continue_lesson;

    const continueBox =
      document.createElement("div");

    continueBox.textContent =
      `Continue: ${continueLesson.title}`;

    continueBox.style.cssText = `
      display: block;

      width: 100%;

      margin-top: 8px;
      padding: 9px;

      box-sizing: border-box;

      background: #111827;

      border: 1px solid #374151;

      border-radius: 8px;

      font-family: Arial, sans-serif;
      font-size: 12px;
      line-height: 1.4;

      color: #e5e7eb;

      text-align: left;

      cursor: pointer;

      transition:
        background 0.15s ease,
        border-color 0.15s ease;
    `;

    continueBox.title =
      "Open this video in the YouTube playlist";

    continueBox.addEventListener(
      "mouseenter",
      () => {
        continueBox.style.background =
          "#1f2937";

        continueBox.style.borderColor =
          "#4b5563";
      }
    );

    continueBox.addEventListener(
      "mouseleave",
      () => {
        continueBox.style.background =
          "#111827";

        continueBox.style.borderColor =
          "#374151";
      }
    );

    continueBox.addEventListener(
      "click",
      () => {
        if (!continueLesson.video_url) {
          console.warn(
            "[Cogniv] Continue video URL missing."
          );
          return;
        }

        try {
          const videoUrl =
            new URL(
              continueLesson.video_url
            );

          const videoId =
            videoUrl.searchParams.get("v");

          const playlistId =
            data.course?.youtube_playlist_id;

          if (!videoId) {
            console.warn(
              "[Cogniv] Continue video ID missing."
            );
            return;
          }

          if (!playlistId) {
            console.warn(
              "[Cogniv] Continue playlist ID missing."
            );
            return;
          }

          const continueUrl =
            `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&list=${encodeURIComponent(playlistId)}`;

          window.location.href =
            continueUrl;

        } catch (error) {
          console.warn(
            "[Cogniv] Could not open Continue video:",
            error
          );
        }
      }
    );

    body.appendChild(continueBox);
  }


  // ----------------------------------------------------------
  // Start live current-video progress
  // ----------------------------------------------------------

  startCognivCurrentVideoProgress(data);
}


// ============================================================
// Filter YouTube playlist items
// ============================================================

function applyCognivPlaylistFilter(
  filter,
  data
) {
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

  const lessons =
    data?.lessons || [];

  const lessonMap = new Map();

  lessons.forEach((lesson) => {
    const videoId =
      getCognivVideoId(
        lesson.video_url
      );

    if (videoId) {
      lessonMap.set(
        videoId,
        lesson
      );
    }
  });

  const youtubeItems = [
    ...items.querySelectorAll(
      "ytd-playlist-panel-video-renderer"
    )
  ];

  youtubeItems.forEach((videoItem) => {
    const thumbnail =
      videoItem.querySelector(
        "a#thumbnail"
      );

    if (!thumbnail) {
      return;
    }

    const videoId =
      getCognivVideoId(
        thumbnail.href
      );

    const lesson =
      lessonMap.get(videoId);

    // Don't hide videos Cogniv doesn't know.
    if (!lesson) {
      videoItem.style.display = "";
      return;
    }

    let show = true;

    if (filter === "completed") {
      show = Boolean(lesson.completed);

    } else if (filter === "in-progress") {
      show =
        !lesson.completed &&
        Number(lesson.watched_seconds) > 0;

    } else if (filter === "not-started") {
      show =
        !lesson.completed &&
        Number(lesson.watched_seconds) <= 0;
    }

    videoItem.style.display =
      show ? "" : "none";
  });
}


// ============================================================
// Live current-video progress
// ============================================================

function startCognivCurrentVideoProgress(data) {
  if (window.cognivCurrentVideoTimer) {
    clearInterval(
      window.cognivCurrentVideoTimer
    );
  }

  function updateCurrentVideo() {
    const video =
      document.querySelector(
        "video.html5-main-video"
      );

    const titleElement =
      document.getElementById(
        "cogniv-current-video-title"
      );

    const elapsedElement =
      document.getElementById(
        "cogniv-current-elapsed"
      );

    const remainingElement =
      document.getElementById(
        "cogniv-current-remaining"
      );

    const fill =
      document.getElementById(
        "cogniv-current-progress-fill"
      );

    if (
      !video ||
      !titleElement ||
      !elapsedElement ||
      !remainingElement ||
      !fill
    ) {
      return;
    }

    const duration =
      Number(video.duration);

    const currentTime =
      Math.max(
        0,
        Number(video.currentTime) || 0
      );

    if (
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      return;
    }

    const percentage =
      Math.min(
        100,
        Math.max(
          0,
          (currentTime / duration) * 100
        )
      );

    const remainingSeconds =
      Math.max(
        0,
        duration - currentTime
      );

    // --------------------------------------------------------
    // Find current Cogniv lesson
    // --------------------------------------------------------

    const videoId =
      getCognivVideoId(
        window.location.href
      );

    const lesson =
      (data.lessons || []).find(
        (item) =>
          getCognivVideoId(
            item.video_url
          ) === videoId
      );

    if (lesson) {
      titleElement.textContent =
        lesson.title;
    } else {
      titleElement.textContent =
        document.title
          .replace(" - YouTube", "")
          .trim() ||
        "Current video";
    }

    // --------------------------------------------------------
    // Update numbers
    // --------------------------------------------------------

    elapsedElement.textContent =
      formatCognivTime(currentTime);

    remainingElement.textContent =
      `${formatCognivTime(remainingSeconds)} left`;

    // --------------------------------------------------------
    // Update bar
    // --------------------------------------------------------

    fill.style.width =
      `${percentage}%`;
  }

  updateCurrentVideo();

  window.cognivCurrentVideoTimer =
    setInterval(
      updateCurrentVideo,
      500
    );
}


// ============================================================
// Format current video time
// ============================================================

function formatCognivTime(seconds) {
  const total =
    Math.max(
      0,
      Math.floor(
        Number(seconds) || 0
      )
    );

  const hours =
    Math.floor(total / 3600);

  const minutes =
    Math.floor(
      (total % 3600) / 60
    );

  const secs =
    total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}`;
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

function injectCognivStatusStyles() {
  if (document.getElementById("cogniv-status-styles")) {
    return;
  }

  const style = document.createElement("style");

  style.id = "cogniv-status-styles";

  style.textContent = `
    ytd-playlist-panel-video-renderer.cogniv-in-progress
    #video-title::before {
      content: "▶";

      display: inline-flex;

      align-items: center;
      justify-content: center;

      width: 18px;
      height: 18px;

      margin-right: 6px;

      border-radius: 50%;

      background: #2563eb;
      color: #ffffff;

      font-size: 9px;
      font-weight: 700;

      vertical-align: middle;
    }

    ytd-playlist-panel-video-renderer.cogniv-completed
    #video-title::before {
      content: "✓";

      display: inline-flex;

      align-items: center;
      justify-content: center;

      width: 18px;
      height: 18px;

      margin-right: 6px;

      border-radius: 50%;

      background: #16a34a;
      color: #ffffff;

      font-size: 11px;
      font-weight: 700;

      vertical-align: middle;
    }

    ytd-playlist-panel-video-renderer.cogniv-current {
      border-left: 3px solid #60a5fa !important;
      background: rgba(59, 130, 246, 0.08) !important;
    }

    ytd-playlist-panel-video-renderer.cogniv-current
    #video-title {
      font-weight: 700 !important;
    }

    .cogniv-video-progress {
      display: block;
      width: 100%;
      max-width: 240px;
      height: 3px;
      margin-top: 4px;
      border-radius: 999px;
      background: #374151;
      overflow: hidden;
    }

    .cogniv-video-progress-fill {
      height: 100%;
      width: 0%;
      border-radius: 999px;
      background: #60a5fa;
    }

    .cogniv-video-progress-label {
      display: block;
      margin-top: 2px;
      font-family: Arial, sans-serif;
      font-size: 10px;
      line-height: 1.2;
      color: #9ca3af;
    }
    }
  `;

  document.head.appendChild(style);
}


function getCognivVideoId(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed =
      new URL(url, window.location.origin);

    if (
      parsed.hostname.includes("youtube.com")
    ) {
      return parsed.searchParams.get("v");
    }

    if (
      parsed.hostname === "youtu.be"
    ) {
      return parsed.pathname.replace("/", "");
    }
  } catch {
    return null;
  }

  return null;
}


function applyCognivLessonStatuses(data) {
  injectCognivStatusStyles();

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

  const lessons =
    data?.lessons || [];

  if (!lessons.length) {
    return;
  }

  // ----------------------------------------------------------
  // Build Cogniv video ID → lesson map
  // ----------------------------------------------------------

  const lessonMap = new Map();

  lessons.forEach((lesson) => {
    const videoId =
      getCognivVideoId(
        lesson.video_url
      );

    if (videoId) {
      lessonMap.set(
        videoId,
        lesson
      );
    }
  });

  // ----------------------------------------------------------
  // Match visible YouTube videos
  // ----------------------------------------------------------

  const youtubeItems = [
    ...items.querySelectorAll(
      "ytd-playlist-panel-video-renderer"
    )
  ];

  let matched = 0;
  let inProgress = 0;
  let completed = 0;

  const currentVideoId =
    getCognivVideoId(window.location.href);

  youtubeItems.forEach((videoItem) => {
    // Clear previous Cogniv classes.
    videoItem.classList.remove(
      "cogniv-in-progress",
      "cogniv-completed",
      "cogniv-current"
    );

    const thumbnail =
      videoItem.querySelector(
        "a#thumbnail"
      );

    if (!thumbnail) {
      return;
    }

    const videoId =
      getCognivVideoId(
        thumbnail.href
      );

    if (!videoId) {
      return;
    }

    const lesson =
      lessonMap.get(videoId);

    if (!lesson) {
      return;
    }

    matched++;

    // Remove any previous Cogniv progress UI.
    videoItem
      .querySelector(".cogniv-video-progress")
      ?.remove();

    videoItem
      .querySelector(".cogniv-video-progress-label")
      ?.remove();

    // --------------------------------------------------------
    // Per-video progress
    // --------------------------------------------------------

    const watchedSeconds =
      Number(lesson.watched_seconds) || 0;

    const durationSeconds =
      Number(lesson.duration_seconds) || 0;

    let videoPercentage = 0;

    if (durationSeconds > 0) {
      videoPercentage =
        Math.min(
          100,
          Math.max(
            0,
            (watchedSeconds / durationSeconds) * 100
          )
        );
    }

    if (
      watchedSeconds > 0 &&
      !lesson.completed
    ) {
      const titleElement =
        videoItem.querySelector("#video-title");

      if (titleElement) {
        const progress =
          document.createElement("span");

        progress.className =
          "cogniv-video-progress";

        const fill =
          document.createElement("span");

        fill.className =
          "cogniv-video-progress-fill";

        fill.style.width =
          `${videoPercentage}%`;

        progress.appendChild(fill);

        const label =
          document.createElement("span");

        label.className =
          "cogniv-video-progress-label";

        label.textContent =
          `${videoPercentage.toFixed(1)}% watched`;

        titleElement.appendChild(progress);
        titleElement.appendChild(label);
      }
    }

    // Highlight the video currently open in YouTube.
    if (
      currentVideoId &&
      videoId === currentVideoId
    ) {
      videoItem.classList.add(
        "cogniv-current"
      );
    }

    if (lesson.completed) {
      videoItem.classList.add(
        "cogniv-completed"
      );

      completed++;

    } else if (
      Number(
        lesson.watched_seconds
      ) > 0
    ) {
      videoItem.classList.add(
        "cogniv-in-progress"
      );

      inProgress++;
    }
  });

  window.cognivPlaylistStatusStats = {
    lessons: lessons.length,
    youtubeItems: youtubeItems.length,
    matched,
    inProgress,
    completed,
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

