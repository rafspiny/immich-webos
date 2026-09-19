/*
 * app.js — View management and all application logic.
 *
 * Views are plain <div> elements in index.html toggled with display:flex/none.
 * Navigation uses a stack so the Back key always returns to the previous screen.
 *
 * Compatibility: Promise .then() chains throughout — NO async/await.
 */

var App = {

  /* ── state ───────────────────────────────────────────────── */
  _stack:           [],   /* [{viewId, focusedItemId}] */
  _currentView:     null,
  _photoAssets:     [],   /* asset list open in the photo viewer */
  _photoIndex:      0,
  _slideshowActive: false,
  _slideshowTimer:  null,
  _controlsTimer:   null,

  /* ── bootstrap ───────────────────────────────────────────── */

  init: function () {
    Nav.init();
    if (Storage.getServerUrl() && Storage.getApiKey()) {
      this._showView('home');
    } else {
      this._showView('setup');
    }
  },

  /* ── public navigation (called by Nav and view handlers) ─── */

  navigate: function (viewId, params) {
    /* Save the currently focused item so Back can restore it */
    var focused = Nav.currentFocused;
    this._stack.push({
      viewId:        this._currentView,
      focusedItemId: focused ? (focused.dataset.id || focused.id) : null
    });
    this._showView(viewId, params);
  },

  goBack: function () {
    if (this._slideshowActive) { this._stopSlideshow(); }
    if (this._stack.length === 0) { return; }
    var prev = this._stack.pop();
    this._showView(prev.viewId, null, prev.focusedItemId);
  },

  /* ── photo viewer helpers (called by Nav key handler) ──── */

  prevPhoto: function () {
    if (this._photoIndex > 0) {
      this._photoIndex--;
      this._renderPhoto();
    }
  },

  nextPhoto: function () {
    if (this._photoIndex < this._photoAssets.length - 1) {
      this._photoIndex++;
      this._renderPhoto();
    } else if (this._slideshowActive) {
      this._stopSlideshow();
    }
  },

  toggleSlideshow: function () {
    if (this._slideshowActive) { this._stopSlideshow(); }
    else { this._startSlideshow(); }
  },

  showControls: function () {
    var self = this;
    var ctrl = document.getElementById('photo-controls');
    if (!ctrl) { return; }
    ctrl.classList.add('visible');
    clearTimeout(this._controlsTimer);
    this._controlsTimer = setTimeout(function () {
      ctrl.classList.remove('visible');
    }, 3000);
  },

  /* ── private: view switcher ──────────────────────────────── */

  _showView: function (viewId, params, restoreFocusItemId) {
    this._currentView = viewId;

    /* Hide every view */
    var allViews = Array.from(document.querySelectorAll('.view'));
    allViews.forEach(function (v) { v.style.display = 'none'; });

    /* Show the target view */
    var view = document.getElementById('view-' + viewId);
    if (!view) { return; }
    view.style.display = 'flex';

    Nav.clearFocus();

    /* Delegate to view-specific init */
    switch (viewId) {
      case 'setup':        this._initSetup();                           break;
      case 'home':         this._initHome(restoreFocusItemId);         break;
      case 'albums':       this._initAlbums(restoreFocusItemId);       break;
      case 'album-detail': this._initAlbumDetail(params, restoreFocusItemId); break;
      case 'photo':        this._initPhoto(params);                    break;
    }
  },

  /* ── SETUP VIEW ──────────────────────────────────────────── */

  _initSetup: function () {
    var self = this;
    var serverInput = document.getElementById('server-url');
    var keyInput    = document.getElementById('api-key');
    var connectBtn  = document.getElementById('connect-btn');
    var errorDiv    = document.getElementById('setup-error');

    /* Prefill server URL if previously saved */
    serverInput.value = Storage.getServerUrl();
    keyInput.value    = '';
    errorDiv.style.display = 'none';
    connectBtn.textContent = 'Connect';
    connectBtn.disabled    = false;

    connectBtn.onclick = function () {
      self._handleConnect(serverInput.value, keyInput.value);
    };

    /* Restore native focus to an input after webOS keyboard dismisses */
    serverInput.addEventListener('blur', function () {
      /* Re-apply custom focus class if still the "selected" element */
      if (Nav.currentFocused === serverInput) {
        serverInput.classList.add('focused');
      }
    });
    keyInput.addEventListener('blur', function () {
      if (Nav.currentFocused === keyInput) {
        keyInput.classList.add('focused');
      }
    });

    Nav.focusFirst(document.getElementById('view-setup'));
  },

  _handleConnect: function (serverUrl, apiKey) {
    var self       = this;
    var url        = serverUrl.trim().replace(/\/$/, '');
    var key        = apiKey.trim();
    var errorDiv   = document.getElementById('setup-error');
    var connectBtn = document.getElementById('connect-btn');

    if (!url || !key) {
      errorDiv.textContent   = 'Please fill in both fields.';
      errorDiv.style.display = 'block';
      return;
    }

    connectBtn.textContent = 'Connecting…';
    connectBtn.disabled    = true;
    errorDiv.style.display = 'none';
    this._setLoading(true);

    Api.verifyConnection(url, key)
      .then(function () {
        Storage.saveCredentials(url, key);
        self._setLoading(false);
        self._stack = [];
        self._showView('home');
      })
      .catch(function (err) {
        self._setLoading(false);
        connectBtn.textContent   = 'Connect';
        connectBtn.disabled      = false;
        errorDiv.textContent     = 'Could not connect: ' + err.message;
        errorDiv.style.display   = 'block';
      });
  },

  /* ── HOME VIEW ───────────────────────────────────────────── */

  _initHome: function (restoreFocusItemId) {
    var self  = this;
    var strip = document.getElementById('recent-strip');

    strip.innerHTML = '<div class="loading-text">Loading recent photos…</div>';

    document.getElementById('albums-btn').onclick = function () {
      self.navigate('albums');
    };
    document.getElementById('disconnect-btn').onclick = function () {
      Storage.clearCredentials();
      self._stack = [];
      self._showView('setup');
    };

    Nav.focusFirst(document.getElementById('view-home'));

    Api.getRecentAssets(40)
      .then(function (data) {
        var assets = self._normaliseAssetList(data);
        strip.innerHTML = '';

        if (assets.length === 0) {
          strip.innerHTML = '<p class="empty-msg">No photos found on the server.</p>';
          return;
        }

        assets.forEach(function (asset, idx) {
          strip.appendChild(self._makeTile(asset, idx, assets));
        });

        if (restoreFocusItemId) {
          var el = document.getElementById('tile-' + restoreFocusItemId);
          if (el) { Nav.setFocus(el); return; }
        }
        /* No restore target — focus the Albums button */
      })
      .catch(function (err) {
        strip.innerHTML = '<p class="error-msg" style="padding:30px">' + err.message + '</p>';
      });
  },

  /* ── ALBUMS VIEW ─────────────────────────────────────────── */

  _initAlbums: function (restoreFocusItemId) {
    var self = this;
    var grid = document.getElementById('albums-grid');

    grid.innerHTML = '<div class="loading-text">Loading albums…</div>';
    document.getElementById('albums-count').textContent = '';

    document.getElementById('albums-back').onclick = function () {
      self.goBack();
    };

    Nav.focusFirst(document.getElementById('view-albums'));

    Api.getAlbums()
      .then(function (data) {
        var albums = Array.isArray(data) ? data : [];
        albums.sort(function (a, b) {
          return (a.albumName || '').localeCompare(b.albumName || '');
        });

        grid.innerHTML = '';
        document.getElementById('albums-count').textContent =
          albums.length + ' album' + (albums.length !== 1 ? 's' : '');

        if (albums.length === 0) {
          grid.innerHTML = '<p class="empty-msg">No albums found.</p>';
          return;
        }

        albums.forEach(function (album) {
          grid.appendChild(self._makeAlbumCard(album));
        });

        if (restoreFocusItemId) {
          var el = document.getElementById('album-' + restoreFocusItemId);
          if (el) { Nav.setFocus(el); return; }
        }
        Nav.focusFirst(grid);
      })
      .catch(function (err) {
        grid.innerHTML = '<p class="error-msg" style="padding:30px">' + err.message + '</p>';
      });
  },

  /* ── ALBUM DETAIL VIEW ───────────────────────────────────── */

  _initAlbumDetail: function (params, restoreFocusItemId) {
    var self  = this;
    var album = params && params.album;
    var grid  = document.getElementById('detail-grid');

    document.getElementById('detail-title').textContent = album ? album.albumName : 'Album';
    document.getElementById('detail-count').textContent = '';
    grid.innerHTML = '<div class="loading-text">Loading…</div>';

    document.getElementById('detail-back').onclick = function () {
      self.goBack();
    };

    Nav.focusFirst(document.getElementById('view-album-detail'));

    if (!album) {
      grid.innerHTML = '<p class="error-msg" style="padding:30px">No album selected.</p>';
      return;
    }

    Api.getAlbum(album.id)
      .then(function (data) {
        var assets = Array.isArray(data.assets) ? data.assets
                   : (Array.isArray(data.items)  ? data.items : []);

        grid.innerHTML = '';
        document.getElementById('detail-count').textContent =
          assets.length + ' item' + (assets.length !== 1 ? 's' : '');

        if (assets.length === 0) {
          grid.innerHTML = '<p class="empty-msg">This album is empty.</p>';
          return;
        }

        assets.forEach(function (asset, idx) {
          grid.appendChild(self._makeTile(asset, idx, assets));
        });

        if (restoreFocusItemId) {
          var el = document.getElementById('tile-' + restoreFocusItemId);
          if (el) { Nav.setFocus(el); return; }
        }
        Nav.focusFirst(grid);
      })
      .catch(function (err) {
        grid.innerHTML = '<p class="error-msg" style="padding:30px">' + err.message + '</p>';
      });
  },

  /* ── PHOTO / VIDEO VIEWER ────────────────────────────────── */

  _initPhoto: function (params) {
    var self = this;
    this._photoAssets = (params && params.assets) ? params.assets : [];
    this._photoIndex  = (params && params.index  != null) ? params.index : 0;

    document.getElementById('photo-back').onclick     = function () { self.goBack(); };
    document.getElementById('photo-prev').onclick     = function () { self.prevPhoto(); };
    document.getElementById('photo-next').onclick     = function () { self.nextPhoto(); };
    document.getElementById('slideshow-btn').onclick  = function () { self.toggleSlideshow(); };

    /* Any click on the viewer shows controls */
    var view = document.getElementById('view-photo');
    view.onclick = function () { self.showControls(); };

    this._renderPhoto();
    this.showControls();
    Nav.focusFirst(document.getElementById('photo-controls'));
  },

  _renderPhoto: function () {
    var asset   = this._photoAssets[this._photoIndex];
    var img     = document.getElementById('photo-img');
    var video   = document.getElementById('photo-video');
    var counter = document.getElementById('photo-counter');
    var prevBtn = document.getElementById('photo-prev');
    var nextBtn = document.getElementById('photo-next');

    if (!asset) { return; }

    counter.textContent  = (this._photoIndex + 1) + ' / ' + this._photoAssets.length;
    prevBtn.disabled     = (this._photoIndex === 0);
    nextBtn.disabled     = (this._photoIndex === this._photoAssets.length - 1);

    if (asset.type === 'VIDEO') {
      img.style.display   = 'none';
      video.style.display = 'block';
      video.src           = Api.videoPlaybackUrl(asset.id);
      video.load();
      video.play();
    } else {
      video.style.display = 'none';
      video.pause();
      video.src = '';
      img.style.display   = 'block';
      img.src             = Api.originalUrl(asset.id);
    }
  },

  _startSlideshow: function () {
    var self = this;
    this._slideshowActive = true;
    document.getElementById('slideshow-btn').textContent = '⏸ Stop';
    this._slideshowTimer = setInterval(function () {
      self.nextPhoto();
    }, 5000);
  },

  _stopSlideshow: function () {
    this._slideshowActive = false;
    var btn = document.getElementById('slideshow-btn');
    if (btn) { btn.textContent = '▶ Slideshow'; }
    if (this._slideshowTimer) {
      clearInterval(this._slideshowTimer);
      this._slideshowTimer = null;
    }
  },

  /* ── shared DOM builders ─────────────────────────────────── */

  _makeTile: function (asset, idx, assets) {
    var self = this;
    var tile = document.createElement('div');
    tile.className     = 'focusable tile';
    tile.id            = 'tile-' + asset.id;
    tile.dataset.id    = asset.id;

    var img = document.createElement('img');
    img.className      = 'tile-img';
    img.src            = Api.thumbnailUrl(asset.id, 'thumbnail');
    img.alt            = asset.originalFileName || '';
    tile.appendChild(img);

    if (asset.type === 'VIDEO') {
      var badge = document.createElement('div');
      badge.className  = 'video-badge';
      badge.textContent = '▶';
      tile.appendChild(badge);
    }

    tile.onclick = function () {
      self.navigate('photo', { assets: assets, index: idx });
    };

    return tile;
  },

  _makeAlbumCard: function (album) {
    var self = this;
    var card = document.createElement('div');
    card.className     = 'focusable album-card';
    card.id            = 'album-' + album.id;
    card.dataset.id    = album.id;

    /* Cover image */
    var cover = document.createElement('div');
    cover.className    = 'album-cover';

    if (album.albumThumbnailAssetId) {
      var img = document.createElement('img');
      img.className    = 'album-cover-img';
      img.src          = Api.thumbnailUrl(album.albumThumbnailAssetId, 'preview');
      img.alt          = '';
      cover.appendChild(img);
    } else {
      cover.textContent = '🖼';
    }
    card.appendChild(cover);

    /* Info row */
    var info  = document.createElement('div');
    info.className     = 'album-info';

    var name  = document.createElement('div');
    name.className     = 'album-name';
    name.textContent   = album.albumName || 'Untitled';
    info.appendChild(name);

    var count = document.createElement('div');
    count.className    = 'album-count';
    count.textContent  = (album.assetCount != null ? album.assetCount : 0) + ' items';
    info.appendChild(count);

    card.appendChild(info);

    card.onclick = function () {
      self.navigate('album-detail', { album: album });
    };

    return card;
  },

  /* ── helpers ─────────────────────────────────────────────── */

  _normaliseAssetList: function (data) {
    /* Immich returns a plain array for /api/assets */
    return Array.isArray(data) ? data
         : (Array.isArray(data.assets) ? data.assets
         : (Array.isArray(data.items)  ? data.items : []));
  },

  _setLoading: function (show) {
    document.getElementById('loading').style.display = show ? 'flex' : 'none';
  }
};

/* ── Entry point ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
  App.init();
});
