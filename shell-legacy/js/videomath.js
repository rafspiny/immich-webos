(function (root) {
  'use strict';
  var ui = root.ImmichUI = root.ImmichUI || {};

  function formatClock(seconds) {
    var s = Math.floor(Number(seconds));
    if (!isFinite(s) || s < 0) { s = 0; }
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var ss = (sec < 10 ? '0' : '') + sec;
    if (h > 0) { return h + ':' + (m < 10 ? '0' : '') + m + ':' + ss; }
    return m + ':' + ss;
  }

  function seekTarget(current, delta, duration) {
    var t = (Number(current) || 0) + delta;
    var max = (isFinite(duration) && duration > 0) ? duration : Infinity;
    return Math.max(0, Math.min(max, t));
  }

  var api = { formatClock: formatClock, seekTarget: seekTarget };
  ui.videomath = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
}(typeof window !== 'undefined' ? window : global));
