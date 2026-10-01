var test = require('node:test');
var assert = require('node:assert');
var km = require('../../shell-legacy/js/keyboard-model');

function press(m, dirs) { dirs.forEach(function (d) { m.move(d); }); return m.press(); }

test('starts on "1" and types characters', function () {
  var m = km.create({ initial: '' });
  assert.strictEqual(m.press(), 'char');
  press(m, ['down']);                 /* q */
  assert.strictEqual(m.text(), '1q');
});
test('shift toggles case for following characters', function () {
  var m = km.create({ initial: '' });
  m.move('down'); m.move('down'); m.move('down'); m.move('down');    /* row 4 = action row (no shortcuts) */
  assert.strictEqual(m.rows()[4][0].action, 'shift');
  assert.strictEqual(m.press(), 'shift');
  m.move('up'); m.move('up'); m.move('up'); m.move('up');
  m.move('down');                                                   /* row 1: q */
  assert.strictEqual(m.rows()[1][0].label, 'Q');
  m.press();
  assert.strictEqual(m.text(), 'Q');
});
test('backspace, clear and done', function () {
  var m = km.create({ initial: 'abc' });
  var act = m.rows().length - 1;
  for (var i = 0; i < act; i++) { m.move('down'); }
  m.move('right');
  assert.strictEqual(m.press(), 'backspace'); assert.strictEqual(m.text(), 'ab');
  m.move('right');
  assert.strictEqual(m.press(), 'clear'); assert.strictEqual(m.text(), '');
  for (var j = 0; j < 10; j++) { m.move('right'); }
  assert.strictEqual(m.press(), 'done');
});
test('shortcut keys append text', function () {
  var m = km.create({ initial: '', shortcuts: ['https://', '.com'] });
  for (var i = 0; i < 4; i++) { m.move('down'); }
  assert.strictEqual(m.press(), 'text');
  assert.strictEqual(m.text(), 'https://');
});
test('masked display hides text until revealed', function () {
  var m = km.create({ initial: 'secret', masked: true });
  assert.strictEqual(m.display(), '******');
  var act = m.rows().length - 1;
  for (var i = 0; i < act; i++) { m.move('down'); }
  m.move('right'); m.move('right'); m.move('right');
  assert.strictEqual(m.rows()[act][3].action, 'reveal');
  m.press();
  assert.strictEqual(m.display(), 'secret');
});
test('move reports edges and clamps the column on shorter rows', function () {
  var m = km.create({ initial: '' });
  assert.strictEqual(m.move('left'), false);
  assert.strictEqual(m.move('up'), false);
  for (var i = 0; i < 9; i++) { m.move('right'); }
  assert.deepStrictEqual(m.cursor(), { row: 0, col: 9 });
  for (var j = 0; j < 4; j++) { m.move('down'); }               /* action row is shorter */
  assert.ok(m.cursor().col <= m.rows()[4].length - 1);
});
