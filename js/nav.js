/*
 * nav.js — D-pad spatial navigation for webOS TV remote.
 *
 * webOS does not provide a cursor or tab-order navigation by default.
 * This module intercepts arrow keys and moves a custom "focused" class
 * between elements that have the class "focusable".
 *
 * Algorithm: weighted spatial distance.
 *   For each candidate in the target direction:
 *     score = primary_distance + perpendicular_distance * 3
 *   The candidate with the lowest score wins.
 * Multiplying perpendicular distance by 3 strongly prefers elements
 * that are directly in the pressed direction over diagonal ones.
 *
 * webOS key codes (keydown.keyCode):
 *   37 Left   38 Up   39 Right   40 Down
 *   13 OK/Enter
 *   461 Back   (27 Escape used as a dev-browser stand-in)
 *   415 Play   19 Pause
 *   412 Rewind   417 FastForward
 */

var Nav = {
  currentFocused: null,

  /* Called once at startup */
  init: function () {
    var self = this;
    document.addEventListener('keydown', function (e) {
      self._onKey(e);
    });
  },

  /* Make an element the focused one */
  setFocus: function (el) {
    if (!el) { return; }
    if (this.currentFocused) {
      this.currentFocused.classList.remove('focused');
    }
    this.currentFocused = el;
    el.classList.add('focused');
    this._scrollToVisible(el);
  },

  /* Remove focus from everything */
  clearFocus: function () {
    if (this.currentFocused) {
      this.currentFocused.classList.remove('focused');
      this.currentFocused = null;
    }
  },

  /*
   * Focus the first visible .focusable inside `container`
   * (or the whole document if container is omitted).
   */
  focusFirst: function (container) {
    var scope = container || document;
    var all = Array.from(scope.querySelectorAll('.focusable'));
    var visible = all.filter(function (el) {
      return el.offsetParent !== null && !el.disabled;
    });
    if (visible.length > 0) { this.setFocus(visible[0]); }
  },

  /* ── private ─────────────────────────────────────────────── */

  _onKey: function (e) {
    var code = e.keyCode;

    /* Back / Escape — delegated to App */
    if (code === 461 || code === 27) {
      e.preventDefault();
      App.goBack();
      return;
    }

    /* Photo viewer: any key shows controls */
    var photoView = document.getElementById('view-photo');
    var inPhoto = photoView && photoView.style.display !== 'none';
    if (inPhoto) { App.showControls(); }

    switch (code) {
      case 37: /* Left  */
        e.preventDefault();
        if (inPhoto) { App.prevPhoto(); }
        else { this._move('left'); }
        break;

      case 39: /* Right */
        e.preventDefault();
        if (inPhoto) { App.nextPhoto(); }
        else { this._move('right'); }
        break;

      case 38: /* Up    */
        e.preventDefault();
        this._move('up');
        break;

      case 40: /* Down  */
        e.preventDefault();
        this._move('down');
        break;

      case 13: /* OK / Enter */
        e.preventDefault();
        if (this.currentFocused) {
          if (this.currentFocused.tagName === 'INPUT') {
            /* Give native focus → triggers webOS virtual keyboard */
            this.currentFocused.focus();
          } else {
            this.currentFocused.click();
          }
        }
        break;

      case 415: /* Play  */
      case 19:  /* Pause */
        if (inPhoto) { App.toggleSlideshow(); }
        break;

      case 412: /* Rewind      */
        if (inPhoto) { App.prevPhoto(); }
        break;

      case 417: /* FastForward */
        if (inPhoto) { App.nextPhoto(); }
        break;
    }
  },

  _move: function (direction) {
    /* If nothing is focused, focus the first element in the visible view */
    if (!this.currentFocused) {
      var view = document.querySelector('.view[style*="flex"]') ||
                 document.querySelector('.view:not([style*="none"])');
      this.focusFirst(view);
      return;
    }

    var current = this.currentFocused;
    var cRect = current.getBoundingClientRect();
    var cx = cRect.left + cRect.width  / 2;
    var cy = cRect.top  + cRect.height / 2;

    /* Gather candidates from the currently visible view */
    var candidates = Array.from(
      document.querySelectorAll('.focusable')
    ).filter(function (el) {
      return el !== current && el.offsetParent !== null && !el.disabled;
    });

    var best      = null;
    var bestScore = Infinity;

    candidates.forEach(function (el) {
      var r  = el.getBoundingClientRect();
      var ex = r.left + r.width  / 2;
      var ey = r.top  + r.height / 2;

      var primary, perp, eligible;

      switch (direction) {
        case 'left':
          eligible = ex < cx - 5;
          primary  = cx - ex;
          perp     = Math.abs(ey - cy);
          break;
        case 'right':
          eligible = ex > cx + 5;
          primary  = ex - cx;
          perp     = Math.abs(ey - cy);
          break;
        case 'up':
          eligible = ey < cy - 5;
          primary  = cy - ey;
          perp     = Math.abs(ex - cx);
          break;
        case 'down':
          eligible = ey > cy + 5;
          primary  = ey - cy;
          perp     = Math.abs(ex - cx);
          break;
        default:
          eligible = false;
      }

      if (!eligible) { return; }

      /* Weighted score: direct path beats diagonal */
      var score = primary + perp * 3;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    });

    if (best) { this.setFocus(best); }
  },

  /*
   * Scroll the nearest scrollable ancestor so `el` is fully in view.
   * Does NOT use scrollIntoView({block:'nearest'}) — that option
   * requires Chrome 61+ and is absent on webOS 3.5.
   */
  _scrollToVisible: function (el) {
    var margin = 24;
    var parent = el.parentElement;

    while (parent && parent !== document.body) {
      var cs = window.getComputedStyle(parent);
      var ox = cs.overflowX;
      var oy = cs.overflowY;
      var scrollable = (
        ox === 'auto' || ox === 'scroll' ||
        oy === 'auto' || oy === 'scroll'
      );

      if (scrollable) {
        var pRect = parent.getBoundingClientRect();
        var eRect = el.getBoundingClientRect();

        /* Horizontal */
        if (eRect.left < pRect.left + margin) {
          parent.scrollLeft += eRect.left - pRect.left - margin;
        } else if (eRect.right > pRect.right - margin) {
          parent.scrollLeft += eRect.right - pRect.right + margin;
        }

        /* Vertical */
        if (eRect.top < pRect.top + margin) {
          parent.scrollTop += eRect.top - pRect.top - margin;
        } else if (eRect.bottom > pRect.bottom - margin) {
          parent.scrollTop += eRect.bottom - pRect.bottom + margin;
        }

        break; /* only fix the first scrollable ancestor */
      }
      parent = parent.parentElement;
    }
  }
};
