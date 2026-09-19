var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

function png(size, rgbAt) {
  var raw = Buffer.alloc((size * 4 + 1) * size);
  for (var y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (var x = 0; x < size; x++) {
      var c = rgbAt(x, y, size), o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = 255;
    }
  }
  function chunk(type, data) {
    var len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    var td = Buffer.concat([Buffer.from(type), data]);
    var crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  }
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Dark tile with four coloured petals around the centre (Immich-like flower).
function flower(x, y, s) {
  var dx = x - s / 2, dy = y - s / 2, r = Math.sqrt(dx * dx + dy * dy);
  if (r < s * 0.08) { return [17, 24, 39]; }
  if (r > s * 0.42) { return [17, 24, 39]; }
  if (dx >= 0 && dy < 0) { return [250, 41, 80]; }
  if (dx >= 0 && dy >= 0) { return [255, 180, 0]; }
  if (dx < 0 && dy >= 0) { return [66, 133, 244]; }
  return [30, 200, 130];
}

var dir = path.join(__dirname, '..');
[['shell-legacy', 80, 'icon.png'], ['shell-legacy', 130, 'largeIcon.png'],
 ['tools/probe', 80, 'icon.png'], ['tools/probe', 130, 'largeIcon.png']].forEach(function (t) {
  fs.writeFileSync(path.join(dir, t[0], t[2]), png(t[1], flower));
});
console.log('icons written');
