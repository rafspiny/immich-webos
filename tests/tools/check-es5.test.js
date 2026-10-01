var test = require('node:test');
var assert = require('node:assert');
var gate = require('../../tools/check-es5');

function rules(src, kind) { return gate.scan(src, kind).map(function (v) { return v.rule; }); }

test('flags fetch calls', function () {
  assert.deepStrictEqual(rules('fetch(url).then(f)', 'js'), ['fetch']);
});
test('flags Array.from and Object.assign', function () {
  assert.deepStrictEqual(rules('Array.from(x); Object.assign({}, y)', 'js'), ['Array.from', 'Object.assign']);
});
test('flags string and array ES6 methods', function () {
  assert.deepStrictEqual(rules('a.includes(1); s.startsWith("x"); l.find(f)', 'js'),
    ['includes', 'startsWith', 'find']);
});
test('flags NodeList forEach on querySelectorAll', function () {
  assert.deepStrictEqual(rules('document.querySelectorAll(".a").forEach(f)', 'js'), ['NodeList.forEach']);
});
test('ignores forbidden words in comments and strings', function () {
  assert.deepStrictEqual(rules('// fetch(x)\n/* Array.from */ var a = "fetch(x) https://x";', 'js'), []);
});
test('reports line numbers', function () {
  assert.strictEqual(gate.scan('var a;\nfetch(1)', 'js')[0].line, 2);
});
test('css: flags variables, grid, sticky, focus-within, gap', function () {
  var css = ':root{--a:1}\n.a{display:grid}\n.b{position:sticky}\n.c:focus-within{}\n.d{gap:4px}';
  assert.deepStrictEqual(rules(css, 'css'), ['css-var', 'css-grid', 'css-sticky', 'css-focus-within', 'css-gap']);
});
test('css: accepts flexbox', function () {
  assert.deepStrictEqual(rules('.a{display:flex;flex-wrap:wrap}', 'css'), []);
});
