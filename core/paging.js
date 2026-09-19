(function (root) {
  'use strict';
  var core = root.ImmichCore = root.ImmichCore || {};

  function createPager(fetchPage) {
    var items = [];
    var next = 1;
    var done = false;
    var inflight = null;
    return {
      items: function () { return items; },
      hasMore: function () { return !done; },
      loadNext: function () {
        if (done) { return Promise.resolve(0); }
        if (inflight) { return inflight; }
        inflight = fetchPage(next).then(function (res) {
          inflight = null;
          items = items.concat(res.items);
          if (res.nextPage === null || res.nextPage === undefined || res.items.length === 0) { done = true; } else { next = res.nextPage; }
          return res.items.length;
        }, function (err) { inflight = null; throw err; });
        return inflight;
      }
    };
  }

  var api = { createPager: createPager };
  core.paging = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
}(typeof window !== 'undefined' ? window : global));
