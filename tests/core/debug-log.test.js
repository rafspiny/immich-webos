var test = require('node:test');
var assert = require('node:assert');
var debugLog = require('../../core/debug-log');

function reset(on) { debugLog.clear(); debugLog.setEnabled(on); }

// Keep this first: the module starts in its default state.
test('logging is off until something switches it on', function () {
  assert.strictEqual(debugLog.isEnabled(), false);
});
test('nothing is recorded while disabled', function () {
  reset(false);
  debugLog('http', { a: 1 });
  assert.deepStrictEqual(debugLog.entries(), []);
});
test('entries come back newest first with tag and text', function () {
  reset(true);
  debugLog('one', { n: 1 });
  debugLog('two', 'plain');
  var e = debugLog.entries();
  assert.strictEqual(e.length, 2);
  assert.strictEqual(e[0].tag, 'two');
  assert.strictEqual(e[0].text, '"plain"');
  assert.strictEqual(e[1].tag, 'one');
  assert.strictEqual(e[1].text, '{"n":1}');
  assert.strictEqual(typeof e[0].ts, 'number');
});
test('keeps at most 200 entries and drops the oldest', function () {
  reset(true);
  for (var i = 0; i < 250; i++) { debugLog('t', { n: i }); }
  var e = debugLog.entries();
  assert.strictEqual(e.length, 200);
  assert.strictEqual(e[0].text, '{"n":249}');
  assert.strictEqual(e[199].text, '{"n":50}');
});
test('clear empties the buffer', function () {
  reset(true);
  debugLog('t', 1);
  debugLog.clear();
  assert.deepStrictEqual(debugLog.entries(), []);
});
test('entries() is a snapshot that later logging does not change', function () {
  reset(true);
  debugLog('a', 1);
  var snap = debugLog.entries();
  debugLog('b', 2);
  assert.strictEqual(snap.length, 1);
});
test('very long data is truncated', function () {
  reset(true);
  debugLog('big', new Array(5001).join('x'));
  var text = debugLog.entries()[0].text;
  assert.ok(text.length < 2100);
  assert.match(text, /\.\.\.\(truncated\)$/);
});
test('data that cannot be serialized never throws', function () {
  reset(true);
  var loop = {};
  loop.self = loop;
  debugLog('loop', loop);
  assert.strictEqual(debugLog.entries()[0].text, '[unserializable]');
});
test('format renders local time, tag and text on one line', function () {
  var ts = new Date(2026, 8, 25, 13, 5, 9, 7).getTime();
  assert.strictEqual(debugLog.format({ ts: ts, tag: 'http', text: '{"a":1}' }), '13:05:09.007  http  {"a":1}');
});
test('redactUrl hides the api key', function () {
  assert.strictEqual(
    debugLog.redactUrl('https://s/api/assets/1/thumbnail?size=thumbnail&apiKey=SECRET&x=1'),
    'https://s/api/assets/1/thumbnail?size=thumbnail&apiKey=REDACTED&x=1');
});
test('redactUrl hides every apiKey= occurrence, not just the first', function () {
  assert.strictEqual(
    debugLog.redactUrl('https://s/a?apiKey=FIRST&x=1&apiKey=SECOND'),
    'https://s/a?apiKey=REDACTED&x=1&apiKey=REDACTED');
});
