function FakeXHR() { this.headers = {}; FakeXHR.last = this; }
FakeXHR.prototype.open = function (m, u) { this.method = m; this.url = u; };
FakeXHR.prototype.setRequestHeader = function (k, v) { this.headers[k] = v; };
FakeXHR.prototype.send = function (b) { this.sent = b; };
FakeXHR.respond = function (status, text) { var x = FakeXHR.last; x.status = status; x.responseText = text; x.onload(); };

function memStorage() {
  var d = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; }
  };
}
module.exports = { FakeXHR: FakeXHR, memStorage: memStorage };
