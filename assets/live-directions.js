// Live walking directions in the maps app the viewer is most likely to use:
// Apple Maps on iPhone/iPad, Google Maps everywhere else (Android, desktop).
// Shared by index.html and walk.html. Plain script (no modules) so both pages can use it.
(function () {
  function isAppleMobile() {
    var ua = navigator.userAgent || "";
    // iPadOS reports itself as a Mac; touch support tells them apart
    return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }
  window.liveDirections = function (from, to) {
    var f = encodeURIComponent(from), t = encodeURIComponent(to);
    return isAppleMobile()
      ? { app: "Apple Maps", url: "https://maps.apple.com/?saddr=" + f + "&daddr=" + t + "&dirflg=w" }
      : { app: "Google Maps", url: "https://www.google.com/maps/dir/?api=1&origin=" + f + "&destination=" + t + "&travelmode=walking" };
  };
})();
