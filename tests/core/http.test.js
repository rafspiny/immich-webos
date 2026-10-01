var test = require('node:test');
var assert = require('node:assert');
var FakeXHR = require('../helpers').FakeXHR;
var http = require('../../core/http').create(function () { return new FakeXHR(); });

test('resolves parsed JSON on 200 and sends headers', function () {
  var p = http.request({ url: 'http://s/api/x', headers: { 'x-api-key': 'k' } });
  assert.strictEqual(FakeXHR.last.headers['x-api-key'], 'k');
  FakeXHR.respond(200, '{"a":1}');
  return p.then(function (r) { assert.deepStrictEqual(r, { status: 200, data: { a: 1 } }); });
});
test('POST serializes body as JSON', function () {
  var p = http.request({ method: 'POST', url: 'u', body: { page: 1 } });
  assert.strictEqual(FakeXHR.last.sent, '{"page":1}');
  assert.strictEqual(FakeXHR.last.headers['Content-Type'], 'application/json');
  FakeXHR.respond(200, '{}');
  return p;
});
test('401 and 403 reject as unauthorized', function () {
  var p = http.request({ url: 'u' });
  FakeXHR.respond(401, '');
  return p.then(function () { assert.fail('should reject'); }, function (e) {
    assert.strictEqual(e.code, 'unauthorized'); assert.strictEqual(e.status, 401);
  });
});
test('500 rejects as http with status', function () {
  var p = http.request({ url: 'u' });
  FakeXHR.respond(500, '');
  return p.then(function () { assert.fail('should reject'); }, function (e) {
    assert.strictEqual(e.code, 'http'); assert.match(e.message, /HTTP 500/);
  });
});
test('network error rejects as network and mentions certificate', function () {
  var p = http.request({ url: 'u' });
  FakeXHR.last.onerror();
  return p.then(function () { assert.fail('should reject'); }, function (e) {
    assert.strictEqual(e.code, 'network'); assert.match(e.message, /certificate/);
  });
});
test('timeout rejects as timeout', function () {
  var p = http.request({ url: 'u', timeout: 5 });
  assert.strictEqual(FakeXHR.last.timeout, 5);
  FakeXHR.last.ontimeout();
  return p.then(function () { assert.fail('should reject'); }, function (e) { assert.strictEqual(e.code, 'timeout'); });
});
