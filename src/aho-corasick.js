class TokenAhoCorasick {
  constructor(patterns = []) {
    this.nodes = [{ next: new Map(), fail: 0, outputs: [] }];
    this.patternCount = 0;
    for (const pattern of patterns) this.add(pattern.tokens || [], pattern.payload);
    this.buildFailures();
  }

  add(tokens, payload) {
    if (!Array.isArray(tokens) || !tokens.length) return;
    let state = 0;
    for (const rawToken of tokens) {
      const token = String(rawToken || '');
      if (!token) return;
      let next = this.nodes[state].next.get(token);
      if (next === undefined) {
        next = this.nodes.length;
        this.nodes[state].next.set(token, next);
        this.nodes.push({ next: new Map(), fail: 0, outputs: [] });
      }
      state = next;
    }
    this.nodes[state].outputs.push({ payload, length: tokens.length });
    this.patternCount += 1;
  }

  buildFailures() {
    const queue = [];
    for (const next of this.nodes[0].next.values()) {
      this.nodes[next].fail = 0;
      queue.push(next);
    }
    while (queue.length) {
      const state = queue.shift();
      for (const [token, next] of this.nodes[state].next) {
        queue.push(next);
        let fallback = this.nodes[state].fail;
        while (fallback && !this.nodes[fallback].next.has(token)) fallback = this.nodes[fallback].fail;
        const target = this.nodes[fallback].next.get(token);
        this.nodes[next].fail = target === undefined || target === next ? 0 : target;
        const inherited = this.nodes[this.nodes[next].fail].outputs;
        if (inherited.length) this.nodes[next].outputs.push(...inherited);
      }
    }
  }

  search(tokens = []) {
    const matches = [];
    let state = 0;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = String(tokens[index] || '');
      while (state && !this.nodes[state].next.has(token)) state = this.nodes[state].fail;
      const next = this.nodes[state].next.get(token);
      state = next === undefined ? 0 : next;
      for (const output of this.nodes[state].outputs) {
        matches.push({ payload: output.payload, start: index - output.length + 1, end: index, length: output.length });
      }
    }
    return matches;
  }

  stats() { return { nodes: this.nodes.length, patterns: this.patternCount }; }
}

module.exports = { TokenAhoCorasick };
