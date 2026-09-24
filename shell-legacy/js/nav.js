(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};

  /* webOS: 37-40 arrows, 13 OK, 461 Back (27 Escape and 8 Backspace for desktop browsers) */
  ui.keys = {
    name: function (code) {
      switch (code) {
        case 37: return 'left';
        case 38: return 'up';
        case 39: return 'right';
        case 40: return 'down';
        case 13: return 'ok';
        case 461: case 27: return 'back';
        default: return null;
      }
    }
  };

  var current = null;

  function visibleFocusables(scope) {
    return ui.dom.toArray((scope || document).querySelectorAll('.focusable')).filter(function (el) {
      return el.offsetParent !== null && !el.disabled;
    });
  }

  ui.nav = {
    current: function () { return current; },
    setFocus: function (el) {
      if (!el) { return; }
      if (current) { current.classList.remove('focused'); }
      current = el;
      el.classList.add('focused');
    },
    clearFocus: function () {
      if (current) { current.classList.remove('focused'); current = null; }
    },
    focusFirst: function (scope) {
      var list = visibleFocusables(scope);
      if (list.length) { this.setFocus(list[0]); return true; }
      return false;
    },
    /* Weighted spatial move: distance along the direction + 3x the sideways offset. */
    move: function (dir, scope) {
      if (!current) { return this.focusFirst(scope); }
      var c = current.getBoundingClientRect();
      var cx = c.left + c.width / 2, cy = c.top + c.height / 2;
      var best = null, bestScore = Infinity;
      visibleFocusables(scope).forEach(function (el) {
        if (el === current) { return; }
        var r = el.getBoundingClientRect();
        var ex = r.left + r.width / 2, ey = r.top + r.height / 2;
        var primary, side, ok;
        if (dir === 'left')       { ok = ex < cx - 5; primary = cx - ex; side = Math.abs(ey - cy); }
        else if (dir === 'right') { ok = ex > cx + 5; primary = ex - cx; side = Math.abs(ey - cy); }
        else if (dir === 'up')    { ok = ey < cy - 5; primary = cy - ey; side = Math.abs(ex - cx); }
        else                      { ok = ey > cy + 5; primary = ey - cy; side = Math.abs(ex - cx); }
        if (ok && primary + side * 3 < bestScore) { bestScore = primary + side * 3; best = el; }
      });
      if (best) { this.setFocus(best); return true; }
      return false;
    }
  };
}(window));
