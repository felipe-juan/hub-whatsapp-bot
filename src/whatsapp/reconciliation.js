'use strict';
function reconcileStatus(items = []) {
  return items.reduce((acc, item) => { const state = String(item.state || 'unknown'); acc[state] = (acc[state] || 0) + 1; return acc; }, {});
}
module.exports = { reconcileStatus };
