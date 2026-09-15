console.log("[Cogniv] Content script loaded.");
console.log("[Cogniv] URL:", window.location.href);


/* =========================================================
   GET PLAYLIST ID
========================================================= */

function getPlaylistId() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  return params.get("list") || "";
}


/* =========================================================
   GET PLAYLIST TITLE
========================================================= */

function getPlaylistTitle() {

  const selectors = [

    "ytd-playlist-header-renderer h1",

    "ytd-playlist-header-renderer #title",

    "ytd-playlist-panel-renderer #title"

  ];


  for (const selector of selectors) {

    const element =
      document.querySelector(selector);

    if (!element) {
      continue;
    }


    const text =
      element.textContent?.trim();


    if (text) {
      return text;
    }

  }


  return document.title
    .replace(" - YouTube", "")
    .trim();
}


/* =========================================================
   DURATION
========================================================= */

function parseDuration(text) {

  if (!text) {
    return 0;
  }


  const parts =
    text
      .trim()
      .split(":")
      .map(Number);


  if (
    parts.some(
      Number.isNaN
    )
  ) {
    return 0;
  }


  if (parts.length === 2) {

    return (
      parts[0] * 60 +
      parts[1]
    );

  }


  if (parts.length === 3) {

    return (
      parts[0] * 3600 +
      parts[1] * 60 +
      parts[2]
    );

  }


  return 0;
}


/* =========================================================
   EXTRACT VIDEO
========================================================= */

function extractVideo(
  element,
  position
) {

  const titleElement =
    element.querySelector(
      "#video-title"
    );


  const thumbnail =
    element.querySelector(
      "a#thumbnail"
    );


  const title =
    titleElement
      ?.textContent
      ?.trim() || "";


  const href =
    titleElement
      ?.getAttribute("href") ||

    thumbnail
      ?.getAttribute("href") ||

    "";


  if (!title || !href) {
    return null;
  }


  let videoId = "";


  try {

    const url =
      new URL(
        href,
        window.location.origin
      );


    videoId =
      url.searchParams.get("v") || "";

  } catch {

    return null;

  }


  if (!videoId) {
    return null;
  }


  const durationElement =
    element.querySelector(
      "ytd-thumbnail-overlay-time-status-renderer span"
    );


  const durationText =
    durationElement
      ?.textContent
      ?.trim() || "";


  return {

    title,

    video_url:
      `https://www.youtube.com/watch?v=${videoId}`,

    duration_seconds:
      parseDuration(
        durationText
      ),

    duration_text:
      durationText,

    position

  };
}


/* =========================================================
   GET CURRENTLY LOADED VIDEOS
========================================================= */

function getVideos() {

  let elements =
    Array.from(
      document.querySelectorAll(
        "ytd-playlist-panel-video-renderer"
      )
    );


  if (elements.length === 0) {

    elements =
      Array.from(
        document.querySelectorAll(
          "ytd-playlist-video-renderer"
        )
      );

  }


  const videos = [];


  elements.forEach(
    (element, index) => {

      const video =
        extractVideo(
          element,
          index + 1
        );


      if (!video) {
        return;
      }


      if (
        videos.some(
          item =>
            item.video_url ===
            video.video_url
        )
      ) {
        return;
      }


      videos.push(video);

    }
  );


  return videos;
}


/* =========================================================
   PLAYLIST DATA
========================================================= */

function getPlaylistData() {

  const playlistId =
    getPlaylistId();


  const videos =
    getVideos();


  const data = {

    playlist_id:
      playlistId,

    playlist_title:
      getPlaylistTitle(),

    playlist_url:
      playlistId
        ? `https://www.youtube.com/playlist?list=${playlistId}`
        : "",

    current_page_url:
      window.location.href,

    videos

  };


  console.log(
    "[Cogniv] Playlist data requested:",
    data
  );


  return data;
}


/* =========================================================
   MESSAGE HANDLER
========================================================= */

chrome.runtime.onMessage.addListener(
  (
    message,
    sender,
    sendResponse
  ) => {

    console.log(
      "[Cogniv] Message received:",
      message.type
    );


    if (
      message.type ===
      "GET_PLAYLIST_DATA"
    ) {

      const data =
        getPlaylistData();


      sendResponse(data);


      return true;
    }

  }
);


/* =========================================================
   INITIAL DEBUG
========================================================= */

setTimeout(() => {

  console.log(
    "[Cogniv] Playlist ID:",
    getPlaylistId()
  );


  console.log(
    "[Cogniv] Videos currently loaded:",
    getVideos().length
  );

}, 3000);
