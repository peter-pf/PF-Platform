/* ============================================================
   Pier Foundations — marketing site interactions
   Vanilla JS, no dependencies except MapLibre GL (loaded in page).
   ============================================================ */
(function () {
  "use strict";

  /* ---- Escape helper (used for any dynamic text, e.g. map popups) ---- */
  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ============================================================
     Hero background video.
     - Poster image is always the instant layer + the fallback.
     - Small screens (<=640px) OR reduced-motion: DO NOT load any video
       (saves mobile data) — the poster alone is the hero.
     - Mid screens (641-900px): load the lighter 720p webm (6MB).
     - Desktop (>900px): load the full 1080p webm (13.75MB).
     - The <source> is injected only after we pick a width, so nothing
       downloads otherwise. Fade the video in once it is actually playing;
       if autoplay is blocked or the codec is unsupported, the poster stays.
     ============================================================ */
  (function initHeroVideo() {
    var hero = document.querySelector(".hero");
    var video = document.getElementById("heroVideo");
    if (!hero || !video) return;

    var reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var w = window.innerWidth ||
      document.documentElement.clientWidth || 0;

    // Skip video entirely on small screens or when reduced motion is requested.
    if (reduce || w <= 640) {
      // leave preload="none" + no source -> zero video bytes fetched.
      return;
    }

    var src = (w <= 900)
      ? video.getAttribute("data-src-mobile")
      : video.getAttribute("data-src-desktop");
    if (!src) return;

    // Inject the chosen source and start loading.
    var source = document.createElement("source");
    source.src = src;
    source.type = "video/webm";
    video.appendChild(source);
    video.preload = "auto";

    function reveal() {
      hero.classList.add("is-playing");
    }
    // 'playing' fires when actual frames are rendering.
    video.addEventListener("playing", reveal, { once: true });
    // Safety: if it's already advancing, reveal on first timeupdate too.
    video.addEventListener("timeupdate", function onTU() {
      if (video.currentTime > 0) { reveal(); video.removeEventListener("timeupdate", onTU); }
    });

    try { video.load(); } catch (e) { /* poster stays */ }

    // Attempt autoplay; if the browser blocks it, the poster remains.
    var p = video.play && video.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () { /* autoplay blocked — poster is the fallback */ });
    }
  })();

  /* ============================================================
     Sticky nav: toggle solid state on scroll
     ============================================================ */
  var nav = document.getElementById("nav");
  function onScroll() {
    if (window.scrollY > 40) {
      nav.classList.add("scrolled");
    } else {
      nav.classList.remove("scrolled");
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ============================================================
     Mobile menu
     ============================================================ */
  var toggle = document.getElementById("navToggle");
  var mobile = document.getElementById("navMobile");
  if (toggle && mobile) {
    toggle.addEventListener("click", function () {
      var open = mobile.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    mobile.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        mobile.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ============================================================
     Scroll reveal via IntersectionObserver, with GROUP STAGGER.
     Items sharing a parent reveal in sequence (incremental --rd),
     so cards/steps cascade in instead of all at once.
     ============================================================ */
  var prefersReduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var revealEls = document.querySelectorAll(".reveal");

  // Precompute per-item stagger delay = index among reveal siblings * step,
  // unless the author already set an explicit data-delay.
  if (!prefersReduced) {
    var groups = {};
    revealEls.forEach(function (el) {
      if (el.hasAttribute("data-delay")) return;
      var parent = el.parentNode;
      var key = parent ? (parent.__rgid || (parent.__rgid = "g" + Math.random().toString(36).slice(2))) : "root";
      groups[key] = (groups[key] || 0);
      var idx = groups[key]++;
      if (idx > 0) el.style.setProperty("--rd", (idx * 0.09).toFixed(2) + "s");
    });
  }

  if ("IntersectionObserver" in window && revealEls.length && !prefersReduced) {
    var io = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ============================================================
     Process: ONE-SHOT sweep on entry.
     When the section enters the viewport, add .run ONCE — CSS then sweeps
     the connector 0->100% over ~2s and activates nodes 1..4 in sequence
     (staggered to match the line reaching each node). Not tied to scroll.
     ============================================================ */
  (function initProcess() {
    var processEl = document.getElementById("process-track");
    if (!processEl) return;

    // Reduced motion OR no IO: show the finished state immediately.
    if (prefersReduced || !("IntersectionObserver" in window)) {
      processEl.classList.add("run");
      return;
    }

    var io = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            processEl.classList.add("run");   // fire the full sweep once
            observer.unobserve(entry.target); // never re-run
          }
        });
      },
      { threshold: 0.3 }
    );
    io.observe(processEl);
  })();

  /* ============================================================
     WOW #1 — Underground cross-section: CONTINUOUS 4-stage LOOP.
     Stages s1..s4 swap on a timeline; labels light in step; the resolved
     state holds briefly, then it resets and replays, repeating. Runs ONLY
     while in the viewport (IO starts/stops it). The button is a pause/play
     toggle. Reduced motion: static final state, no loop.
     ============================================================ */
  (function initCrossSection() {
    var stage = document.getElementById("xsecStage");
    if (!stage) return;
    var labels = Array.prototype.slice.call(
      stage.querySelectorAll(".xsec__label")
    );
    var toggle = document.getElementById("xsecReplay");

    var STAGES = ["s1", "s2", "s3", "s4"];
    var TIMELINE = [0, 1500, 3000, 4600];  // each stage begins at these ms
    var DONE_AT = 6000;                     // resolved state reached
    var LOOP_AT = 7800;                     // hold ~1.8s, then restart
    var timers = [];
    var running = false, inView = false, paused = false;

    function clearTimers() {
      timers.forEach(function (t) { clearTimeout(t); });
      timers = [];
    }
    function setStage(idx) {
      STAGES.forEach(function (c) { stage.classList.remove(c); });
      stage.classList.add(STAGES[idx]);
      labels.forEach(function (l, i) { l.classList.toggle("on", i <= idx); });
    }
    function finalState() {
      clearTimers();
      running = false;
      stage.classList.remove("run");
      stage.classList.add("s4", "done");
      labels.forEach(function (l) { l.classList.add("on"); });
    }
    function runOnce() {
      clearTimers();
      STAGES.forEach(function (c) { stage.classList.remove(c); });
      stage.classList.remove("done");
      labels.forEach(function (l) { l.classList.remove("on"); });
      void stage.offsetWidth;               // reflow so CSS anims restart
      stage.classList.add("run");
      TIMELINE.forEach(function (t, i) {
        timers.push(setTimeout(function () { setStage(i); }, t));
      });
      timers.push(setTimeout(function () { stage.classList.add("done"); }, DONE_AT));
      timers.push(setTimeout(function () { if (running) runOnce(); }, LOOP_AT));
    }
    function start() {
      if (running || paused) return;
      running = true;
      runOnce();
    }
    function stop() {
      running = false;
      clearTimers();
    }

    // Button = pause/play toggle.
    var toggleText = toggle ? toggle.querySelector(".xsec__toggle-text") : null;
    if (toggle) {
      toggle.addEventListener("click", function () {
        if (prefersReduced) return;
        paused = !paused;
        stage.classList.toggle("is-paused", paused);
        if (toggleText) toggleText.textContent = paused ? "Play" : "Pause";
        toggle.setAttribute("aria-label", paused ? "Play the animation" : "Pause the animation");
        if (paused) { stop(); }
        else if (inView) { start(); }
      });
    }

    if (prefersReduced || !("IntersectionObserver" in window)) {
      finalState();
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          inView = entry.isIntersecting;
          if (inView) start(); else stop();
        });
      },
      { threshold: 0.3 }
    );
    io.observe(stage);
  })();

  /* ============================================================
     Animated stat counters
     ============================================================ */
  function animateCount(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var suffix = el.getAttribute("data-suffix") || "";
    var dur = 1400;
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = Math.round(target * eased);
      el.textContent = val + suffix;
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target + suffix;
    }
    requestAnimationFrame(step);
  }
  var counters = document.querySelectorAll("[data-count]");
  if ("IntersectionObserver" in window && counters.length) {
    var co = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.6 }
    );
    counters.forEach(function (el) {
      co.observe(el);
    });
  }

  /* ============================================================
     Contact form — no backend. Build a mailto: and show success.
     ============================================================ */
  var form = document.getElementById("contactForm");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var name = (data.get("name") || "").toString().trim();
      var company = (data.get("company") || "").toString().trim();
      var email = (data.get("email") || "").toString().trim();
      var ptype = (data.get("project_type") || "").toString().trim();
      var msg = (data.get("message") || "").toString().trim();

      var bodyLines = [
        "Name: " + name,
        "Company: " + company,
        "Email: " + email,
        "Project type: " + ptype,
        "",
        msg
      ];
      var subject = "Consultation request" + (company ? ": " + company : "");
      var mailto =
        "mailto:info@pierfoundations.com" +
        "?subject=" +
        encodeURIComponent(subject) +
        "&body=" +
        encodeURIComponent(bodyLines.join("\n"));

      // Open the user's mail client; then show a confirmation state.
      window.location.href = mailto;

      var success = document.getElementById("formSuccess");
      if (success) {
        success.classList.add("show");
        success.textContent =
          "Thank you, " + (name || "there") +
          ". Your email app should open with your request ready to send. " +
          "Prefer to reach us directly? Email info@pierfoundations.com.";
      }
      form.reset();
    });
  }

  /* ============================================================
     Project galleries (lightbox).
     Each gallery = 8 official curated photos: img/<slug>-1..8.jpg
     ============================================================ */
  var GALLERIES = {
    "iu-launch": {
      title: "IU Launch Accelerator, Indianapolis, IN",
      count: 8,
      slug: "iu-launch"
    },
    "republic-hotel": {
      title: "Republic Hotel Addition, Carmel, IN",
      count: 8,
      slug: "republic-hotel"
    },
    "madison": {
      // No verified location/GC/specs per directive: name + generic type only.
      title: "Madison Lifestyle Garage, Parking Structure",
      count: 8,
      slug: "madison"
    }
  };

  var lb = document.getElementById("lightbox");
  var lbImg = document.getElementById("lbImg");
  var lbTitle = document.getElementById("lbTitle");
  var lbCounter = document.getElementById("lbCounter");
  var lbClose = document.getElementById("lbClose");
  var lbPrev = document.getElementById("lbPrev");
  var lbNext = document.getElementById("lbNext");

  var current = { key: null, idx: 0 };
  var lastFocus = null;

  function srcFor(slug, n) { return "img/" + slug + "-" + n + ".jpg"; }

  function showPhoto(key, idx) {
    var g = GALLERIES[key];
    if (!g) return;
    var total = g.count;
    idx = ((idx % total) + total) % total; // wrap
    current.key = key;
    current.idx = idx;
    var n = idx + 1;
    lbImg.src = srcFor(g.slug, n);
    lbImg.alt = g.title + ", photo " + n + " of " + total;
    lbTitle.textContent = g.title;
    lbCounter.textContent = n + " / " + total;
  }

  function openGallery(key, btn) {
    if (!lb || !GALLERIES[key]) return;
    lastFocus = btn || document.activeElement;
    lb.hidden = false;
    // force reflow so the opacity transition runs
    void lb.offsetWidth;
    lb.classList.add("open");
    document.body.style.overflow = "hidden";
    showPhoto(key, 0);
    lbClose.focus();
  }

  function closeGallery() {
    if (!lb) return;
    lb.classList.remove("open");
    document.body.style.overflow = "";
    window.setTimeout(function () { lb.hidden = true; lbImg.src = ""; }, 250);
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  /* ---- WOW #2: photo hotspots (tap to toggle; don't open the gallery) ---- */
  var hotspots = Array.prototype.slice.call(document.querySelectorAll(".hotspot"));
  hotspots.forEach(function (h) {
    h.addEventListener("click", function (e) {
      e.stopPropagation();          // never trigger the parent gallery click
      e.preventDefault();
      var wasOpen = h.classList.contains("open");
      hotspots.forEach(function (o) { o.classList.remove("open"); });
      if (!wasOpen) h.classList.add("open");
    });
  });
  // Tapping elsewhere closes any open hotspot label.
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".hotspot")) {
      hotspots.forEach(function (o) { o.classList.remove("open"); });
    }
  });

  if (lb) {
    // Open from any element carrying data-gallery (feature card or grid card).
    document.querySelectorAll("[data-gallery]").forEach(function (el) {
      el.addEventListener("click", function () {
        openGallery(el.getAttribute("data-gallery"), el);
      });
    });

    lbClose.addEventListener("click", closeGallery);
    lbPrev.addEventListener("click", function () { showPhoto(current.key, current.idx - 1); });
    lbNext.addEventListener("click", function () { showPhoto(current.key, current.idx + 1); });

    // Click on the dark backdrop (not the image/controls) closes.
    lb.addEventListener("click", function (e) {
      if (e.target === lb || e.target.classList.contains("lightbox__stage")) closeGallery();
    });

    document.addEventListener("keydown", function (e) {
      if (lb.hidden) return;
      if (e.key === "Escape") closeGallery();
      else if (e.key === "ArrowLeft") showPhoto(current.key, current.idx - 1);
      else if (e.key === "ArrowRight") showPhoto(current.key, current.idx + 1);
    });
  }

  /* ============================================================
     Coverage map — 3D tilted MapLibre GL (free, no API key).
     Lazy-inits only when the section enters view (WebGL is heavy);
     graceful fallback to the coverage list if WebGL/MapLibre missing.
     ============================================================ */
  // Real project cities (verified records only). lng, lat order for MapLibre.
  var SITES = [
    { name: "IU Launch Accelerator", meta: "Indianapolis, IN: research / lab", lng: -86.1581, lat: 39.7684 },
    { name: "Republic Hotel Addition", meta: "Carmel / Fishers, IN: hospitality", lng: -86.1180, lat: 39.9784 },
    { name: "Regional Commercial Work", meta: "Fort Wayne, IN: commercial & data center", lng: -85.1394, lat: 41.0793 },
    { name: "Headquarters & Yard", meta: "Monroeville, IN: Northeast Indiana", lng: -84.8669, lat: 40.9737 }
  ];

  // Free vector styles that require NO API key (with fallbacks).
  var FREE_STYLES = [
    "https://tiles.openfreemap.org/styles/positron",
    "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    "https://tiles.openfreemap.org/styles/liberty"
  ];

  function webglSupported() {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext &&
        (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) { return false; }
  }

  function mapFallback(mapEl) {
    // WebGL/MapLibre unavailable: keep the coverage list, show a clean note.
    mapEl.classList.add("map--fallback");
    mapEl.innerHTML =
      '<div class="map-fallback__inner">' +
      '<strong>Serving Indiana &amp; the Midwest</strong>' +
      '<span>Indianapolis &middot; Carmel / Fishers &middot; Fort Wayne &middot; Monroeville (HQ)</span>' +
      "</div>";
  }

  function buildMarkerEl() {
    var wrap = document.createElement("div");
    wrap.className = "pf-marker";
    wrap.innerHTML =
      '<span class="pf-marker__pulse"></span>' +
      '<span class="pf-marker__pin"></span>';
    return wrap;
  }

  function initMap() {
    var mapEl = document.getElementById("map");
    if (!mapEl || mapEl.dataset.inited) return;
    mapEl.dataset.inited = "1";

    if (typeof maplibregl === "undefined" || !webglSupported()) {
      mapFallback(mapEl);
      return;
    }

    var styleIdx = 0;
    var reduced =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var map = new maplibregl.Map({
      container: mapEl,
      style: FREE_STYLES[styleIdx],
      center: [-86.0, 40.0],   // Indiana — Indianapolis + Fort Wayne both visible
      zoom: 6.6,
      pitch: reduced ? 0 : 55, // 3D tilt
      bearing: reduced ? 0 : -18,
      attributionControl: true,
      cooperativeGestures: true   // scroll page over map unless ctrl/2-finger
    });

    // If a style fails to load, fall through the free-style list.
    map.on("error", function (e) {
      if (e && e.error && /style|sprite|glyphs|fetch/i.test(String(e.error.message || "")) &&
          styleIdx < FREE_STYLES.length - 1) {
        styleIdx++;
        try { map.setStyle(FREE_STYLES[styleIdx]); } catch (_) {}
      }
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.dragRotate.enable();
    map.touchZoomRotate.enableRotation();

    function addBuildings() {
      // Add 3D building extrusions if the style exposes a building source layer.
      try {
        var layers = map.getStyle().layers || [];
        // find a vector source we can pull "building" from
        var srcId = null, sources = map.getStyle().sources || {};
        Object.keys(sources).forEach(function (k) {
          if (sources[k].type === "vector") srcId = srcId || k;
        });
        if (!srcId || map.getLayer("pf-3d-buildings")) return;
        var beforeId;
        for (var i = 0; i < layers.length; i++) {
          if (layers[i].type === "symbol") { beforeId = layers[i].id; break; }
        }
        map.addLayer({
          id: "pf-3d-buildings",
          source: srcId,
          "source-layer": "building",
          type: "fill-extrusion",
          minzoom: 12,
          paint: {
            "fill-extrusion-color": "#9fb4c6",
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 10],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0],
            "fill-extrusion-opacity": 0.65
          }
        }, beforeId);
      } catch (e) { /* style lacks building data — pitch alone conveys 3D */ }
    }

    var markers = [];
    function addMarkers() {
      SITES.forEach(function (s) {
        var el = buildMarkerEl();
        var popup = new maplibregl.Popup({ offset: 18, closeButton: true })
          .setHTML(
            '<div class="map-popup">' +
            '<div class="map-popup__name">' + esc(s.name) + "</div>" +
            '<div class="map-popup__meta">' + esc(s.meta) + "</div>" +
            "</div>"
          );
        var m = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([s.lng, s.lat])
          .setPopup(popup)
          .addTo(map);
        markers.push(m);
      });
    }

    map.on("load", function () {
      addBuildings();
      addMarkers();
      // Cinematic ease into the tilted view (unless reduced motion).
      if (!reduced) {
        map.easeTo({ pitch: 55, bearing: -18, zoom: 6.8, duration: 2200 });
      }
    });
  }

  /* Lazy-init the map only when the coverage section is near the viewport. */
  (function lazyMap() {
    var coverage = document.getElementById("coverage");
    if (!coverage) return;
    if (!("IntersectionObserver" in window)) { initMap(); return; }
    var io = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            initMap();
            observer.disconnect();
          }
        });
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(coverage);
  })();

  /* ============================================================
     Footer year
     ============================================================ */
  var yr = document.getElementById("year");
  if (yr) yr.textContent = new Date().getFullYear();
})();
