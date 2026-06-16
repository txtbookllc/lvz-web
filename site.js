/* ==========================================================================
   Low Vision Zoom — site.js
   1) Single source-of-truth for the "Download for Windows" CTA.
   2) Motion-safe play/pause for the demo clips (paused by default; the
      smooth-vs-jumpy pair shares one synced control). Play buttons stay
      hidden until a real video source can actually play, so before the
      capture-day footage exists the page shows clean static stills only.
   ========================================================================== */
(function () {
    "use strict";

    /* ----------------------------------------------------------------------
       1) Download URL — the one launch-blocking stub.
       TODO at launch: set this to the hosted signed-MSI URL. Every
       "Download for Windows" button on every page reads from here.
       ---------------------------------------------------------------------- */
    var DOWNLOAD_URL = "#get"; /* TODO at launch: hosted signed-MSI URL */

    var dlLinks = document.querySelectorAll("[data-download]");
    for (var i = 0; i < dlLinks.length; i++) {
        dlLinks[i].setAttribute("href", DOWNLOAD_URL);
    }

    /* ----------------------------------------------------------------------
       2) Demo controls
       ---------------------------------------------------------------------- */
    var ICON_PLAY  = '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none"/></svg>';
    var ICON_PAUSE = '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="3.5" height="14" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="3.5" height="14" fill="currentColor" stroke="none"/></svg>';

    function setToggleState(btn, playing, label) {
        btn.innerHTML = (playing ? ICON_PAUSE : ICON_PLAY) +
            '<span>' + (playing ? "Pause" : "Play") + " " + label + "</span>";
        btn.setAttribute("aria-pressed", playing ? "true" : "false");
    }

    function canPlay(video) {
        /* A <source> set pointing at files that don't exist yet ends in an
           error; only reveal the control once the media is genuinely ready. */
        return new Promise(function (resolve) {
            if (video.readyState >= 2) { resolve(true); return; }
            var done = false;
            function ok() { if (!done) { done = true; cleanup(); resolve(true); } }
            function fail() { if (!done) { done = true; cleanup(); resolve(false); } }
            function cleanup() {
                video.removeEventListener("canplay", ok);
                video.removeEventListener("loadeddata", ok);
                video.removeEventListener("error", fail);
            }
            video.addEventListener("canplay", ok);
            video.addEventListener("loadeddata", ok);
            video.addEventListener("error", fail);
            /* the <source> elements may have already errored before we bound */
            if (video.error) { fail(); }
        });
    }

    /* --- Single demo (its own toggle lives inside the frame) --- */
    var singles = document.querySelectorAll("[data-demo]");
    for (var s = 0; s < singles.length; s++) {
        (function (frame) {
            var video = frame.querySelector("video.demo-media");
            var btn = frame.querySelector(".demo-toggle");
            if (!video || !btn) { return; }
            var label = btn.getAttribute("data-label") || "demo";
            canPlay(video).then(function (ready) {
                if (!ready) { return; }              /* leave the still showing */
                btn.hidden = false;
                setToggleState(btn, false, label);
                btn.addEventListener("click", function () {
                    if (video.paused) {
                        video.play().then(function () {
                            frame.classList.add("is-playing");
                            setToggleState(btn, true, label);
                        }).catch(function () {});
                    } else {
                        video.pause();
                        frame.classList.remove("is-playing");
                        setToggleState(btn, false, label);
                    }
                });
            });
        })(singles[s]);
    }

    /* --- Grouped demos sharing one synced control (the comparison pair) --- */
    var controls = document.querySelectorAll("[data-demo-control]");
    for (var c = 0; c < controls.length; c++) {
        (function (btn) {
            var group = btn.getAttribute("data-demo-control");
            var label = btn.getAttribute("data-label") || "both";
            var videos = document.querySelectorAll('video.demo-media[data-demo-group="' + group + '"]');
            if (!videos.length) { return; }
            var frames = [];
            for (var v = 0; v < videos.length; v++) {
                frames.push(videos[v].closest(".demo-frame"));
            }
            Promise.all(Array.prototype.map.call(videos, canPlay)).then(function (results) {
                var allReady = results.every(Boolean);
                if (!allReady) { return; }            /* leave both stills showing */
                btn.hidden = false;
                setToggleState(btn, false, label);
                btn.addEventListener("click", function () {
                    var anyPlaying = Array.prototype.some.call(videos, function (vd) { return !vd.paused; });
                    if (anyPlaying) {
                        for (var k = 0; k < videos.length; k++) {
                            videos[k].pause();
                            frames[k].classList.remove("is-playing");
                        }
                        setToggleState(btn, false, label);
                    } else {
                        for (var j = 0; j < videos.length; j++) {
                            videos[j].currentTime = 0;
                            frames[j].classList.add("is-playing");
                            videos[j].play().catch(function () {});
                        }
                        setToggleState(btn, true, label);
                    }
                });
            });
        })(controls[c]);
    }
})();
