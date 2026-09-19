var test = require('node:test');
var assert = require('node:assert');
var clientMod = require('../../core/immich-client');

function make(responses) {
  var calls = [];
  var http = { request: function (o) {
    calls.push(o);
    var r = responses.shift();
    return r instanceof Error ? Promise.reject(r) : Promise.resolve({ status: 200, data: r });
  } };
  var c = clientMod.create({ http: http, getConfig: function () { return { serverUrl: 'https://s', apiKey: 'K' }; } });
  return { c: c, calls: calls };
}
function httpErr(status) { var e = new Error('x'); e.code = 'http'; e.status = status; return e; }

test('verify uses the given server and key, not stored config', function () {
  var m = make([{ name: 'Ann' }]);
  return m.c.verify('http://other', 'Z').then(function (u) {
    assert.strictEqual(u.name, 'Ann');
    assert.strictEqual(m.calls[0].url, 'http://other/api/users/me');
    assert.strictEqual(m.calls[0].headers['x-api-key'], 'Z');
  });
});
test('verify falls back to /api/user on 404', function () {
  var m = make([httpErr(404), { name: 'Old' }]);
  return m.c.verify('http://o', 'Z').then(function (u) {
    assert.strictEqual(u.name, 'Old'); assert.strictEqual(m.calls[1].url, 'http://o/api/user');
  });
});
test('verify does not swallow unauthorized', function () {
  var e = new Error('no'); e.code = 'unauthorized';
  var m = make([e]);
  return m.c.verify('http://o', 'Z').then(function () { assert.fail('should reject'); }, function (err) { assert.strictEqual(err.code, 'unauthorized'); });
});
test('listAlbums normalizes fields', function () {
  var m = make([[{ id: 'a1', albumName: 'Trip', assetCount: 3, albumThumbnailAssetId: 'x9' }]]);
  return m.c.listAlbums().then(function (l) {
    assert.deepStrictEqual(l, [{ id: 'a1', name: 'Trip', count: 3, coverId: 'x9' }]);
  });
});
test('getAlbum keeps images only', function () {
  var m = make([{ id: 'a1', albumName: 'Trip', assets: [
    { id: '1', type: 'IMAGE', originalFileName: 'a.jpg' }, { id: '2', type: 'VIDEO', originalFileName: 'b.mp4' }] }]);
  return m.c.getAlbum('a1').then(function (a) {
    assert.deepStrictEqual(a, { id: 'a1', name: 'Trip', assets: [{ id: '1', name: 'a.jpg' }] });
  });
});
test('searchPage posts paging body and normalizes nextPage', function () {
  var m = make([{ assets: { items: [{ id: '1', type: 'IMAGE', originalFileName: 'a.jpg' }], nextPage: '3' } }]);
  return m.c.searchPage(2, 60).then(function (r) {
    assert.deepStrictEqual(m.calls[0].body, { page: 2, size: 60, order: 'desc', type: 'IMAGE' });
    assert.strictEqual(m.calls[0].method, 'POST');
    assert.deepStrictEqual(r, { items: [{ id: '1', name: 'a.jpg' }], nextPage: 3 });
  });
});
test('searchPage nextPage null when server sends none', function () {
  var m = make([{ assets: { items: [], nextPage: null } }]);
  return m.c.searchPage(1, 60).then(function (r) { assert.strictEqual(r.nextPage, null); });
});
test('media urls carry the api key as apiKey query param', function () {
  var m = make([]);
  assert.strictEqual(m.c.thumbnailUrl('id1', 'thumbnail'), 'https://s/api/assets/id1/thumbnail?size=thumbnail&apiKey=K');
  assert.strictEqual(m.c.viewerUrl('id1'), 'https://s/api/assets/id1/thumbnail?size=preview&apiKey=K');
});
test('calls reject when not configured', function () {
  var c = clientMod.create({ http: {}, getConfig: function () { return { serverUrl: '', apiKey: '' }; } });
  return c.listAlbums().then(function () { assert.fail('should reject'); }, function (e) { assert.strictEqual(e.code, 'not_configured'); });
});

function assertInvalid(p) {
  return p.then(function () { assert.fail('should reject'); }, function (e) {
    assert.strictEqual(e.code, 'invalid_response');
    assert.match(e.message, /does not look like an Immich server/);
  });
}
test('verify rejects non-object payloads with invalid_response', function () {
  return Promise.all([null, undefined, 'html', [1]].map(function (v) {
    return assertInvalid(make([v]).c.verify('http://o', 'Z'));
  }));
});
test('listAlbums rejects a non-array payload', function () {
  return assertInvalid(make([null]).c.listAlbums());
});
test('getAlbum rejects a non-object payload', function () {
  return assertInvalid(make([null]).c.getAlbum('x'));
});
test('searchPage rejects payloads without assets.items array', function () {
  return Promise.all([null, {}, { assets: {} }, { assets: { items: 'x' } }].map(function (v) {
    return assertInvalid(make([v]).c.searchPage(1, 10));
  }));
});
