class CircuitBreaker {
  constructor({ failureThreshold = 3, baseCooldownMs = 15_000, maxCooldownMs = 5 * 60_000, onChange = null, now = () => Date.now() } = {}) {
    this.failureThreshold = Math.max(1, Number(failureThreshold || 3));
    this.baseCooldownMs = Math.max(1000, Number(baseCooldownMs || 15_000));
    this.maxCooldownMs = Math.max(this.baseCooldownMs, Number(maxCooldownMs || 300_000));
    this.onChange = typeof onChange === 'function' ? onChange : null;
    this.now = typeof now === 'function' ? now : () => Date.now();
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.openedAt = 0;
    this.nextAttemptAt = 0;
    this.halfOpenProbe = false;
    this.lastError = '';
    this.totalOpened = 0;
  }

  notify() { this.onChange?.(this.stats()); }

  beforeRequest(now = this.now()) {
    if (this.state === 'open') {
      if (now < this.nextAttemptAt) return { allowed: false, retryAfterMs: this.nextAttemptAt - now, state: this.state };
      this.state = 'half-open';
      this.halfOpenProbe = false;
      this.notify();
    }
    if (this.state === 'half-open') {
      if (this.halfOpenProbe) return { allowed: false, retryAfterMs: 1000, state: this.state };
      this.halfOpenProbe = true;
    }
    return { allowed: true, retryAfterMs: 0, state: this.state };
  }

  recordSuccess() {
    const changed = this.state !== 'closed' || this.consecutiveFailures > 0;
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.openedAt = 0;
    this.nextAttemptAt = 0;
    this.halfOpenProbe = false;
    this.lastError = '';
    if (changed) this.notify();
  }

  recordFailure(error, { code = 0, cooldownMs = 0 } = {}) {
    this.halfOpenProbe = false;
    this.consecutiveFailures += 1;
    this.lastError = String(error?.message || error || 'falha temporária').slice(0, 500);
    const forced = Number(cooldownMs || 0);
    const shouldOpen = this.state === 'half-open' || this.consecutiveFailures >= this.failureThreshold || [429, 403].includes(Number(code || 0));
    if (shouldOpen) {
      const exponential = this.baseCooldownMs * (2 ** Math.max(0, this.consecutiveFailures - this.failureThreshold));
      const wait = Math.min(this.maxCooldownMs, Math.max(forced, exponential));
      this.state = 'open';
      this.openedAt = this.now();
      this.nextAttemptAt = this.openedAt + wait;
      this.totalOpened += 1;
    }
    this.notify();
    return this.stats();
  }

  forceOpen(reason, cooldownMs = this.baseCooldownMs) {
    this.lastError = String(reason || 'circuito aberto manualmente').slice(0, 500);
    this.state = 'open';
    this.openedAt = this.now();
    this.nextAttemptAt = this.openedAt + Math.min(this.maxCooldownMs, Math.max(1000, Number(cooldownMs || 0)));
    this.halfOpenProbe = false;
    this.totalOpened += 1;
    this.notify();
  }

  reset() { this.recordSuccess(); }

  stats() {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt ? new Date(this.openedAt).toISOString() : '',
      nextAttemptAt: this.nextAttemptAt ? new Date(this.nextAttemptAt).toISOString() : '',
      retryAfterMs: Math.max(0, this.nextAttemptAt - this.now()),
      lastError: this.lastError,
      totalOpened: this.totalOpened
    };
  }
}

module.exports = { CircuitBreaker };
