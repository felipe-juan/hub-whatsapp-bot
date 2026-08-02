const { monitorEventLoopDelay } = require('node:perf_hooks');

class HealthWatchdog {
  constructor({ intervalMs = 15_000, getState, recover, onSample = null } = {}) {
    this.intervalMs = Math.max(5000, Number(intervalMs || 15_000));
    this.getState = typeof getState === 'function' ? getState : () => ({});
    this.recover = typeof recover === 'function' ? recover : async () => {};
    this.onSample = typeof onSample === 'function' ? onSample : null;
    this.histogram = monitorEventLoopDelay({ resolution: 20 });
    this.timer = null;
    this.runningRecovery = false;
    this.recoveryLevel = 0;
    this.lastRecoveryAt = 0;
    this.lastReason = '';
    this.samples = [];
  }

  start() {
    if (this.timer) return;
    this.histogram.enable();
    this.timer = setInterval(() => this.tick().catch(() => {}), this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.histogram.disable();
  }

  async tick() {
    const state = this.getState() || {};
    const eventLoopP99Ms = Number(this.histogram.percentile(99) / 1e6 || 0);
    const eventLoopMaxMs = Number(this.histogram.max / 1e6 || 0);
    this.histogram.reset();
    const sample = {
      at: new Date().toISOString(),
      eventLoopP99Ms: Number(eventLoopP99Ms.toFixed(2)),
      eventLoopMaxMs: Number(eventLoopMaxMs.toFixed(2)),
      rssBytes: Number(process.memoryUsage().rss || 0),
      heapUsedBytes: Number(process.memoryUsage().heapUsed || 0),
      ...state
    };
    this.samples.push(sample);
    if (this.samples.length > 240) this.samples.splice(0, this.samples.length - 240);
    this.onSample?.(sample);

    const now = Date.now();
    let reason = '';
    if (sample.databaseOk === false) reason = 'banco de dados indisponível';
    else if (eventLoopP99Ms > 2500) reason = `event loop bloqueado por ${Math.round(eventLoopP99Ms)} ms`;
    else if (Number(sample.oldestActiveSendMs || 0) > 75_000) reason = 'envio do WhatsApp travado por mais de 75 segundos';
    else if (Number(sample.dueDeliveries || 0) > 0 && sample.whatsappState === 'ready' && Number(sample.msSinceLastSendProgress || 0) > 120_000) reason = 'fila persistente sem progresso por mais de 2 minutos';
    else if (Number(sample.consecutiveSendErrors || 0) >= 8) reason = 'muitos erros consecutivos de envio';

    if (!reason) {
      if (this.recoveryLevel && now - this.lastRecoveryAt > 10 * 60_000) this.recoveryLevel = 0;
      return sample;
    }
    if (this.runningRecovery || now - this.lastRecoveryAt < 45_000) return sample;
    this.runningRecovery = true;
    this.recoveryLevel = Math.min(5, this.recoveryLevel + 1);
    this.lastRecoveryAt = now;
    this.lastReason = reason;
    try { await this.recover(this.recoveryLevel, reason, sample); }
    finally { this.runningRecovery = false; }
    return sample;
  }

  stats() {
    const latest = this.samples.at(-1) || {};
    const first = this.samples[0] || {};
    const rssGrowthBytes = latest.rssBytes && first.rssBytes ? latest.rssBytes - first.rssBytes : 0;
    return {
      running: Boolean(this.timer),
      recoveryLevel: this.recoveryLevel,
      lastRecoveryAt: this.lastRecoveryAt ? new Date(this.lastRecoveryAt).toISOString() : '',
      lastReason: this.lastReason,
      latest,
      sampleCount: this.samples.length,
      rssGrowthBytes
    };
  }
}

module.exports = { HealthWatchdog };
