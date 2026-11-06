// Hotel outlet hours: formatting and "open now" status.
// Plain script shared by index.html (window.hotelHours) and the unit tests (globalThis.hotelHours).
// Times are in the hotel's time zone, whatever time zone the viewer's phone is in.
(function (root) {
  var ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  var JS_DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]; // Date#getDay order
  var NAME = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

  function minutes(t) { var p = t.split(":"); return Number(p[0]) * 60 + Number(p[1]); }

  function formatTime(t) {
    var m = minutes(t) % 1440, h = Math.floor(m / 60), mm = m % 60;
    return (h % 12 || 12) + ":" + String(mm).padStart(2, "0") + " " + (h < 12 ? "AM" : "PM");
  }

  // ["mon".."fri"] → "Mon–Fri"; ["fri","sat"] → "Fri–Sat"; ["sun".."thu"] → "Sun–Thu"; all → "Daily"
  function formatDays(days) {
    if (days.length === 7) return "Daily";
    var set = {}; days.forEach(function (d) { set[d] = true; });
    // start the week just after a missing day so runs that wrap past Sunday stay together
    var start = ORDER.findIndex(function (d, i) { return !set[ORDER[(i + 6) % 7]] && set[d]; });
    var runs = [], run = null;
    for (var k = 0; k < 7; k++) {
      var d = ORDER[(start + k) % 7];
      if (set[d]) { if (run) run.push(d); else runs.push(run = [d]); } else run = null;
    }
    return runs.map(function (r) {
      return r.length === 1 ? NAME[r[0]] : r.length === 2 ? NAME[r[0]] + " & " + NAME[r[1]] : NAME[r[0]] + "–" + NAME[r[r.length - 1]];
    }).join(", ");
  }

  // Rows for display: [{label, days, time}]
  function lines(outlet) {
    if (outlet.open24h) return [{ label: null, days: "Daily", time: "Open 24 hours" }];
    return (outlet.periods || []).map(function (p) {
      return { label: p.label || null, days: formatDays(p.days), time: formatTime(p.open) + " – " + formatTime(p.close) };
    });
  }

  // Day and minute-of-day at the hotel for a given instant
  function hotelClock(date, timeZone) {
    var parts = new Intl.DateTimeFormat("en-US", { timeZone: timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
    var get = function (t) { return parts.find(function (p) { return p.type === t; }).value; };
    return { day: get("weekday").toLowerCase().slice(0, 3), minute: Number(get("hour")) * 60 + Number(get("minute")) };
  }

  // {open: boolean|null, text}. open24h → always open.
  function status(outlet, date, timeZone) {
    if (outlet.open24h) return { open: true, text: "Open 24 hours" };
    var now = hotelClock(date, timeZone), periods = outlet.periods || [];
    var today = JS_DAY.indexOf(now.day);
    var on = function (dayIdx) {
      return periods.filter(function (p) { return p.days.indexOf(JS_DAY[dayIdx % 7]) >= 0; })
        .sort(function (a, b) { return minutes(a.open) - minutes(b.open); });
    };
    var current = on(today).find(function (p) { return minutes(p.open) <= now.minute && now.minute < minutes(p.close); });
    if (current) return { open: true, text: "Open now · " + (current.label ? current.label + " " : "") + "until " + formatTime(current.close) };
    for (var k = 0; k < 7; k++) {
      var next = on(today + k).find(function (p) { return k > 0 || minutes(p.open) > now.minute; });
      if (next) {
        var when = k === 0 ? "" : k === 1 ? "tomorrow " : NAME[JS_DAY[(today + k) % 7]] + " ";
        return { open: false, text: "Closed · opens " + when + formatTime(next.open) + (next.label ? " (" + next.label.toLowerCase() + ")" : "") };
      }
    }
    return { open: null, text: "No hours listed" };
  }

  root.hotelHours = { formatTime: formatTime, formatDays: formatDays, lines: lines, status: status, minutes: minutes };
})(typeof window !== "undefined" ? window : globalThis);
