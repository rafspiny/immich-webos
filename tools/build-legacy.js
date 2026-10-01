var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var out = path.join(root, 'dist', 'legacy');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, 'core'), path.join(out, 'core'), { recursive: true });
fs.readdirSync(path.join(root, 'shell-legacy')).forEach(function (name) {
  fs.cpSync(path.join(root, 'shell-legacy', name), path.join(out, name), { recursive: true });
});
console.log('built ' + path.relative(root, out));
