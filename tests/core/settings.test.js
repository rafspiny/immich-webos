var test = require('node:test');
var assert = require('node:assert');
var settings = require('../../core/settings');
var memStorage = require('../helpers').memStorage;

test('normalizeUrl adds https, trims slashes and trailing /api', function () {
  assert.strictEqual(settings.normalizeUrl(' photos.example.com/ '), 'https://photos.example.com');
  assert.strictEqual(settings.normalizeUrl('http://10.0.0.5:2283/api'), 'http://10.0.0.5:2283');
  assert.strictEqual(settings.normalizeUrl('   '), '');
});
test('credentials round-trip and clear', function () {
  var s = settings.create(memStorage());
  assert.deepStrictEqual(s.getCredentials(), { serverUrl: '', apiKey: '' });
  s.saveCredentials('photos.example.com/', ' KEY ');
  assert.deepStrictEqual(s.getCredentials(), { serverUrl: 'https://photos.example.com', apiKey: 'KEY' });
  s.clearCredentials();
  assert.deepStrictEqual(s.getCredentials(), { serverUrl: '', apiKey: '' });
});
test('view defaults', function () {
  assert.deepStrictEqual(settings.create(memStorage()).getView(), { viewMode: 'grid', columns: 5, thumbSize: 'thumbnail' });
});
test('view round-trips and is clamped/validated on read', function () {
  var st = memStorage(); var s = settings.create(st);
  s.saveView({ viewMode: 'list', columns: 7, thumbSize: 'preview' });
  assert.deepStrictEqual(s.getView(), { viewMode: 'list', columns: 7, thumbSize: 'preview' });
  st.setItem('immich_columns', '99'); assert.strictEqual(s.getView().columns, 8);
  st.setItem('immich_columns', '1');  assert.strictEqual(s.getView().columns, 3);
  st.setItem('immich_columns', 'x');  assert.strictEqual(s.getView().columns, 5);
  st.setItem('immich_view_mode', 'weird'); assert.strictEqual(s.getView().viewMode, 'grid');
});
test('url history is deduped, most-recent-first, max 5', function () {
  var s = settings.create(memStorage());
  ['a', 'b', 'c', 'd', 'e', 'f', 'c'].forEach(function (u) { s.addUrlHistory('https://' + u + '.x'); });
  assert.deepStrictEqual(s.getUrlHistory(),
    ['https://c.x', 'https://f.x', 'https://e.x', 'https://d.x', 'https://b.x']);
});
test('a throwing storage never throws', function () {
  var bad = { getItem: function () { throw new Error('x'); }, setItem: function () { throw new Error('x'); }, removeItem: function () { throw new Error('x'); } };
  var s = settings.create(bad);
  s.saveCredentials('a', 'b');
  assert.deepStrictEqual(s.getCredentials(), { serverUrl: '', apiKey: '' });
});
