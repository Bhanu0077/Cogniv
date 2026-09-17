console.log(
  "[Cogniv] Background service worker started."
);


const COGNIV_API =
  "http://localhost:5000";


chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {

    console.log(
      "[Cogniv Background] Received:",
      message.type
    );


    /* ========================================
       PING
    ======================================== */

    if (
      message.type === "PING"
    ) {

      sendResponse({

        status: "ok",

        message:
          "Background is working"

      });

      return true;
    }


    /* ========================================
       SCAN
    ======================================== */

    if (
      message.type ===
      "SCAN_ACTIVE_TAB"
    ) {

      scanActiveTab()

        .then(data => {

          sendResponse({

            status: "ok",

            detected: true,

            data

          });

        })

        .catch(error => {

          console.error(
            "[Cogniv Background] Scan error:",
            error
          );


          sendResponse({

            status: "error",

            detected: false,

            message:
              error.message

          });

        });


      return true;
    }


    /* ========================================
       IMPORT
    ======================================== */

    if (
      message.type ===
      "IMPORT_PLAYLIST"
    ) {

      importPlaylist(
        message.data
      )

        .then(result => {

          console.log(
            "[Cogniv Background] Import result:",
            result
          );


          sendResponse(result);

        })

        .catch(error => {

          console.error(
            "[Cogniv Background] Import error:",
            error
          );


          sendResponse({

            status: "error",

            message:
              error.message

          });

        });


      return true;
    }
    if (message.type === "VIDEO_PROGRESS") {
      sendVideoProgress(message.data)
        .then(result => {
          console.log(
            "[Cogniv Background] Video progress result:",
            result
          );

          sendResponse(result);
        })
        .catch(error => {
          console.error(
            "[Cogniv Background] Video progress error:",
            error
          );

          sendResponse({
            status: "error",
            message: error.message
          });
        });

      return true;
    }
  }
);


/* =========================================================
   SCAN
========================================================= */

async function scanActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  const tab = tabs[0];

  if (!tab || !tab.id) {
    throw new Error("No active tab found.");
  }

  if (!tab.url || !tab.url.includes("youtube.com")) {
    throw new Error("Please open YouTube first.");
  }

  console.log(
    "[Cogniv Background] Active tab:",
    tab.url
  );

  let data;

  try {
    // Try communicating with the existing content script
    data = await chrome.tabs.sendMessage(
      tab.id,
      {
        type: "GET_PLAYLIST_DATA"
      }
    );

    console.log(
      "[Cogniv Background] Existing content script responded."
    );

  } catch (error) {

    console.warn(
      "[Cogniv Background] Content script not found. Injecting it..."
    );

    // Inject content.js into the current YouTube tab
    await chrome.scripting.executeScript({
      target: {
        tabId: tab.id
      },
      files: [
        "src/content.js"
      ]
    });

    console.log(
      "[Cogniv Background] Content script injected."
    );

    // Give the content script a moment to initialize
    await new Promise(resolve =>
      setTimeout(resolve, 300)
    );

    // Try again
    data = await chrome.tabs.sendMessage(
      tab.id,
      {
        type: "GET_PLAYLIST_DATA"
      }
    );

    console.log(
      "[Cogniv Background] Content script responded after injection."
    );
  }

  console.log(
    "[Cogniv Background] Data from content script:",
    data
  );

  if (!data) {
    throw new Error(
      "Content script returned no data."
    );
  }

  if (!data.playlist_id) {
    throw new Error(
      "No playlist ID detected."
    );
  }

  if (
    !Array.isArray(data.videos) ||
    data.videos.length === 0
  ) {
    throw new Error(
      "Playlist detected, but no videos were found."
    );
  }

  return data;
}


/* =========================================================
   IMPORT
========================================================= */

async function importPlaylist(
  playlistData
) {

  console.log(
    "[Cogniv Background] Sending playlist to:",
    COGNIV_API
  );


  const response =
    await fetch(

      `${COGNIV_API}/api/import/youtube-playlist`,

      {

        method: "POST",

        headers: {

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify({

            user_id: 1,

            playlist_id:
              playlistData.playlist_id,

            playlist_title:
              playlistData.playlist_title,

            playlist_url:
              playlistData.playlist_url,

            videos:
              playlistData.videos

          })

        }

      );


  console.log(
    "[Cogniv Background] HTTP status:",
    response.status
  );


  let result;


  try {

    result =
      await response.json();

  } catch {

    throw new Error(
      `Backend returned HTTP ${response.status} without valid JSON.`
    );

  }


  console.log(
    "[Cogniv Background] Backend response:",
    result
  );


  if (!response.ok) {

    throw new Error(

      result.message ||
      result.error ||
      `Backend error: HTTP ${response.status}`

    );

  }


  return {

    status: "ok",

    ...result

  };

}

async function sendVideoProgress(progressData) {
  const response = await fetch(
    `${COGNIV_API}/api/extension/progress`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(
        progressData
      )
    }
  );

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error(
      `Backend returned HTTP ${response.status}`
    );
  }

  if (!response.ok) {
    throw new Error(
      result.message ||
      result.error ||
      `Backend error: HTTP ${response.status}`
    );
  }

  return result;
}

