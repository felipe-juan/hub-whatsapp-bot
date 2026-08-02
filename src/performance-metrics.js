function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1));
  return Number(sorted[index].toFixed(3));
}

class PerformanceMetrics {
  constructor({ maxSamples = 2000 } = {}) {
    this.maxSamples = Math.max(100, Math.min(20_000, Number(maxSamples || 2000)));
    this.series = new Map();
    this.counters = new Map();
    this.startedAt = new Date().toISOString();
  }

  observe(name, valueMs) {
    const key = String(name || 'unknown').slice(0, 80);
    const value = Number(valueMs || 0);
    if (!Number.isFinite(value) || value < 0) return;
    const values = this.series.get(key) || [];
    values.push(value);
    if (values.length > this.maxSamples) values.splice(0, values.length - this.maxSamples);
    this.series.set(key, values);
  }

  timer(name) {
    const started = performance.now();
    return () => {
      const elapsed = performance.now() - started;
      this.observe(name, elapsed);
      return elapsed;
    };
  }

  increment(name, amount = 1) {
    const key = String(name || 'unknown').slice(0, 80);
    this.counters.set(key, Number(this.counters.get(key) || 0) + Number(amount || 0));
  }

  summary(name) {
    const values = this.series.get(String(name)) || [];
    const sum = values.reduce((total, value) => total + value, 0);
    return {
      count: values.length,
      p50: percentile(values, 0.50),
      p95: percentile(values, 0.95),
      p99: percentile(values, 0.99),
      max: values.length ? Number(Math.max(...values).toFixed(3)) : 0,
      average: values.length ? Number((sum / values.length).toFixed(3)) : 0
    };
  }

  snapshot() {
    return {
      startedAt: this.startedAt,
      series: Object.fromEntries([...this.series.keys()].map(name => [name, this.summary(name)])),
      counters: Object.fromEntries(this.counters)
    };
  }
}

module.exports = { PerformanceMetrics, percentile };
