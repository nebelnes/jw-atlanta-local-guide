// Live walking directions in the maps app the viewer is most likely to use:
// Apple Maps on iPhone/iPad, Google Maps everywhere else (Android, desktop).
// Shared by index.html and walk.html. Plain script (no modules) so both pages can use it.
(function () {
  function isAppleMobile() {
    var ua = navigator.userAgent || "";
    // iPadOS reports itself as a Mac; touch support tells them apart
    return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }
  // mode: "walk" (default) or "drive"
  window.liveDirections = function (from, to, mode) {
    var f = encodeURIComponent(from), t = encodeURIComponent(to), drive = mode === "drive";
    return isAppleMobile()
      ? { app: "Apple Maps", url: "https://maps.apple.com/?saddr=" + f + "&daddr=" + t + "&dirflg=" + (drive ? "d" : "w") }
      : { app: "Google Maps", url: "https://www.google.com/maps/dir/?api=1&origin=" + f + "&destination=" + t + "&travelmode=" + (drive ? "driving" : "walking") };
  };
})();
