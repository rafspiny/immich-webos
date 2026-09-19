var test = require('node:test');
var assert = require('node:assert');
var g = require('../../shell-legacy/js/gridmath');

test('layout grid and list', function () {
  assert.deepStrictEqual(g.layout('grid', 5, 1860, 0), { cols: 5, cellW: 372, cellH: 279 });
  assert.deepStrictEqual(g.layout('grid', 5, 1860, 50), { cols: 5, cellW: 372, cellH: 329 });
  assert.deepStrictEqual(g.layout('list', 5, 1860, 50), { cols: 1, cellW: 1860, cellH: 132 });
});
test('totalRows', function () {
  assert.strictEqual(g.totalRows(10, 4), 3);
  assert.strictEqual(g.totalRows(0, 4), 0);
});
test('visibleRange includes overscan and clamps', function () {
  assert.deepStrictEqual(g.visibleRange(0, 300, 100, 50, 1), { first: 0, last: 3 });
  assert.deepStrictEqual(g.visibleRange(1000, 300, 100, 50, 2), { first: 8, last: 14 });
  assert.deepStrictEqual(g.visibleRange(4900, 300, 100, 50, 2), { first: 47, last: 49 });
  assert.deepStrictEqual(g.visibleRange(0, 300, 100, 0, 2), { first: 0, last: -1 });
});
test('moveIndex within a 4-column, 10-item grid', function () {
  assert.strictEqual(g.moveIndex(0, 'left', 4, 10), 0);
  assert.strictEqual(g.moveIndex(5, 'left', 4, 10), 4);
  assert.strictEqual(g.moveIndex(3, 'right', 4, 10), 3);
  assert.strictEqual(g.moveIndex(9, 'right', 4, 10), 9);
  assert.strictEqual(g.moveIndex(5, 'up', 4, 10), 1);
  assert.strictEqual(g.moveIndex(1, 'up', 4, 10), 1);
  assert.strictEqual(g.moveIndex(2, 'down', 4, 10), 6);
  assert.strictEqual(g.moveIndex(6, 'down', 4, 10), 9);
  assert.strictEqual(g.moveIndex(9, 'down', 4, 10), 9);
});
test('moveIndex in list mode (1 column)', function () {
  assert.strictEqual(g.moveIndex(2, 'down', 1, 5), 3);
  assert.strictEqual(g.moveIndex(0, 'up', 1, 5), 0);
  assert.strictEqual(g.moveIndex(2, 'right', 1, 5), 2);
});
test('scrollTopFor keeps the focused row fully visible', function () {
  assert.strictEqual(g.scrollTopFor(20, 4, 100, 300, 0), 300);
  assert.strictEqual(g.scrollTopFor(0, 4, 100, 300, 300), 0);
  assert.strictEqual(g.scrollTopFor(9, 4, 100, 300, 100), 100);
});
test('stepValue clamps at both ends', function () {
  assert.strictEqual(g.stepValue([3, 4, 5], 4, 1), 5);
  assert.strictEqual(g.stepValue([3, 4, 5], 5, 1), 5);
  assert.strictEqual(g.stepValue([3, 4, 5], 3, -1), 3);
  assert.strictEqual(g.stepValue([3, 4, 5], 99, 1), 4);
});
