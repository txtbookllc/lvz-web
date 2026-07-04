/* ==========================================================================
   Low Vision Zoom — site.js
   1) Single source-of-truth for the "Download for Windows" CTA.
   2) Keeps --header-h in sync so the hero fills the first screen exactly.
   3) Motion-safe autoplay for the full-screen demo video: plays muted while
      on screen, pauses when scrolled away, never auto-starts under
      prefers-reduced-motion. The pause toggle stays hidden until the media
      is genuinely loadable, so a missing file leaves a clean static poster.
   ========================================================================== */
(function () {
    "use strict";

    /* ----------------------------------------------------------------------
       1) Download URL — the hosted signed MSI on Cloudflare R2 (a stable,
       direct HTTPS URL we control; no GitHub redirect). Every "Download
       for Windows" button on every page reads from here. On each release,
       overwrite the LowVisionZoom.msi object in R2 and purge the Cloudflare
       cache for this path (or switch to versioned object keys).
       ---------------------------------------------------------------------- */
    var DOWNLOAD_URL = "https://download.lowvisionzoom.com/LowVisionZoom.msi";

    var dlLinks = document.querySelectorAll("[data-download]");
    for (var i = 0; i < dlLinks.length; i++) {
        dlLinks[i].setAttribute("href", DOWNLOAD_URL);
    }

    /* ----------------------------------------------------------------------
       2) Full-height hero — the hero's min-height is 100svh minus the sticky
       header (see .hero in styles.css). The header's height depends on the
       user's text size, so measure it and keep --header-h in sync.
       ---------------------------------------------------------------------- */
    var header = document.querySelector(".site-header");
    if (header && "ResizeObserver" in window) {
        new ResizeObserver(function () {
            document.documentElement.style.setProperty(
                "--header-h", header.offsetHeight + "px");
        }).observe(header);
    }

    /* ----------------------------------------------------------------------
       3) Full-screen demo video — plays automatically (muted) while it's on
          screen and pauses when scrolled away. An explicit Pause from the
          visitor always wins over the observer (WCAG 2.2.2). Under
          prefers-reduced-motion the video never starts by itself; the poster
          shows until the visitor presses Play.
       ---------------------------------------------------------------------- */
    var ICON_PLAY  = '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none"/></svg>';
    var ICON_PAUSE = '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="3.5" height="14" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="3.5" height="14" fill="currentColor" stroke="none"/></svg>';

    function setToggleState(btn, playing, label) {
        btn.innerHTML = (playing ? ICON_PAUSE : ICON_PLAY) +
            '<span>' + (playing ? "Pause" : "Play") + " " + label + "</span>";
        btn.setAttribute("aria-pressed", playing ? "true" : "false");
    }

    var demoVideo  = document.querySelector(".demo-full-video");
    var demoToggle = document.querySelector(".demo-full-toggle");
    if (demoVideo && demoToggle) {
        var label = demoToggle.getAttribute("data-label") || "demo";
        var userPaused = false;
        var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

        var syncToggle = function () { setToggleState(demoToggle, !demoVideo.paused, label); };
        demoVideo.addEventListener("play", syncToggle);
        demoVideo.addEventListener("pause", syncToggle);

        /* Reveal the control only once the media is genuinely loadable, so a
           missing/broken file leaves a clean static poster with no dead button. */
        var revealToggle = function () { demoToggle.hidden = false; syncToggle(); };
        if (demoVideo.readyState >= 1) { revealToggle(); }
        else { demoVideo.addEventListener("loadedmetadata", revealToggle, { once: true }); }

        demoToggle.addEventListener("click", function () {
            if (demoVideo.paused) {
                userPaused = false;
                demoVideo.play().catch(function () {});
            } else {
                userPaused = true;
                demoVideo.pause();
            }
        });

        if ("IntersectionObserver" in window) {
            new IntersectionObserver(function (entries) {
                for (var e = 0; e < entries.length; e++) {
                    if (entries[e].isIntersecting) {
                        if (!userPaused && !reduceMotion.matches) {
                            demoVideo.play().catch(function () {});
                        }
                    } else if (!demoVideo.paused) {
                        demoVideo.pause();
                    }
                }
            }, { threshold: 0.35 }).observe(demoVideo);
        }
    }
})();
