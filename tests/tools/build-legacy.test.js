var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var root = path.join(__dirname, '..', '..');

test('build-legacy assembles a self-contained app dir with valid appinfo', function () {
  cp.execFileSync('node', [path.join(root, 'tools', 'build-legacy.js')], { cwd: root });
  var out = path.join(root, 'dist', 'legacy');
  ['index.html', 'appinfo.json', 'icon.png', 'largeIcon.png', 'core/http.js', 'js/app.js', 'css/app.css'].forEach(function (f) {
    assert.ok(fs.existsSync(path.join(out, f)), 'missing ' + f);
  });
  var info = JSON.parse(fs.readFileSync(path.join(out, 'appinfo.json'), 'utf8'));
  assert.strictEqual(info.id, 'com.immich.webos');
  assert.strictEqual(info.type, 'web');
  assert.strictEqual(info.resolution, '1920x1080');
  var html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  var srcs = html.match(/src="([^"]+)"/g).map(function (s) { return s.slice(5, -1); });
  srcs.forEach(function (s) { assert.ok(fs.existsSync(path.join(out, s)), 'index.html references missing ' + s); });
});
test('icons have the required sizes', function () {
  cp.execFileSync('node', [path.join(root, 'tools', 'make-icons.js')], { cwd: root });
  function size(f) { var b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }
  assert.deepStrictEqual(size(path.join(root, 'shell-legacy', 'icon.png')), [80, 80]);
  assert.deepStrictEqual(size(path.join(root, 'shell-legacy', 'largeIcon.png')), [130, 130]);
});
