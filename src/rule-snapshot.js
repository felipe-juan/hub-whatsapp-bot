const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { prepareMessage, compileTriggerRules, evaluateCompiledTrigger } = require('./trigger-rules');
const { TokenAhoCorasick } = require('./aho-corasick');
const { BitSet } = require('./bitset');
const { LruCache } = require('./lru-cache');
const { safeRegexEngineName } = require('./safe-regex');

const VERSION_MARKERS = new Set(['i','ii','iii','iv','v','1','2','3','4','5']);

const INDEX_STOPWORDS = new Set([
  'a','ao','aos','as','o','os','um','uma','uns','umas','de','da','das','do','dos','em','na','nas','no','nos',
  'e','ou','que','qual','quais','como','onde','quando','para','por','com','sem','me','meu','minha','seu','sua',
  'professor','professora','docente','tem','ter','pode','preciso','gostaria','saber'
]);

function scopeAllowed(scope, isGroup) {
  const value = ['both', 'group', 'private'].includes(scope) ? scope : 'both';
  return value === 'both' || (value === 'group' && isGroup) || (value === 'private' && !isGroup);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (value instanceof Map || value instanceof Set || value instanceof Uint32Array || value instanceof BitSet) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function usefulToken(token) {
  const value = String(token || '');
  return value.length >= 2 && !INDEX_STOPWORDS.has(value);
}

function sourceFromDatabase(database) {
  const messages = typeof database?.listAutomaticMessages === 'function'
    ? database.listAutomaticMessages({ activeOnly: true, cloneResult: false })
    : [];
  const synonymGroups = typeof database?.listSynonymGroups === 'function'
    ? database.listSynonymGroups({ activeOnly: true })
    : [];
  return { messages: structuredClone(messages), synonymGroups: structuredClone(synonymGroups) };
}

function sourceFingerprint(source) {
  return crypto.createHash('sha256').update(JSON.stringify(source || {})).digest('hex');
}

function collectIndexTokens(compiledTrigger) {
  const tokens = new Set();
  const phrases = [
    ...compiledTrigger.units.flatMap(unit => unit.terms),
    ...compiledTrigger.sentences,
    ...compiledTrigger.exactPhrases,
    ...compiledTrigger.required
  ];
  for (const phrase of phrases) for (const token of phrase.tokens || []) if (usefulToken(token)) tokens.add(token);
  return [...tokens];
}

function maximumTriggerScore(compiledTrigger, priority = 0) {
  let score = Number(priority || 0) / 10;
  score += compiledTrigger.required.length * 2;
  for (const unit of compiledTrigger.units) {
    const maxTokens = Math.max(1, ...unit.terms.map(term => term.tokens.length));
    score += 2 + maxTokens;
  }
  if (compiledTrigger.rules.match_mode === 'all' && compiledTrigger.units.length) score += 3;
  const sentenceScores = compiledTrigger.sentences
    .map(sentence => 12 + Math.min(18, sentence.tokens.length * 2))
    .sort((a, b) => b - a)
    .slice(0, 3);
  score += sentenceScores.reduce((sum, value) => sum + value, 0);
  if (compiledTrigger.exactPhrases.length) score += 20;
  if (compiledTrigger.regex) score += 12;
  return score;
}

function compileMessage(item, synonymGroups, numericId = 0) {
  const compiledTrigger = compileTriggerRules(item.trigger || {}, item.keywords || [], synonymGroups);
  const indexTokens = Object.freeze(collectIndexTokens(compiledTrigger));
  const responseText = String(item.response_text || '');
  return Object.freeze({
    numericId,
    item: deepFreeze(structuredClone(item)),
    compiledTrigger,
    indexTokens,
    maxScore: maximumTriggerScore(compiledTrigger, item.priority),
    responsePlan: Object.freeze({
      static: !/\{\{\s*(?:data|hora|nome_do_grupo|nome_da_pessoa)\s*\}\}/i.test(responseText),
      text: responseText
    }),
    fallback: indexTokens.length === 0 || Boolean(compiledTrigger.regex)
  });
}

function fuzzyBucket(token, length = String(token || '').length) {
  const value = String(token || '');
  return `${value[0] || '_'}:${length}`;
}

function ensureBitSet(index, key, size) {
  let value = index.get(key);
  if (!value) { value = new BitSet(size); index.set(key, value); }
  return value;
}

function addPhrasePattern(patterns, patternMap, phrase, payload) {
  if (!phrase?.tokens?.length || phrase.literalOnly) return;
  const key = phrase.tokens.join('\u0001');
  let record = patternMap.get(key);
  if (!record) {
    record = { tokens: phrase.tokens, payloads: [] };
    patternMap.set(key, record);
    patterns.push(record);
  }
  record.payloads.push(payload);
}

function buildSnapshotFromSource(source, { revision = '', origin = 'database' } = {}) {
  const startedAt = performance.now();
  const messages = Array.isArray(source?.messages) ? source.messages : [];
  const synonymGroups = Array.isArray(source?.synonymGroups) ? source.synonymGroups : [];
  const compiledMessages = Object.freeze(messages.map((item, index) => compileMessage(item, synonymGroups, index)));
  const size = compiledMessages.length;
  const tokenIndex = new Map();
  const fuzzyIndex = new Map();
  const fallbackBitSet = new BitSet(size);
  const exactMap = new Map();
  const phrasePatterns = [];
  const phrasePatternMap = new Map();

  compiledMessages.forEach((entry, index) => {
    if (entry.fallback) fallbackBitSet.set(index);
    const tolerance = Math.max(0, Math.min(2, Number(entry.compiledTrigger.rules.typo_tolerance || 0)));
    for (const token of entry.indexTokens) {
      ensureBitSet(tokenIndex, token, size).set(index);
      if (tolerance > 0) {
        for (let delta = -tolerance; delta <= tolerance; delta += 1) {
          const length = token.length + delta;
          if (length >= 2) ensureBitSet(fuzzyIndex, fuzzyBucket(token, length), size).set(index);
        }
      }
    }
    entry.compiledTrigger.sentences.forEach((phrase, phraseIndex) => addPhrasePattern(phrasePatterns, phrasePatternMap, phrase, { ruleIndex: index, kind: 'sentence', phraseIndex }));
    entry.compiledTrigger.exactPhrases.forEach((phrase, phraseIndex) => {
      addPhrasePattern(phrasePatterns, phrasePatternMap, phrase, { ruleIndex: index, kind: 'exact', phraseIndex });
      if (phrase.normalized) ensureBitSet(exactMap, phrase.normalized, size).set(index);
    });
    // A sentença cadastrada também pode ser uma correspondência exata completa.
    entry.compiledTrigger.sentences.forEach(phrase => {
      if (phrase.normalized) ensureBitSet(exactMap, phrase.normalized, size).set(index);
    });
  });

  const automaton = new TokenAhoCorasick(phrasePatterns.map(record => ({ tokens: record.tokens, payload: record.payloads })));
  const fingerprint = sourceFingerprint({ messages, synonymGroups });
  return Object.freeze({
    generation: Date.now(),
    createdAt: new Date().toISOString(),
    compileDurationMs: Number((performance.now() - startedAt).toFixed(3)),
    messageCount: compiledMessages.length,
    compiledMessages,
    synonymGroups: Object.freeze(synonymGroups.map(group => Object.freeze({ ...group }))),
    tokenIndex,
    fuzzyIndex,
    fallbackBitSet,
    exactMap,
    automaton,
    indexTokenCount: tokenIndex.size,
    fingerprint,
    revision: String(revision || ''),
    origin,
    regexEngine: safeRegexEngineName()
  });
}

function buildSnapshot(database) {
  return buildSnapshotFromSource(sourceFromDatabase(database), {
    revision: database?.ruleSourceRevision?.() || '',
    origin: 'database'
  });
}

async function loadRuleSnapshotFile(filePath) {
  if (!filePath) return null;
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 2 || !parsed.source || typeof parsed.revision !== 'string') return null;
    return parsed;
  } catch { return null; }
}

async function writeRuleSnapshotFile(filePath, snapshot, source) {
  if (!filePath || !snapshot || !source) return false;
  const directory = path.dirname(filePath);
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  const temp = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const payload = JSON.stringify({
    version: 2,
    revision: snapshot.revision,
    fingerprint: snapshot.fingerprint,
    createdAt: snapshot.createdAt,
    source
  });
  await fs.promises.writeFile(temp, payload, { mode: 0o600 });
  await fs.promises.rename(temp, filePath);
  return true;
}

function cacheKey(prepared, isGroup, generation) {
  return `${generation}|${isGroup ? 'g' : 'p'}|${prepared.endsWithQuestionMark ? 'q' : 'n'}|${prepared.normalized}|${prepared.raw.replace(/[\p{L}\p{N}\s]/gu, '')}`;
}

function freezeAnalysis(analysis, candidateStats) {
  Object.defineProperty(analysis, 'candidateStats', { value: Object.freeze(candidateStats), enumerable: true, configurable: false });
  return Object.freeze(analysis);
}

class AtomicRuleStore {
  constructor(database, { onReload = null, snapshotPath = '', initialSnapshot = null } = {}) {
    this.db = database;
    this.onReload = typeof onReload === 'function' ? onReload : null;
    this.snapshotPath = snapshotPath;
    this.reloadScheduled = false;
    this.reloadPromise = null;
    this.lastError = '';
    this.reloadCount = 0;
    this.candidateSamples = [];
    this.matchCache = new LruCache({ maxEntries: 1000, ttlMs: 10 * 60_000 });
    this.cacheEarlyExits = 0;
    const revision = database?.ruleSourceRevision?.() || '';
    if (initialSnapshot?.source && String(initialSnapshot.revision || '') === String(revision)) {
      this.current = buildSnapshotFromSource(initialSnapshot.source, { revision, origin: 'disk-snapshot' });
    } else {
      this.current = buildSnapshot(database);
    }
    this.persistCurrent().catch(() => {});
    this.unsubscribe = database?.onChange?.(event => {
      const keys = new Set(event?.keys || []);
      if (keys.has('activeMessages') || keys.has('synonyms')) this.scheduleReload(`database:${[...keys].join(',')}`);
    }) || (() => {});
  }

  get snapshot() { return this.current; }

  async persistCurrent() {
    if (!this.snapshotPath || this.db?.closed) return false;
    const source = sourceFromDatabase(this.db);
    if (sourceFingerprint(source) !== this.current.fingerprint) return false;
    return writeRuleSnapshotFile(this.snapshotPath, this.current, source);
  }

  scheduleReload(reason = 'change') {
    if (this.db?.closed) return Promise.resolve(this.current);
    if (this.reloadScheduled) return this.reloadPromise || Promise.resolve(this.current);
    this.reloadScheduled = true;
    this.reloadPromise = new Promise(resolve => {
      setImmediate(() => {
        this.reloadScheduled = false;
        resolve(this.reload(reason));
      });
    });
    return this.reloadPromise;
  }

  reload(reason = 'manual') {
    if (this.db?.closed) return this.current;
    try {
      const source = sourceFromDatabase(this.db);
      const next = buildSnapshotFromSource(source, { revision: this.db?.ruleSourceRevision?.() || '', origin: 'database' });
      this.current = next;
      this.matchCache.clear();
      this.reloadCount += 1;
      this.lastError = '';
      this.onReload?.({ reason, snapshot: next });
      writeRuleSnapshotFile(this.snapshotPath, next, source).catch(error => {
        this.lastError = `snapshot em disco: ${error.message}`;
      });
      return next;
    } catch (error) {
      this.lastError = String(error?.message || error);
      console.error(`Falha ao recompilar regras (${reason}); mantendo snapshot anterior:`, error);
      return this.current;
    } finally {
      this.reloadPromise = null;
    }
  }

  candidateSelection(prepared, snapshot = this.current) {
    const union = snapshot.fallbackBitSet.clone();
    let intersection = null;
    let informativeTokens = 0;
    for (const token of prepared.tokens || []) {
      const exact = snapshot.tokenIndex.get(token);
      const fuzzy = snapshot.fuzzyIndex.get(fuzzyBucket(token));
      if (!exact && !fuzzy) continue;
      const tokenBits = new BitSet(snapshot.messageCount);
      if (exact) tokenBits.or(exact);
      if (fuzzy) tokenBits.or(fuzzy);
      union.or(tokenBits);
      informativeTokens += 1;
      if (!intersection) intersection = tokenBits.clone();
      else intersection.and(tokenBits);
    }

    const hints = new Map();
    const phraseBits = new BitSet(snapshot.messageCount);
    for (const match of snapshot.automaton.search(prepared.tokens || [])) {
      const nextToken = prepared.tokens?.[match.end + 1];
      const lastPatternToken = prepared.tokens?.[match.end];
      // Uma frase que termina em uma sigla-base não pode ser considerada
      // correspondência de uma versão maior. Ex.: PW não casa com “PW II”.
      if (nextToken && VERSION_MARKERS.has(nextToken) && !VERSION_MARKERS.has(lastPatternToken)) continue;
      for (const payload of match.payload || []) {
        phraseBits.set(payload.ruleIndex);
        let hint = hints.get(payload.ruleIndex);
        if (!hint) { hint = { sentenceIndexes: new Set(), exactIndexes: new Set() }; hints.set(payload.ruleIndex, hint); }
        if (payload.kind === 'sentence') hint.sentenceIndexes.add(payload.phraseIndex);
        else hint.exactIndexes.add(payload.phraseIndex);
      }
    }
    union.or(phraseBits);
    const exactFull = snapshot.exactMap.get(prepared.normalized);
    if (exactFull) union.or(exactFull);
    if (union.isEmpty()) return { indexes: BitSet.full(snapshot.messageCount).toIndexes(), preferred: [], hints, exactFull, informativeTokens, intersectionCount: 0 };
    const preferred = intersection && !intersection.isEmpty() ? intersection.toIndexes() : [];
    const all = union.toIndexes();
    const preferredSet = new Set(preferred);
    return {
      indexes: [...preferred, ...all.filter(index => !preferredSet.has(index))],
      preferred,
      hints,
      exactFull,
      informativeTokens,
      intersectionCount: preferred.length
    };
  }

  evaluateOne(prepared, entry, isGroup, hint = null) {
    const item = entry.item;
    const evaluated = evaluateCompiledTrigger(prepared, entry.compiledTrigger, hint || undefined);
    const scopeOk = scopeAllowed(item.scope, Boolean(isGroup));
    return Object.freeze({
      kind: 'message', item,
      responsePlan: entry.responsePlan,
      score: evaluated.score + Number(item.priority || 0) / 10,
      matched: Boolean(evaluated.matched && scopeOk),
      reasons: Object.freeze(evaluated.reasons),
      blockedReasons: Object.freeze(scopeOk
        ? evaluated.blockedReasons
        : [...evaluated.blockedReasons, `escopo “${item.scope === 'group' ? 'somente grupos' : 'somente privado'}” não permite esta conversa`]),
      rules: evaluated.rules,
      keywordMatched: evaluated.keywordMatched,
      keywordTotal: evaluated.keywordTotal,
      scopeAllowed: scopeOk
    });
  }

  evaluate(message, { isGroup = true, ambiguityThreshold = 1 } = {}) {
    const snapshot = this.current;
    const prepared = prepareMessage(message);
    const key = cacheKey(prepared, Boolean(isGroup), snapshot.generation);
    const cached = this.matchCache.get(key);
    if (cached) return cached;

    const selection = this.candidateSelection(prepared, snapshot);
    const indexes = selection.indexes;
    this.candidateSamples.push(indexes.length);
    if (this.candidateSamples.length > 500) this.candidateSamples.splice(0, this.candidateSamples.length - 500);

    const analysis = [];
    const evaluatedIndexes = new Set();
    let earlyExit = false;
    const exactIndexes = selection.exactFull?.toIndexes?.() || [];
    if (exactIndexes.length) {
      const exactResults = exactIndexes.map(index => {
        evaluatedIndexes.add(index);
        const result = this.evaluateOne(prepared, snapshot.compiledMessages[index], isGroup, selection.hints.get(index));
        analysis.push(result);
        return { index, result };
      }).filter(entry => entry.result.matched).sort((a, b) => b.result.score - a.result.score);
      if (exactResults.length === 1) {
        const winner = exactResults[0];
        let otherUpperBound = -Infinity;
        for (const index of indexes) if (!evaluatedIndexes.has(index)) otherUpperBound = Math.max(otherUpperBound, snapshot.compiledMessages[index].maxScore);
        if (winner.result.score > otherUpperBound + Math.max(0, Number(ambiguityThreshold || 0))) {
          earlyExit = true;
          this.cacheEarlyExits += 1;
        }
      }
    }

    if (!earlyExit) {
      for (const index of indexes) {
        if (evaluatedIndexes.has(index)) continue;
        analysis.push(this.evaluateOne(prepared, snapshot.compiledMessages[index], isGroup, selection.hints.get(index)));
      }
    }

    const result = freezeAnalysis(analysis, {
      candidates: indexes.length,
      total: snapshot.messageCount,
      skipped: Math.max(0, snapshot.messageCount - indexes.length),
      preferredByIntersection: selection.intersectionCount,
      ahoMatches: [...selection.hints.values()].reduce((sum, hint) => sum + hint.sentenceIndexes.size + hint.exactIndexes.size, 0),
      earlyExit,
      cacheHit: false
    });
    this.matchCache.set(key, result);
    return result;
  }

  stats() {
    const samples = this.candidateSamples;
    const sorted = [...samples].sort((a, b) => a - b);
    const at = ratio => sorted.length ? sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1))] : 0;
    return {
      generation: this.current.generation,
      createdAt: this.current.createdAt,
      messageCount: this.current.messageCount,
      compileDurationMs: this.current.compileDurationMs,
      reloadCount: this.reloadCount,
      lastError: this.lastError,
      indexTokenCount: this.current.indexTokenCount,
      origin: this.current.origin,
      regexEngine: this.current.regexEngine,
      ahoCorasick: this.current.automaton.stats(),
      bitsetWords: Math.ceil(this.current.messageCount / 32),
      cache: this.matchCache.stats(),
      earlyExits: this.cacheEarlyExits,
      candidateSelection: { samples: samples.length, p50: at(0.5), p95: at(0.95), p99: at(0.99) }
    };
  }

  close() { this.unsubscribe?.(); this.matchCache.clear(); }
}

module.exports = {
  AtomicRuleStore,
  buildSnapshot,
  buildSnapshotFromSource,
  compileMessage,
  scopeAllowed,
  loadRuleSnapshotFile,
  writeRuleSnapshotFile,
  sourceFromDatabase,
  sourceFingerprint,
  maximumTriggerScore
};
