var test = require('node:test');
var assert = require('node:assert');
var vm = require('../../shell-legacy/js/videomath');

test('formatClock shows m:ss and h:mm:ss', function () {
  assert.strictEqual(vm.formatClock(0), '0:00');
  assert.strictEqual(vm.formatClock(5), '0:05');
  assert.strictEqual(vm.formatClock(65.9), '1:05');
  assert.strictEqual(vm.formatClock(3600), '1:00:00');
  assert.strictEqual(vm.formatClock(3725), '1:02:05');
});
test('formatClock copes with NaN, Infinity, negatives and junk', function () {
  assert.strictEqual(vm.formatClock(NaN), '0:00');
  assert.strictEqual(vm.formatClock(Infinity), '0:00');
  assert.strictEqual(vm.formatClock(-4), '0:00');
  assert.strictEqual(vm.formatClock(undefined), '0:00');
});
test('seekTarget moves by delta and stays inside the video', function () {
  assert.strictEqual(vm.seekTarget(30, 10, 100), 40);
  assert.strictEqual(vm.seekTarget(5, -10, 100), 0);
  assert.strictEqual(vm.seekTarget(95, 10, 100), 100);
});
test('seekTarget with an unknown duration only clamps at zero', function () {
  assert.strictEqual(vm.seekTarget(30, 10, NaN), 40);
  assert.strictEqual(vm.seekTarget(3, -10, NaN), 0);
});
