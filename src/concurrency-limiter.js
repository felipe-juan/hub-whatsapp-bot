class ConcurrencyLimiter {
  constructor({ maxConcurrent = 8, onChange = null, name = 'limiter' } = {}) {
    this.name = String(name || 'limiter');
    this.maxConcurrent = Math.max(1, Math.min(64, Number(maxConcurrent || 8)));
    this.onChange = typeof onChange === 'function' ? onChange : null;
    this.active = 0;
    this.queue = [];
    this.sequence = 0;
    this.accepting = true;
    this.idleWaiters = new Set();
  }

  notify() {
    this.onChange?.(this.stats());
    if (this.active === 0 && this.queue.length === 0) {
      for (const resolve of this.idleWaiters) resolve(true);
      this.idleWaiters.clear();
    }
  }

  setMaxConcurrent(value) {
    this.maxConcurrent = Math.max(1, Math.min(64, Number(value || 1)));
    this.pump();
  }

  schedule(task, { priority = 0, label = '' } = {}) {
    if (typeof task !== 'function') return Promise.reject(new TypeError('Tarefa inválida.'));
    if (!this.accepting) return Promise.reject(new Error(`${this.name} não está aceitando novas tarefas.`));
    return new Promise((resolve, reject) => {
      this.queue.push({
        task,
        resolve,
        reject,
        priority: Number(priority || 0),
        label: String(label || '').slice(0, 160),
        sequence: this.sequence++,
        queuedAt: Date.now()
      });
      this.queue.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
      this.notify();
      this.pump();
    });
  }

  pump() {
    while (this.active < this.maxConcurrent && this.queue.length) {
      const entry = this.queue.shift();
      this.active += 1;
      this.notify();
      Promise.resolve()
        .then(entry.task)
        .then(entry.resolve, entry.reject)
        .finally(() => {
          this.active = Math.max(0, this.active - 1);
          this.notify();
          this.pump();
        });
    }
  }

  stopAccepting() { this.accepting = false; this.notify(); }
  resumeAccepting() { this.accepting = true; this.notify(); this.pump(); }

  async whenIdle(timeoutMs = 0) {
    if (this.active === 0 && this.queue.length === 0) return true;
    let timer;
    return new Promise(resolve => {
      const done = value => { clearTimeout(timer); this.idleWaiters.delete(done); resolve(value); };
      this.idleWaiters.add(done);
      if (Number(timeoutMs) > 0) timer = setTimeout(() => done(false), Number(timeoutMs));
    });
  }

  clear(error = new Error(`${this.name} encerrado.`)) {
    const queued = this.queue.splice(0);
    for (const entry of queued) entry.reject(error);
    this.notify();
    return queued.length;
  }

  stats() {
    const now = Date.now();
    return {
      name: this.name,
      maxConcurrent: this.maxConcurrent,
      active: this.active,
      queued: this.queue.length,
      accepting: this.accepting,
      oldestQueuedMs: this.queue.length ? Math.max(0, now - this.queue[0].queuedAt) : 0
    };
  }
}

module.exports = { ConcurrencyLimiter };
