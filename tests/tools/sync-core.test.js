var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var sync = require('../../tools/sync-core');

test('sync copies core js files, adds a generated marker, removes stale files', function () {
  var dst = fs.mkdtempSync(path.join(os.tmpdir(), 'core-'));
  fs.writeFileSync(path.join(dst, 'stale.js'), 'x');
  sync.sync(path.join(__dirname, '..', '..', 'core'), dst);
  assert.ok(fs.existsSync(path.join(dst, 'http.js')));
  assert.ok(fs.existsSync(path.join(dst, 'auth.js')));
  assert.ok(!fs.existsSync(path.join(dst, 'stale.js')));
  assert.match(fs.readFileSync(path.join(dst, 'README.txt'), 'utf8'), /GENERATED/);
  assert.strictEqual(fs.readFileSync(path.join(dst, 'http.js'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'http.js'), 'utf8'));
});
