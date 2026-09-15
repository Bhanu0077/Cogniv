console.log("[Cogniv Popup] Popup loaded.");


const status =
  document.getElementById("status");

const playlistCard =
  document.getElementById("playlistCard");

const playlistTitle =
  document.getElementById("playlistTitle");

const playlistUrl =
  document.getElementById("playlistUrl");

const videoCount =
  document.getElementById("videoCount");

const scanButton =
  document.getElementById("scanButton");

const importButton =
  document.getElementById("importButton");

const result =
  document.getElementById("result");


let playlistData = null;


/* =========================================================
   STATUS
========================================================= */

function setStatus(
  text,
  type = ""
) {

  status.textContent = text;

  status.className =
    "status " + type;

}


/* =========================================================
   DISPLAY PLAYLIST
========================================================= */

function displayPlaylist(data) {

  playlistData = data;


  playlistTitle.textContent =
    data.playlist_title ||
    "Unknown playlist";


  playlistUrl.textContent =
    data.playlist_url ||
    "";


  const count =
    Array.isArray(data.videos)
      ? data.videos.length
      : 0;


  videoCount.textContent =
    count;


  playlistCard.classList.remove(
    "hidden"
  );


  importButton.classList.remove(
    "hidden"
  );


  setStatus(
    "✓ Playlist detected",
    "success"
  );


  result.textContent =
    "Ready to import into Cogniv.";

}


/* =========================================================
   SCAN PLAYLIST
========================================================= */

scanButton.addEventListener(
  "click",
  async () => {

    console.log(
      "[Cogniv Popup] Scan clicked."
    );


    setStatus(
      "Scanning YouTube..."
    );


    result.textContent =
      "";


    scanButton.disabled =
      true;


    try {

      const response =
        await chrome.runtime.sendMessage({

          type:
            "SCAN_ACTIVE_TAB"

        });


      console.log(
        "[Cogniv Popup] Scan response:",
        response
      );


      if (!response) {

        throw new Error(
          "No response from extension."
        );

      }


      if (
        response.status !==
        "ok"
      ) {

        throw new Error(
          response.message ||
          "Playlist scan failed."
        );

      }


      if (
        response.detected !==
        true
      ) {

        throw new Error(
          "No playlist detected."
        );

      }


      if (
        !response.data
      ) {

        throw new Error(
          "Playlist data is missing."
        );

      }


      displayPlaylist(
        response.data
      );


    } catch (error) {

      console.error(
        "[Cogniv Popup] Scan error:",
        error
      );


      setStatus(
        "✕ Scan failed",
        "error"
      );


      result.textContent =
        error.message;

    } finally {

      scanButton.disabled =
        false;

    }

  }
);


/* =========================================================
   IMPORT PLAYLIST
========================================================= */

importButton.addEventListener(
  "click",
  async () => {

    if (!playlistData) {

      setStatus(
        "No playlist data.",
        "error"
      );

      return;

    }


    console.log(
      "[Cogniv Popup] Importing:",
      playlistData
    );


    importButton.disabled =
      true;


    scanButton.disabled =
      true;


    setStatus(
      "Importing playlist..."
    );


    result.textContent =
      "Sending playlist to Cogniv...";


    try {

      const response =
        await chrome.runtime.sendMessage({

          type:
            "IMPORT_PLAYLIST",

          data:
            playlistData

        });


      console.log(
        "[Cogniv Popup] Import response:",
        response
      );


      if (!response) {

        throw new Error(
          "No response from backend."
        );

      }


      if (
        response.status !==
        "ok"
      ) {

        throw new Error(

          response.message ||
          response.error ||
          "Import failed."

        );

      }


      setStatus(
        "✓ Imported to Cogniv",
        "success"
      );


      /*
       * Support several possible backend
       * response names.
       */

      const importedCount =
        response.imported_count ??
        response.lessons_created ??
        response.lesson_count ??
        playlistData.videos.length;


      result.textContent =
        `${importedCount} lessons added to Cogniv.`;


      importButton.textContent =
        "Imported ✓";


    } catch (error) {

      console.error(
        "[Cogniv Popup] Import error:",
        error
      );


      setStatus(
        "✕ Import failed",
        "error"
      );


      result.textContent =
        error.message;


      importButton.disabled =
        false;

    } finally {

      scanButton.disabled =
        false;

    }

  }
);
