var fs = require('fs');
var path = require('path');

var JS_RULES = [
  ['fetch', /\bfetch\s*\(/],
  ['Array.from', /\bArray\.from\b/],
  ['Object.assign', /\bObject\.assign\b/],
  ['Object.entries', /\bObject\.(entries|values)\b/],
  ['includes', /\.includes\s*\(/],
  ['startsWith', /\.startsWith\s*\(/],
  ['endsWith', /\.endsWith\s*\(/],
  ['find', /\.find\s*\(/],
  ['findIndex', /\.findIndex\s*\(/],
  ['fill', /\.fill\s*\(/],
  ['repeat', /\.repeat\s*\(/],
  ['padStart', /\.pad(Start|End)\s*\(/],
  ['closest', /\.closest\s*\(/],
  ['append', /\.(append|prepend)\s*\(/],
  ['finally', /\.finally\s*\(/],
  ['NodeList.forEach', /querySelectorAll\([^)]*\)\s*\.forEach/],
  ['scrollIntoView-options', /scrollIntoView\s*\(\s*\{/]
];
var CSS_RULES = [
  ['css-var', /var\(\s*--|(^|[\s{;])--[\w-]+\s*:/],
  ['css-grid', /display\s*:\s*(inline-)?grid|grid-template/],
  ['css-sticky', /position\s*:\s*sticky/],
  ['css-focus-within', /:focus-within|:focus-visible/],
  ['css-gap', /(^|[\s{;])(row-|column-)?gap\s*:/],
  ['css-aspect-ratio', /aspect-ratio\s*:/],
  ['css-math-fn', /\b(min|max|clamp)\s*\(/]
];

function stripJs(src) {
  // Strings first (so "https://" is not read as a comment), then comments; keep newlines for line numbers.
  var s = src.replace(/'(\\.|[^'\\\n])*'|"(\\.|[^"\\\n])*"/g, '""');
  s = s.replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ''); });
  return s.replace(/\/\/.*$/gm, '');
}
function stripCss(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ''); });
}

function scan(source, kind) {
  var code = kind === 'css' ? stripCss(source) : stripJs(source);
  var rules = kind === 'css' ? CSS_RULES : JS_RULES;
  var lines = code.split('\n');
  var out = [];
  lines.forEach(function (text, i) {
    rules.forEach(function (r) {
      if (r[1].test(text)) { out.push({ line: i + 1, rule: r[0] }); }
    });
  });
  return out;
}

function walk(dir, acc) {
  if (!fs.existsSync(dir)) { return acc; }
  fs.readdirSync(dir).forEach(function (name) {
    var p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) { walk(p, acc); } else { acc.push(p); }
  });
  return acc;
}

function main() {
  var root = path.join(__dirname, '..');
  var files = walk(path.join(root, 'core'), []).concat(walk(path.join(root, 'shell-legacy'), []));
  var bad = 0;
  files.forEach(function (f) {
    var kind = /\.js$/.test(f) ? 'js' : (/\.css$/.test(f) ? 'css' : null);
    if (!kind) { return; }
    scan(fs.readFileSync(f, 'utf8'), kind).forEach(function (v) {
      bad++;
      console.error(path.relative(root, f) + ':' + v.line + '  forbidden on Chromium 38: ' + v.rule);
    });
  });
  if (bad) { process.exit(1); }
  console.log('check-es5: ' + files.length + ' files OK');
}

module.exports = { scan: scan };
if (require.main === module) { main(); }
