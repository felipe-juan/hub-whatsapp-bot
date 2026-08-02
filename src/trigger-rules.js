const { normalizeText, containsPhrase, tokenize, parseList } = require('./text');
const { compileSafeRegex, assertSafeSyntax } = require('./safe-regex');
const { semanticQuestionAssessment, intentsCompatible } = require('./semantic-question');

// Conectivos curtos que podem aparecer naturalmente entre os termos de uma
// sentença cadastrada sem alterar sua intenção. Ex.: “como passar cálculo”
// também reconhece “como passar em cálculo”.
const OPTIONAL_CONNECTORS = new Set(['a','ao','aos','as','da','das','de','do','dos','em','na','nas','no','nos','para','pra','pro','por']);
const VERSION_MARKERS = new Set(['i','ii','iii','iv','v','1','2','3','4','5']);

const DEFAULT_TRIGGER_RULES = Object.freeze({
  match_mode: 'any',
  sentences: [],
  required_words: [],
  excluded_words: [],
  exact_phrases: [],
  require_question_mark: false,
  regex_pattern: '',
  regex_flags: 'i',
  typo_tolerance: 0,
  synonym_group_ids: [],
  negative_examples: []
});

function uniqueList(value) {
  return [...new Set(parseList(value).map(item => String(item).trim()).filter(Boolean))];
}

function normalizeTriggerRules(input = {}, fallbackKeywords = []) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    match_mode: source.match_mode === 'any' ? 'any' : 'all',
    sentences: uniqueList(source.sentences),
    required_words: uniqueList(source.required_words),
    excluded_words: uniqueList(source.excluded_words),
    exact_phrases: uniqueList(source.exact_phrases),
    require_question_mark: Boolean(source.require_question_mark),
    regex_pattern: String(source.regex_pattern || '').trim(),
    regex_flags: String(source.regex_flags || 'i').replace(/[^imu]/g, '') || 'i',
    typo_tolerance: Math.max(0, Math.min(2, Number(source.typo_tolerance || 0))),
    synonym_group_ids: [...new Set((Array.isArray(source.synonym_group_ids) ? source.synonym_group_ids : parseList(source.synonym_group_ids))
      .map(Number).filter(Number.isInteger))],
    negative_examples: uniqueList(source.negative_examples),
    keywords: uniqueList(source.keywords?.length ? source.keywords : fallbackKeywords)
  };
}

function validateRegex(pattern, flags = 'i') {
  const checked = assertSafeSyntax(pattern, flags);
  return checked.pattern ? compileSafeRegex(checked.pattern, checked.flags) : null;
}

function levenshteinWithin(a, b, limit) {
  if (a === b) return true;
  if (!limit || Math.abs(a.length - b.length) > limit) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      current.push(value); rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return false;
    previous = current;
  }
  return previous[b.length] <= limit;
}

function versionedAcronym(token) {
  const value = String(token || '');
  const match = value.match(/^([a-z]{2,5}?)(iii|ii|iv|v|i|[1-5])$/);
  return match ? { base: match[1], version: match[2] } : null;
}

function tokenMatches(actual, expected, tolerance = 0) {
  if (actual === expected) return { matched: true, fuzzy: false };
  const actualVersion = versionedAcronym(actual);
  const expectedVersion = versionedAcronym(expected);
  // Siglas versionadas não aceitam aproximação entre versões distintas.
  // Ex.: TCCI ≠ TCCII, LPI ≠ LPII e PWI ≠ PWII.
  if (actualVersion && expectedVersion && actualVersion.base === expectedVersion.base && actualVersion.version !== expectedVersion.version) {
    return { matched: false, fuzzy: false };
  }
  if (!tolerance || actual.length < 4 || expected.length < 4) return { matched: false, fuzzy: false };
  return { matched: levenshteinWithin(actual, expected, tolerance), fuzzy: true };
}

function orderedSentenceMatch(messageTokens, phraseTokens, tolerance = 0) {
  if (phraseTokens.length < 2 || messageTokens.length < phraseTokens.length) return null;
  for (let start = 0; start < messageTokens.length; start += 1) {
    const first = tokenMatches(messageTokens[start], phraseTokens[0], tolerance);
    if (!first.matched) continue;
    let actualIndex = start + 1;
    let expectedIndex = 1;
    let fuzzy = first.fuzzy;
    let skippedConnectors = 0;
    while (actualIndex < messageTokens.length && expectedIndex < phraseTokens.length) {
      const current = tokenMatches(messageTokens[actualIndex], phraseTokens[expectedIndex], tolerance);
      if (current.matched) {
        fuzzy = fuzzy || current.fuzzy;
        actualIndex += 1;
        expectedIndex += 1;
        continue;
      }
      if (OPTIONAL_CONNECTORS.has(messageTokens[actualIndex]) && skippedConnectors < 3) {
        skippedConnectors += 1;
        actualIndex += 1;
        continue;
      }
      break;
    }
    if (expectedIndex === phraseTokens.length) {
      const lastExpected = phraseTokens.at(-1);
      const nextToken = messageTokens[actualIndex];
      if (nextToken && VERSION_MARKERS.has(nextToken) && !VERSION_MARKERS.has(lastExpected)) continue;
      return { matched: true, fuzzy, flexible: skippedConnectors > 0 };
    }
  }
  return null;
}

function contiguousPhraseMatch(messageTokens, phraseTokens) {
  if (!phraseTokens.length || messageTokens.length < phraseTokens.length) return false;
  for (let start = 0; start <= messageTokens.length - phraseTokens.length; start += 1) {
    let equal = true;
    for (let offset = 0; offset < phraseTokens.length; offset += 1) {
      if (messageTokens[start + offset] !== phraseTokens[offset]) { equal = false; break; }
    }
    if (!equal) continue;
    const lastExpected = phraseTokens.at(-1);
    const nextToken = messageTokens[start + phraseTokens.length];
    // Um nome sem versão não deve capturar sua continuação versionada.
    // Ex.: PW não captura PW I/PW II; Programação Web não captura
    // Programação Web II. A forma específica continua correspondendo.
    if (nextToken && VERSION_MARKERS.has(nextToken) && !VERSION_MARKERS.has(lastExpected)) continue;
    return true;
  }
  return false;
}

function phraseMatch(message, phrase, tolerance = 0) {
  const rawMessage = String(message || '');
  const rawPhrase = String(phrase || '').trim();
  const normalizedPhrase = normalizeText(rawPhrase);
  // Símbolos isolados, como “?”, não sobrevivem à normalização textual.
  // Nesses casos, o gatilho é verificado literalmente na mensagem original.
  if (rawPhrase && !normalizedPhrase) {
    return { matched: rawMessage.includes(rawPhrase), fuzzy: false, flexible: false };
  }
  const messageTokens = tokenize(message);
  const phraseTokens = tokenize(phrase);
  if (contiguousPhraseMatch(messageTokens, phraseTokens)) return { matched: true, fuzzy: false, flexible: false };
  const flexible = orderedSentenceMatch(messageTokens, phraseTokens, tolerance);
  if (flexible) return flexible;
  if (!tolerance || !phraseTokens.length || messageTokens.length < phraseTokens.length) return { matched: false, fuzzy: false, flexible: false };
  for (let start = 0; start <= messageTokens.length - phraseTokens.length; start += 1) {
    let okay = true;
    for (let offset = 0; offset < phraseTokens.length; offset += 1) {
      const compared = tokenMatches(messageTokens[start + offset], phraseTokens[offset], tolerance);
      if (!compared.matched) { okay = false; break; }
    }
    if (okay) {
      const lastExpected = phraseTokens.at(-1);
      const nextToken = messageTokens[start + phraseTokens.length];
      if (nextToken && VERSION_MARKERS.has(nextToken) && !VERSION_MARKERS.has(lastExpected)) continue;
      return { matched: true, fuzzy: true, flexible: false };
    }
  }
  return { matched: false, fuzzy: false, flexible: false };
}


const DIRECT_IGNORED_TOKENS = new Set([...OPTIONAL_CONNECTORS, 'o', 'os', 'um', 'uma', 'uns', 'umas']);

function canonicalDirectTokens(tokens = []) {
  return (tokens || []).filter(token => !DIRECT_IGNORED_TOKENS.has(token));
}

function directPhraseTokenVariants(value) {
  const rawTokens = Array.isArray(value?.tokens) ? [...value.tokens] : tokenize(value?.raw || value || '');
  const variants = [rawTokens];
  let core = [...rawTokens];
  if (core[0] === 'qual' || core[0] === 'quais') core = core.slice(1);
  else if (core[0] === 'onde' || core[0] === 'como' || core[0] === 'quem' || core[0] === 'quando') core = core.slice(1);
  else if (core[0] === 'quanto' || core[0] === 'quantos' || core[0] === 'quanta' || core[0] === 'quantas') core = core.slice(1);
  else if (core[0] === 'o' && core[1] === 'que' && core[2] === 'e') core = core.slice(3);
  while (['e', 'esta', 'fica', 'sao'].includes(core[0])) core = core.slice(1);
  if (core.length && core.length !== rawTokens.length) variants.push(core);
  return variants.map(canonicalDirectTokens).filter(tokens => tokens.length);
}

function exactConfiguredPhrase(normalizedMessage, sentences = [], exactPhrases = []) {
  if (!normalizedMessage) return null;
  const messageTokens = canonicalDirectTokens(tokenize(normalizedMessage));
  for (const [kind, values] of [['sentence', sentences], ['exact', exactPhrases]]) {
    for (const value of values) {
      const raw = typeof value === 'string' ? value : value?.raw;
      const variants = directPhraseTokenVariants(value);
      for (const tokens of variants) {
        const fullExact = normalizeText(raw) === normalizedMessage;
        const coreExact = tokens.length >= 2 && tokens.length === messageTokens.length && tokens.every((token, index) => token === messageTokens[index]);
        if (fullExact || coreExact) return { kind, raw, tokens, derived: !fullExact };
      }
    }
  }
  return null;
}

function endsWithQuestionMark(value) { return /\?\s*$/u.test(String(value || '')); }

function applyDirectExactMatch(result, directMatch) {
  if (!directMatch) return false;
  const specificity = Math.min(18, Math.max(1, directMatch.tokens?.length || 1) * 2);
  result.score += 20 + specificity;
  result.reasons.push(`${directMatch.derived ? 'forma direta da sentença' : 'mensagem direta completa'} sem interrogação: ${directMatch.raw}`);
  result.matched = true;
  return true;
}

function directKeywordCoverage(messageTokens, matchedTerms = [], requiredTerms = []) {
  const meaningful = (messageTokens || []).filter(token => !OPTIONAL_CONNECTORS.has(token));
  // Uma palavra-chave isolada é excessivamente genérica para a exceção sem “?”.
  // Frases de uma palavra só continuam possíveis quando cadastradas explicitamente
  // no campo de sentenças/frases exatas.
  if (meaningful.length < 2) return false;
  const allowed = new Set();
  for (const term of [...matchedTerms, ...requiredTerms]) {
    const tokens = term?.tokens || tokenize(term?.raw || term || '');
    for (const token of tokens) if (!OPTIONAL_CONNECTORS.has(token)) allowed.add(token);
  }
  return meaningful.length > 0 && meaningful.every(token => allowed.has(token));
}

function applyDirectKeywordMatch(result, unitResults, requiredTerms, matchMode, messageTokens) {
  const matched = unitResults.filter(item => item.matched);
  const channelOk = unitResults.length > 0 && (matchMode === 'all' ? matched.length === unitResults.length : matched.length > 0);
  if (!channelOk || !directKeywordCoverage(messageTokens, matched.map(item => item.term), requiredTerms)) return false;
  result.keywordMatched = matched.length;
  result.keywordTotal = unitResults.length;
  result.score += 18 + matched.reduce((sum, item) => sum + Math.max(1, tokenize(item.term?.raw || item.term || '').length), 0);
  result.reasons.push(`mensagem direta completa formada apenas pelos gatilhos: ${matched.map(item => item.term?.raw || item.term).join(', ')}`);
  result.matched = true;
  return true;
}

function phraseCoreMatchPrepared(preparedMessage, phrase, tolerance = 0) {
  const prepared = preparedMessage && preparedMessage.tokens ? preparedMessage : prepareMessage(preparedMessage);
  const compiledPhrase = phrase && phrase.tokens ? phrase : compilePhrase(phrase);
  const variants = directPhraseTokenVariants(compiledPhrase);
  for (const tokens of variants) {
    if (tokens.length < 2) continue;
    const candidate = { raw: compiledPhrase.raw, normalized: tokens.join(' '), tokens, literalOnly: false };
    if (contiguousPhraseMatch(prepared.tokens, tokens)) return { matched: true, fuzzy: false, flexible: false, derived: true };
    const flexible = orderedSentenceMatch(prepared.tokens, tokens, tolerance);
    if (flexible) return { ...flexible, derived: true };
    if (tolerance) {
      const checked = phraseMatchPrepared(prepared, candidate, tolerance);
      if (checked.matched) return { ...checked, derived: true };
    }
  }
  return { matched: false, fuzzy: false, flexible: false, derived: false };
}

function synonymUnits(rules, synonymGroups = []) {
  const byId = new Map(synonymGroups.filter(group => group.active !== false).map(group => [Number(group.id), group]));
  return rules.synonym_group_ids.map(id => byId.get(Number(id))).filter(Boolean).map(group => ({
    label: `sinônimos “${group.name}”`,
    terms: uniqueList(group.terms)
  }));
}

function evaluateUnit(message, unit, tolerance) {
  for (const term of unit.terms) {
    const result = phraseMatch(message, term, tolerance);
    if (result.matched) return { matched: true, fuzzy: result.fuzzy, term, label: unit.label };
  }
  return { matched: false, fuzzy: false, term: '', label: unit.label };
}

function evaluateTrigger(message, { title = '', keywords = [], trigger = {} } = {}, synonymGroups = []) {
  const rawMessage = String(message || '').slice(0, 2000);
  const normalizedMessage = normalizeText(rawMessage);
  const rules = normalizeTriggerRules(trigger, keywords);
  const result = { matched: false, score: 0, reasons: [], blockedReasons: [], rules, keywordMatched: 0, keywordTotal: 0 };

  if (!rawMessage.trim()) { result.blockedReasons.push('mensagem vazia'); return result; }
  const directOnly = !endsWithQuestionMark(rawMessage);
  for (const phrase of rules.excluded_words) {
    if (containsPhrase(rawMessage, phrase)) { result.blockedReasons.push(`termo excluído: ${phrase}`); return result; }
  }
  for (const example of rules.negative_examples) {
    if (normalizeText(example) === normalizedMessage) { result.blockedReasons.push(`exemplo negativo salvo: ${example}`); return result; }
  }
  for (const required of rules.required_words) {
    const match = phraseMatch(rawMessage, required, rules.typo_tolerance);
    if (!match.matched) { result.blockedReasons.push(`termo obrigatório ausente: ${required}`); return result; }
    result.score += match.fuzzy ? 1 : 2;
    result.reasons.push(`${match.fuzzy ? 'termo obrigatório aproximado' : 'termo obrigatório'}: ${required}`);
  }

  const units = rules.keywords.map(keyword => ({ label: `palavra-chave “${keyword}”`, terms: [keyword] }))
    .concat(synonymUnits(rules, synonymGroups));
  if (directOnly) {
    const directMatch = exactConfiguredPhrase(normalizedMessage, rules.sentences, rules.exact_phrases);
    if (applyDirectExactMatch(result, directMatch)) return result;
    const directUnits = units.map(unit => evaluateUnit(rawMessage, unit, 0));
    const requiredTerms = rules.required_words.map(raw => ({ raw, tokens: tokenize(raw) }));
    if (applyDirectKeywordMatch(result, directUnits, requiredTerms, rules.match_mode, tokenize(rawMessage))) return result;
    result.blockedReasons.push('sem “?” no final: a mensagem precisa ser exatamente uma frase direta cadastrada');
    return result;
  }

  const unitResults = units.map(unit => evaluateUnit(rawMessage, unit, rules.typo_tolerance));
  const matchedUnits = unitResults.filter(item => item.matched);
  result.keywordMatched = matchedUnits.length;
  result.keywordTotal = units.length;
  let keywordChannel = false;
  if (units.length) keywordChannel = rules.match_mode === 'all' ? matchedUnits.length === units.length : matchedUnits.length > 0;
  if (keywordChannel) {
    for (const item of matchedUnits) {
      const tokenPoints = Math.max(1, tokenize(item.term).length);
      result.score += item.fuzzy ? 1 + tokenPoints : 2 + tokenPoints;
      result.reasons.push(`${item.fuzzy ? 'aproximação controlada' : item.label}: ${item.term}`);
    }
    if (rules.match_mode === 'all') result.score += 3;
  }

  const preparedForSentences = prepareMessage(rawMessage);
  const sentenceMatches = rules.sentences.map(sentence => {
    const primary = phraseMatch(rawMessage, sentence, rules.typo_tolerance);
    if (primary.matched) return { sentence, ...primary, derived: false };
    const core = phraseCoreMatchPrepared(preparedForSentences, compilePhrase(sentence), rules.typo_tolerance);
    if (core.matched && core.derived && !intentsCompatible(sentence, rawMessage)) return { sentence, matched: false, fuzzy: false, flexible: false, derived: true };
    return { sentence, ...core };
  }).filter(item => item.matched);
  const sentenceChannel = sentenceMatches.length > 0;
  if (sentenceChannel) {
    for (const item of sentenceMatches.slice(0, 3)) {
      // Sentenças mais específicas recebem um pequeno bônus. Isso evita que
      // “Programação Web” empate com “Programação Web II” quando a pergunta
      // contém a disciplina completa, sem impedir a desambiguação de duas
      // turmas realmente idênticas.
      const specificity = Math.min(18, tokenize(item.sentence).length * 2);
      result.score += (item.fuzzy ? 7 : 12) + specificity;
      result.reasons.push(`${item.derived ? 'forma direta da sentença' : item.fuzzy ? 'sentença aproximada' : item.flexible ? 'sentença com conectivo opcional' : 'sentença ou trecho'}: ${item.sentence}`);
    }
  }

  const exact = rules.exact_phrases.find(phrase => normalizeText(phrase) === normalizedMessage);
  if (exact) { result.score += 20; result.reasons.push(`frase exata legada: ${exact}`); }

  let regexMatched = false;
  if (rules.regex_pattern) {
    const regex = validateRegex(rules.regex_pattern, rules.regex_flags);
    regexMatched = regex.test(rawMessage);
    if (regexMatched) { result.score += 12; result.reasons.push(`expressão regular: /${rules.regex_pattern}/${rules.regex_flags}`); }
  }

  // O nome interno nunca participa do gatilho. Somente os campos editáveis de
  // sentenças, palavras-chave, sinônimos, frases legadas ou regex podem ativar.
  const hasPositiveConfiguration = units.length > 0 || rules.sentences.length > 0 || rules.exact_phrases.length > 0 || Boolean(rules.regex_pattern);
  result.matched = hasPositiveConfiguration && (keywordChannel || sentenceChannel || Boolean(exact) || regexMatched);
  if (result.matched && rules.require_question_mark) {
    const fullConfigured = Boolean(exact) || rules.sentences.some(sentence => normalizeText(sentence) === normalizedMessage);
    const evidence = [
      ...matchedUnits.map(item => item.term),
      ...sentenceMatches.map(item => item.sentence),
      ...(exact ? [exact] : [])
    ];
    const semantic = semanticQuestionAssessment(rawMessage, evidence, { exactConfigured: fullConfigured });
    if (!semantic.allowed) {
      result.matched = false;
      result.blockedReasons.push(`proteção semântica: ${semantic.reason}`);
    } else if (semantic.coverage >= 0.5) result.score += 2;
  }
  if (!result.matched && units.length && rules.match_mode === 'all') {
    const missing = unitResults.filter(item => !item.matched).map(item => item.label);
    result.blockedReasons.push(`modo “todas”: faltaram ${missing.join(', ')}`);
  }
  return result;
}


function compilePhrase(value) {
  const raw = String(value || '').trim();
  const normalized = normalizeText(raw);
  return Object.freeze({
    raw,
    normalized,
    tokens: Object.freeze(tokenize(raw)),
    literalOnly: Boolean(raw && !normalized)
  });
}

function prepareMessage(message) {
  const raw = String(message || '').slice(0, 2000);
  return Object.freeze({
    raw,
    normalized: normalizeText(raw),
    tokens: Object.freeze(tokenize(raw)),
    hasQuestionMark: raw.includes('?'),
    endsWithQuestionMark: endsWithQuestionMark(raw)
  });
}

function phraseMatchPrepared(preparedMessage, compiledPhrase, tolerance = 0) {
  const prepared = preparedMessage && preparedMessage.tokens ? preparedMessage : prepareMessage(preparedMessage);
  const phrase = compiledPhrase && compiledPhrase.tokens ? compiledPhrase : compilePhrase(compiledPhrase);
  if (phrase.literalOnly) {
    return { matched: prepared.raw.includes(phrase.raw), fuzzy: false, flexible: false };
  }
  if (contiguousPhraseMatch(prepared.tokens, phrase.tokens)) return { matched: true, fuzzy: false, flexible: false };
  const flexible = orderedSentenceMatch(prepared.tokens, phrase.tokens, tolerance);
  if (flexible) return flexible;
  if (!tolerance || !phrase.tokens.length || prepared.tokens.length < phrase.tokens.length) {
    return { matched: false, fuzzy: false, flexible: false };
  }
  for (let start = 0; start <= prepared.tokens.length - phrase.tokens.length; start += 1) {
    let okay = true;
    for (let offset = 0; offset < phrase.tokens.length; offset += 1) {
      const compared = tokenMatches(prepared.tokens[start + offset], phrase.tokens[offset], tolerance);
      if (!compared.matched) { okay = false; break; }
    }
    if (!okay) continue;
    const lastExpected = phrase.tokens.at(-1);
    const nextToken = prepared.tokens[start + phrase.tokens.length];
    if (nextToken && VERSION_MARKERS.has(nextToken) && !VERSION_MARKERS.has(lastExpected)) continue;
    return { matched: true, fuzzy: true, flexible: false };
  }
  return { matched: false, fuzzy: false, flexible: false };
}

function compileTriggerRules(input = {}, fallbackKeywords = [], synonymGroups = []) {
  const rules = normalizeTriggerRules(input, fallbackKeywords);
  const byId = new Map((synonymGroups || []).filter(group => group.active !== false).map(group => [Number(group.id), group]));
  const keywordUnits = rules.keywords.map(keyword => ({
    label: `palavra-chave “${keyword}”`,
    terms: Object.freeze([compilePhrase(keyword)])
  }));
  const synonymCompiled = rules.synonym_group_ids.map(id => byId.get(Number(id))).filter(Boolean).map(group => ({
    label: `sinônimos “${group.name}”`,
    terms: Object.freeze(uniqueList(group.terms).map(compilePhrase))
  }));
  const frozenRules = Object.freeze(Object.fromEntries(Object.entries(rules).map(([key, value]) => [key, Array.isArray(value) ? Object.freeze([...value]) : value])));
  return Object.freeze({
    rules: frozenRules,
    required: Object.freeze(rules.required_words.map(compilePhrase)),
    excluded: Object.freeze(rules.excluded_words.map(compilePhrase)),
    negativeExamples: Object.freeze(rules.negative_examples.map(value => Object.freeze({ raw: value, normalized: normalizeText(value) }))),
    sentences: Object.freeze(rules.sentences.map(compilePhrase)),
    exactPhrases: Object.freeze(rules.exact_phrases.map(compilePhrase)),
    units: Object.freeze([...keywordUnits, ...synonymCompiled].map(unit => Object.freeze(unit))),
    regex: rules.regex_pattern ? validateRegex(rules.regex_pattern, rules.regex_flags) : null,
    hasPositiveConfiguration: keywordUnits.length + synonymCompiled.length > 0 || rules.sentences.length > 0 || rules.exact_phrases.length > 0 || Boolean(rules.regex_pattern)
  });
}

function evaluateCompiledUnit(preparedMessage, unit, tolerance) {
  for (const term of unit.terms) {
    const result = phraseMatchPrepared(preparedMessage, term, tolerance);
    if (result.matched) return { matched: true, fuzzy: result.fuzzy, term: term.raw, label: unit.label };
  }
  return { matched: false, fuzzy: false, term: '', label: unit.label };
}

function evaluateCompiledTrigger(message, compiledTrigger, hints = null) {
  const prepared = message && message.tokens ? message : prepareMessage(message);
  const compiled = compiledTrigger && compiledTrigger.rules ? compiledTrigger : compileTriggerRules(compiledTrigger || {});
  const rules = compiled.rules;
  const result = { matched: false, score: 0, reasons: [], blockedReasons: [], rules, keywordMatched: 0, keywordTotal: 0 };

  if (!prepared.raw.trim()) { result.blockedReasons.push('mensagem vazia'); return result; }
  const directOnly = !prepared.endsWithQuestionMark;
  for (const phrase of compiled.excluded) {
    if (phraseMatchPrepared(prepared, phrase, 0).matched) { result.blockedReasons.push(`termo excluído: ${phrase.raw}`); return result; }
  }
  for (const example of compiled.negativeExamples) {
    if (example.normalized === prepared.normalized) { result.blockedReasons.push(`exemplo negativo salvo: ${example.raw}`); return result; }
  }
  for (const required of compiled.required) {
    const match = phraseMatchPrepared(prepared, required, rules.typo_tolerance);
    if (!match.matched) { result.blockedReasons.push(`termo obrigatório ausente: ${required.raw}`); return result; }
    result.score += match.fuzzy ? 1 : 2;
    result.reasons.push(`${match.fuzzy ? 'termo obrigatório aproximado' : 'termo obrigatório'}: ${required.raw}`);
  }

  if (directOnly) {
    const directMatch = exactConfiguredPhrase(prepared.normalized, compiled.sentences, compiled.exactPhrases);
    if (applyDirectExactMatch(result, directMatch)) return result;
    const directUnits = compiled.units.map(unit => evaluateCompiledUnit(prepared, unit, 0));
    if (applyDirectKeywordMatch(result, directUnits, compiled.required, rules.match_mode, prepared.tokens)) return result;
    result.blockedReasons.push('sem “?” no final: a mensagem precisa ser exatamente uma frase direta cadastrada');
    return result;
  }

  const unitResults = compiled.units.map(unit => evaluateCompiledUnit(prepared, unit, rules.typo_tolerance));
  const matchedUnits = unitResults.filter(item => item.matched);
  result.keywordMatched = matchedUnits.length;
  result.keywordTotal = compiled.units.length;
  let keywordChannel = false;
  if (compiled.units.length) keywordChannel = rules.match_mode === 'all' ? matchedUnits.length === compiled.units.length : matchedUnits.length > 0;
  if (keywordChannel) {
    for (const item of matchedUnits) {
      const tokenPoints = Math.max(1, tokenize(item.term).length);
      result.score += item.fuzzy ? 1 + tokenPoints : 2 + tokenPoints;
      result.reasons.push(`${item.fuzzy ? 'aproximação controlada' : item.label}: ${item.term}`);
    }
    if (rules.match_mode === 'all') result.score += 3;
  }

  const hintedSentenceIndexes = hints?.sentenceIndexes instanceof Set ? hints.sentenceIndexes : new Set();
  const sentenceMatches = [];
  for (let index = 0; index < compiled.sentences.length; index += 1) {
    const sentence = compiled.sentences[index];
    if (hintedSentenceIndexes.has(index)) {
      sentenceMatches.push({ sentence, matched: true, fuzzy: false, flexible: false });
      if (sentenceMatches.length >= 3) break;
      continue;
    }
    // O autômato cobre correspondências contíguas. A avaliação completa ainda
    // é executada para conectivos opcionais e tolerância a digitação.
    const checked = phraseMatchPrepared(prepared, sentence, rules.typo_tolerance);
    if (checked.matched) sentenceMatches.push({ sentence, ...checked, derived: false });
    else {
      const coreChecked = phraseCoreMatchPrepared(prepared, sentence, rules.typo_tolerance);
      if (coreChecked.matched && (!coreChecked.derived || intentsCompatible(sentence.raw, prepared.raw))) sentenceMatches.push({ sentence, ...coreChecked });
    }
    if (sentenceMatches.length >= 3) break;
  }
  const sentenceChannel = sentenceMatches.length > 0;
  if (sentenceChannel) {
    for (const item of sentenceMatches.slice(0, 3)) {
      const specificity = Math.min(18, item.sentence.tokens.length * 2);
      result.score += (item.fuzzy ? 7 : 12) + specificity;
      result.reasons.push(`${item.derived ? 'forma direta da sentença' : item.fuzzy ? 'sentença aproximada' : item.flexible ? 'sentença com conectivo opcional' : 'sentença ou trecho'}: ${item.sentence.raw}`);
    }
  }

  const exact = compiled.exactPhrases.find(phrase => phrase.normalized === prepared.normalized);
  if (exact) { result.score += 20; result.reasons.push(`frase exata legada: ${exact.raw}`); }

  let regexMatched = false;
  if (compiled.regex) {
    regexMatched = compiled.regex.test(prepared.raw);
    if (regexMatched) { result.score += 12; result.reasons.push(`expressão regular: /${rules.regex_pattern}/${rules.regex_flags}`); }
  }

  result.matched = compiled.hasPositiveConfiguration && (keywordChannel || sentenceChannel || Boolean(exact) || regexMatched);
  if (result.matched && rules.require_question_mark) {
    const fullConfigured = Boolean(exact) || compiled.sentences.some(sentence => sentence.normalized === prepared.normalized);
    const evidence = [
      ...matchedUnits.map(item => item.term),
      ...sentenceMatches.map(item => item.sentence.raw),
      ...(exact ? [exact.raw] : [])
    ];
    const semantic = semanticQuestionAssessment(prepared, evidence, { exactConfigured: fullConfigured });
    if (!semantic.allowed) {
      result.matched = false;
      result.blockedReasons.push(`proteção semântica: ${semantic.reason}`);
    } else if (semantic.coverage >= 0.5) result.score += 2;
  }
  if (!result.matched && compiled.units.length && rules.match_mode === 'all') {
    const missing = unitResults.filter(item => !item.matched).map(item => item.label);
    result.blockedReasons.push(`modo “todas”: faltaram ${missing.join(', ')}`);
  }
  return result;
}

module.exports = {
  DEFAULT_TRIGGER_RULES,
  normalizeTriggerRules,
  validateRegex,
  levenshteinWithin,
  phraseMatch,
  phraseMatchPrepared,
  prepareMessage,
  compileTriggerRules,
  evaluateCompiledTrigger,
  evaluateTrigger,
  exactConfiguredPhrase,
  endsWithQuestionMark
};
