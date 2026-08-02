class OutboundGuard {
  constructor() {
    this.globalEvents = [];
    this.perSender = new Map();
    this.blockedCount = 0;
  }

  prune(now = Date.now()) {
    const hourAgo = now - 60 * 60 * 1000;
    this.globalEvents = this.globalEvents.filter(value => value >= hourAgo);
    for (const [sender, values] of this.perSender) {
      const recent = values.filter(value => value >= now - 60 * 1000);
      if (recent.length) this.perSender.set(sender, recent);
      else this.perSender.delete(sender);
    }
  }

  check(sender, settings = {}, now = Date.now()) {
    const enabled = ['1', 'true', 'yes', 'sim', 'on'].includes(String(settings.risk_guard_enabled ?? 'true').toLowerCase());
    if (!enabled) return { allowed: true, reason: '' };
    this.prune(now);
    const perMinute = Math.max(1, Math.min(120, Number(settings.max_replies_per_minute || 8)));
    const perHour = Math.max(perMinute, Math.min(5000, Number(settings.max_replies_per_hour || 80)));
    const perUser = Math.max(1, Math.min(60, Number(settings.max_replies_per_user_per_minute || 3)));
    const minuteAgo = now - 60 * 1000;
    const minuteCount = this.globalEvents.filter(value => value >= minuteAgo).length;
    if (minuteCount >= perMinute) return { allowed: false, reason: `limite global de ${perMinute} respostas por minuto` };
    if (this.globalEvents.length >= perHour) return { allowed: false, reason: `limite global de ${perHour} respostas por hora` };
    const senderKey = String(sender || 'unknown');
    const senderCount = (this.perSender.get(senderKey) || []).length;
    if (senderCount >= perUser) return { allowed: false, reason: `limite de ${perUser} respostas por minuto para a mesma pessoa` };
    return { allowed: true, reason: '' };
  }

  record(sender, now = Date.now()) {
    this.prune(now);
    this.globalEvents.push(now);
    const senderKey = String(sender || 'unknown');
    const values = this.perSender.get(senderKey) || [];
    values.push(now);
    this.perSender.set(senderKey, values);
  }

  reject() { this.blockedCount += 1; }

  stats() {
    this.prune();
    const minuteAgo = Date.now() - 60 * 1000;
    return {
      lastMinute: this.globalEvents.filter(value => value >= minuteAgo).length,
      lastHour: this.globalEvents.length,
      trackedSenders: this.perSender.size,
      blockedCount: this.blockedCount
    };
  }
}

module.exports = { OutboundGuard };
