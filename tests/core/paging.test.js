var test = require('node:test');
var assert = require('node:assert');
var paging = require('../../core/paging');

function source(pages) {
  var calls = [];
  return { calls: calls, fetch: function (n) { calls.push(n); return Promise.resolve(pages[n - 1]); } };
}

test('loads pages in order and stops when nextPage is null', function () {
  var s = source([{ items: [1, 2], nextPage: 2 }, { items: [3], nextPage: null }]);
  var p = paging.createPager(s.fetch);
  return p.loadNext().then(function (n) {
    assert.strictEqual(n, 2); assert.strictEqual(p.hasMore(), true);
    return p.loadNext();
  }).then(function (n) {
    assert.strictEqual(n, 1); assert.deepStrictEqual(p.items(), [1, 2, 3]);
    assert.strictEqual(p.hasMore(), false);
    return p.loadNext();
  }).then(function (n) { assert.strictEqual(n, 0); assert.deepStrictEqual(s.calls, [1, 2]); });
});
test('concurrent loadNext calls share one request', function () {
  var s = source([{ items: [1], nextPage: null }]);
  var p = paging.createPager(s.fetch);
  return Promise.all([p.loadNext(), p.loadNext()]).then(function () { assert.deepStrictEqual(s.calls, [1]); });
});
test('a failed load can be retried', function () {
  var fail = true;
  var p = paging.createPager(function () { return fail ? Promise.reject(new Error('x')) : Promise.resolve({ items: [9], nextPage: null }); });
  return p.loadNext().then(function () { assert.fail('should reject'); }, function () {
    fail = false; return p.loadNext();
  }).then(function () { assert.deepStrictEqual(p.items(), [9]); });
});
