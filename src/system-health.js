'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function meminfo() {
  try {
    const values = {};
    for (const line of fs.readFileSync('/proc/meminfo','utf8').split(/\r?\n/)) {
      const match = line.match(/^([^:]+):\s+(\d+)\s+kB/i); if (match) values[match[1]] = Number(match[2]) * 1024;
    }
    return {
      totalBytes: values.MemTotal || os.totalmem(),
      availableBytes: values.MemAvailable || os.freemem(),
      usedBytes: (values.MemTotal || os.totalmem()) - (values.MemAvailable || os.freemem()),
      swapTotalBytes: values.SwapTotal || 0,
      swapFreeBytes: values.SwapFree || 0,
      swapUsedBytes: Math.max(0, (values.SwapTotal || 0) - (values.SwapFree || 0))
    };
  } catch { return { totalBytes: os.totalmem(), availableBytes: os.freemem(), usedBytes: os.totalmem()-os.freemem(), swapTotalBytes:0, swapFreeBytes:0, swapUsedBytes:0 }; }
}
function diskInfo(target) {
  try {
    const stat = fs.statfsSync(path.resolve(target || '/'));
    const block = Number(stat.bsize || stat.frsize || 4096);
    const totalBytes = Number(stat.blocks || 0) * block;
    const availableBytes = Number(stat.bavail || stat.bfree || 0) * block;
    return { totalBytes, availableBytes, usedBytes: Math.max(0,totalBytes-availableBytes) };
  } catch { return { totalBytes:0, availableBytes:0, usedBytes:0 }; }
}
function systemHealth(rootDir='/') {
  return { uptimeSeconds: Math.floor(os.uptime()), loadAverage: os.loadavg(), memory: meminfo(), disk: diskInfo(rootDir), hostname: os.hostname(), platform: `${os.platform()} ${os.release()}` };
}
module.exports = { systemHealth, meminfo, diskInfo };
