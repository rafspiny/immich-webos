/*
 * log-server.js — tiny local HTTP server that receives debug beacons
 * from core/debug-log.js (fired as `new Image().src = .../log?...`)
 * and appends them to a file you can `tail -f`.
 *
 * No dependencies. Run with `node tools/log-server.js` or `npm run debug:log-server`.
 * Override with env vars: PORT (default 8899), LOG_FILE (default build/webos-debug.log).
 */
var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var root = path.join(__dirname, '..');
var PORT = parseInt(process.env.PORT, 10) || 8899;
var LOG_FILE = process.env.LOG_FILE || path.join(root, 'build', 'webos-debug.log');

/* 1x1 transparent GIF, so an <img>/Image() beacon never shows a broken-image warning. */
var PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

function appendLine(query) {
  var line = new Date().toISOString() + '  ' + (query.tag || '-') + '  ' + (query.d || '') + '\n';
  fs.appendFileSync(LOG_FILE, line);
  process.stdout.write(line);
}

fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

var server = http.createServer(function (req, res) {
  var parsed = url.parse(req.url, true);
  if (parsed.pathname === '/log') {
    try { appendLine(parsed.query || {}); } catch (e) { console.error('log-server: failed to write log line:', e.message); }
    res.writeHead(200, { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' });
    res.end(PIXEL);
    return;
  }
  res.writeHead(404);
  res.end();
});

server.on('error', function (err) {
  console.error('log-server: ' + err.message);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', function () {
  console.log('log-server listening on 0.0.0.0:' + PORT);
  console.log('appending to ' + LOG_FILE);
  console.log('run: tail -f ' + LOG_FILE);
});
