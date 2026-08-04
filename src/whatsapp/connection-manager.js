'use strict';
function reconnectDelay(attempt = 0, { base = 2000, max = 60000 } = {}) {
  return Math.min(max, base * (2 ** Math.min(6, Math.max(0, Number(attempt || 0)))));
}
function isOpen(connection) { return connection === 'open'; }
module.exports = { reconnectDelay, isOpen };
