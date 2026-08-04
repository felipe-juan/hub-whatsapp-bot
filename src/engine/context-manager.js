'use strict';
function contextExpiresAt(seconds = 300, now = Date.now()) { return now + Math.max(1, Number(seconds || 300)) * 1000; }
function isContextExpired(context, now = Date.now()) { return !context || Number(context.expiresAt || 0) <= now; }
function pruneContextMap(map, { now = Date.now(), max = 1500 } = {}) {
  for (const [key, value] of map) if (isContextExpired(value, now)) map.delete(key);
  if (map.size <= max) return map.size;
  const ordered = [...map.entries()].sort((a, b) => Number(a[1]?.expiresAt || 0) - Number(b[1]?.expiresAt || 0));
  for (const [key] of ordered.slice(0, map.size - max)) map.delete(key);
  return map.size;
}
module.exports = { contextExpiresAt, isContextExpired, pruneContextMap };
