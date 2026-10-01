var test = require('node:test');
var assert = require('node:assert');
var authMod = require('../../core/auth');
var settingsMod = require('../../core/settings');
var memStorage = require('../helpers').memStorage;

function make(verify) {
  var settings = settingsMod.create(memStorage());
  var seen = [];
  var client = { verify: function (u, k) { seen.push([u, k]); return verify(u, k); } };
  return { a: authMod.create({ client: client, settings: settings }), settings: settings, seen: seen };
}

test('connect verifies normalized url, then saves credentials and history', function () {
  var m = make(function () { return Promise.resolve({ name: 'Ann' }); });
  return m.a.connect('photos.example.com/', ' KEY ').then(function (u) {
    assert.strictEqual(u.name, 'Ann');
    assert.deepStrictEqual(m.seen[0], ['https://photos.example.com', 'KEY']);
    assert.deepStrictEqual(m.settings.getCredentials(), { serverUrl: 'https://photos.example.com', apiKey: 'KEY' });
    assert.deepStrictEqual(m.settings.getUrlHistory(), ['https://photos.example.com']);
    assert.strictEqual(m.a.isConfigured(), true);
  });
});
test('connect does not save when verification fails', function () {
  var m = make(function () { var e = new Error('bad'); e.code = 'unauthorized'; return Promise.reject(e); });
  return m.a.connect('h.x', 'K').then(function () { assert.fail('should reject'); }, function (e) {
    assert.strictEqual(e.code, 'unauthorized'); assert.strictEqual(m.a.isConfigured(), false);
  });
});
test('connect rejects empty input without calling the server', function () {
  var m = make(function () { return Promise.resolve({}); });
  return m.a.connect('', 'K').then(function () { assert.fail('should reject'); }, function (e) {
    assert.strictEqual(e.code, 'invalid_input'); assert.match(e.message, /address/);
    return m.a.connect('h.x', ' ');
  }).then(function () { assert.fail('should reject'); }, function (e) {
    assert.strictEqual(e.code, 'invalid_input'); assert.match(e.message, /API key/); assert.strictEqual(m.seen.length, 0);
  });
});
test('signOut clears credentials; userLabel prefers name over email', function () {
  var m = make(function () { return Promise.resolve({}); });
  m.settings.saveCredentials('h.x', 'K');
  m.a.signOut();
  assert.strictEqual(m.a.isConfigured(), false);
  assert.strictEqual(m.a.userLabel({ name: 'Ann', email: 'a@x' }), 'Ann');
  assert.strictEqual(m.a.userLabel({ email: 'a@x' }), 'a@x');
});
