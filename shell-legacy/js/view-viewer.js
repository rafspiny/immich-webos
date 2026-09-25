(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom, vm = ui.videomath;
  var SEEK_SECONDS = 10;
  var MSG_PHOTO = 'Could not load this photo.';
  var MSG_VIDEO = 'Could not play this video. The server may not have a version this TV can decode.';

  ui.createViewerView = function (ctx) {
    var el = dom.el('div', 'view viewer');
    document.getElementById('root').appendChild(el);
    var img = dom.el('img', 'viewer-media');
    var video = dom.el('video', 'viewer-media hidden');
    var counter = dom.el('div', 'viewer-counter');
    var hud = dom.el('div', 'viewer-hud hidden');
    var error = dom.el('div', 'viewer-error hidden');
    [img, video, counter, hud, error].forEach(function (n) { el.appendChild(n); });
    video.autoplay = true;
    var assets = [], index = 0, timer = null;

    function isVideo() { return assets[index].type === 'VIDEO'; }

    function hudText() {
      return (video.paused ? 'Paused' : 'Playing') + '   ' + vm.formatClock(video.currentTime) + ' / ' +
        vm.formatClock(video.duration) + '   OK play/pause, Up/Down seek';
    }
    function flashInfo() {
      counter.textContent = (index + 1) + ' / ' + assets.length;
      dom.show(counter);
      if (isVideo()) { hud.textContent = hudText(); dom.show(hud); } else { dom.hide(hud); }
      clearTimeout(timer);
      timer = setTimeout(function () { dom.hide(counter); dom.hide(hud); }, 3000);
    }
    function playSafely() {
      var p = video.play();
      if (p && p.catch) { p.catch(function () { /* the user can press OK again */ }); }
    }
    function stopVideo() {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    function show() {
      var asset = assets[index];
      dom.hide(error);
      ctx.viewerIndex = index;
      if (asset.type === 'VIDEO') {
        img.removeAttribute('src');
        dom.hide(img);
        dom.show(video);
        video.src = ctx.client.videoPlaybackUrl(asset.id);
      } else {
        stopVideo();
        dom.hide(video);
        dom.show(img);
        img.src = ctx.client.viewerUrl(asset.id);
        if (index + 1 < assets.length && assets[index + 1].type !== 'VIDEO') {
          new Image().src = ctx.client.viewerUrl(assets[index + 1].id);
        }
      }
      flashInfo();
    }

    img.onerror = function () { error.textContent = MSG_PHOTO; dom.show(error); };
    video.onerror = function () {
      if (!video.getAttribute('src')) { return; }      /* clearing the source also raises an error event */
      error.textContent = MSG_VIDEO;
      dom.show(error);
    };
    video.addEventListener('timeupdate', function () {
      if (!hud.classList.contains('hidden')) { hud.textContent = hudText(); }
    });

    return {
      el: el,
      enter: function (params) { assets = params.assets; index = params.index; show(); },
      leave: function () { clearTimeout(timer); img.removeAttribute('src'); stopVideo(); },
      snapshot: function () { return null; },
      onKey: function (key) {
        if (key === 'left') { if (index > 0) { index--; show(); } return true; }
        if (key === 'right') { if (index < assets.length - 1) { index++; show(); } return true; }
        if (isVideo()) {
          if (key === 'ok') { if (video.paused) { playSafely(); } else { video.pause(); } flashInfo(); return true; }
          if (key === 'up') { video.currentTime = vm.seekTarget(video.currentTime, SEEK_SECONDS, video.duration); flashInfo(); return true; }
          if (key === 'down') { video.currentTime = vm.seekTarget(video.currentTime, -SEEK_SECONDS, video.duration); flashInfo(); return true; }
        }
        if (key === 'ok' || key === 'up' || key === 'down') { flashInfo(); return true; }
        return false;
      }
    };
  };
}(window));
