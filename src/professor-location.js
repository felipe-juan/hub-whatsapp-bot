const { normalizeText, containsPhrase, tokenize } = require('./text');
const { endsWithQuestionMark, levenshteinWithin } = require('./trigger-rules');
const { implicitQuestionStructure } = require('./semantic-question');

const LOCATION_CARD_TITLE = 'Onde está o professor — salas do IFBA';
const COORDINATION_EMAIL = 'csi.vdc@ifba.edu.br';
const ROOM_DIRECTORY_URL = 'https://app.powerbi.com/view?r=eyJrIjoiN2JhMWNmYjMtOWRiNy00OTFlLTg5ODItMWU1ZWZhYzVhNWFjIiwidCI6IjZmZjM3NGY1LWUzZWItNGM2Zi1iN2I1LTUwOTE2NDA5MzdmOCJ9';
const SCHEDULE_BOARD_URL = 'https://ifbaedubr-my.sharepoint.com/:x:/g/personal/rodrigobonfim_ifba_edu_br/IQCqjeOoMcvWQoiikRSUwWOxAZSOwJaih1qWmWFq5Vxa73Y';

const EXCLUDED_CONTEXTS = Object.freeze([
  'coordenacao', 'laboratorio', 'miniauditorio', 'biblioteca', 'secretaria',
  'cores', 'caens', 'capne', 'cotep', 'refeitorio', 'auditorio', 'sala de reuniao'
]);

const GENERIC_DIRECT_REQUESTS = new Set([
  'onde esta o professor', 'onde esta a professora', 'onde fica o professor', 'onde fica a professora',
  'onde encontro o professor', 'onde encontro a professora', 'onde encontro o docente',
  'onde esta o docente', 'onde fica o docente', 'sala do professor', 'sala da professora', 'sala do docente',
  'localizacao do professor', 'localizacao da professora', 'localizacao do docente',
  'consultar sala do professor', 'consultar sala da professora', 'consultar sala do docente',
  'qual a sala do professor', 'qual a sala da professora', 'qual a sala do docente'
].map(normalizeText));

const LOCATION_INTENT_PATTERNS = Object.freeze([
  /(?:^|\s)onde\s+(?:fica|esta|encontro|achar|acho|localizo|localizar)(?:\s|$)/,
  /(?:^|\s)onde\s+(?:o|a)\s+(?:professor|professora|docente)\s+esta(?:\s|$)/,
  /(?:^|\s)(?:qual|que)\s+(?:e\s+)?(?:a\s+)?sala(?:\s|$)/,
  /(?:^|\s)em\s+qual\s+sala(?:\s|$)/,
  /(?:^|\s)localizacao(?:\s|$)/,
  /(?:^|\s)gabinete(?:\s|$)/,
  /(?:^|\s)sala\s+(?:do|da|de)\s+(?:professor|professora|docente)(?:\s|$)/,
  /(?:^|\s)consultar\s+sala\s+(?:do|da|de)\s+(?:professor|professora|docente)(?:\s|$)/
]);

const PROFESSOR_TERMS = Object.freeze(['professor', 'professora', 'docente', 'profa', 'prof']);
const CLASSROOM_PATTERNS = Object.freeze([
  /(?:^|\s)sala\s+(?:de|da)\s+(?:aula|turma|disciplina|materia)(?:\s|$)/,
  /(?:^|\s)(?:qual|que|em\s+qual)\s+(?:e\s+)?(?:a\s+)?sala(?:\s|$)[\s\S]{0,100}\b(?:aula|turma|disciplina|materia)\b/,
  /(?:^|\s)onde\s+(?:sera|e|vai\s+ser|acontece|ocorre|fica)(?:\s|$)[\s\S]{0,100}\b(?:aula|turma|disciplina|materia)\b/
]);

function unique(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function teacherAliases(teacher) {
  const fullName = String(teacher?.name || '').trim();
  const explicit = Array.isArray(teacher?.aliases) ? teacher.aliases : [];
  const aliases = unique([fullName, ...explicit]).filter(alias => tokenize(alias).length > 0);
  return aliases.sort((a, b) => tokenize(b).length - tokenize(a).length || b.length - a.length);
}

function hasLocationIntent(normalized) {
  return LOCATION_INTENT_PATTERNS.some(pattern => pattern.test(normalized));
}

function hasProfessorTerm(normalized) {
  return PROFESSOR_TERMS.some(term => containsPhrase(normalized, term));
}

function hasExcludedContext(normalized) {
  return EXCLUDED_CONTEXTS.some(term => containsPhrase(normalized, term));
}

function isClassroomRequest(normalized) {
  return CLASSROOM_PATTERNS.some(pattern => pattern.test(normalized));
}


function directPhrasesForAlias(alias) {
  return [
    `sala do professor ${alias}`, `sala da professora ${alias}`, `sala do docente ${alias}`, `sala de ${alias}`,
    `qual sala ${alias}`, `qual a sala de ${alias}`, `qual é a sala do professor ${alias}`,
    `qual e a sala do professor ${alias}`, `qual é a sala da professora ${alias}`,
    `qual e a sala da professora ${alias}`, `qual é a sala do docente ${alias}`,
    `qual e a sala do docente ${alias}`, `em qual sala ${alias}`,
    `em qual sala está o professor ${alias}`, `em qual sala esta o professor ${alias}`,
    `em qual sala está a professora ${alias}`, `em qual sala esta a professora ${alias}`,
    `em qual sala está o docente ${alias}`, `em qual sala esta o docente ${alias}`,
    `onde está ${alias}`, `onde esta ${alias}`, `onde fica ${alias}`, `onde encontro ${alias}`,
    `onde está o professor ${alias}`, `onde esta o professor ${alias}`,
    `onde está a professora ${alias}`, `onde esta a professora ${alias}`,
    `onde fica o professor ${alias}`, `onde fica a professora ${alias}`, `onde fica o docente ${alias}`,
    `onde está o docente ${alias}`, `onde esta o docente ${alias}`,
    `onde encontro o professor ${alias}`, `onde encontro a professora ${alias}`, `onde encontro o docente ${alias}`,
    `localização do professor ${alias}`, `localizacao do professor ${alias}`,
    `localização da professora ${alias}`, `localizacao da professora ${alias}`,
    `localização do docente ${alias}`, `localizacao do docente ${alias}`,
    `localização de ${alias}`, `localizacao de ${alias}`, `gabinete de ${alias}`,
    `gabinete do professor ${alias}`, `gabinete da professora ${alias}`, `gabinete do docente ${alias}`
  ].map(normalizeText);
}

function exactDirectTeacherMatches(normalized, teachers) {
  const matches = [];
  for (const teacher of teachers || []) {
    if (teacher?.active === false) continue;
    const matchedAlias = teacherAliases(teacher).find(alias => directPhrasesForAlias(alias).includes(normalized));
    if (matchedAlias) matches.push({ teacher, alias: matchedAlias, specificity: tokenize(matchedAlias).length });
  }
  return matches;
}

function professorNameTolerance(expected, actual, configured = 2) {
  const limit = Math.max(0, Math.min(2, Number(configured || 0)));
  if (!limit || expected.length < 4 || actual.length < 4) return 0;
  return expected.length >= 7 && actual.length >= 5 ? limit : Math.min(1, limit);
}

function fuzzyAliasInMessage(normalized, alias, tolerance = 2) {
  const messageTokens = tokenize(normalized);
  const aliasTokens = tokenize(alias);
  if (!aliasTokens.length || messageTokens.length < aliasTokens.length) return false;
  for (let start = 0; start <= messageTokens.length - aliasTokens.length; start += 1) {
    let okay = true;
    for (let offset = 0; offset < aliasTokens.length; offset += 1) {
      const expected = aliasTokens[offset]; const actual = messageTokens[start + offset];
      if (actual === expected) continue;
      const effective = professorNameTolerance(expected, actual, tolerance);
      if (!effective || !levenshteinWithin(actual, expected, effective)) { okay = false; break; }
    }
    if (okay) return true;
  }
  return false;
}

function portuguesePhoneticKey(value) {
  return normalizeText(value).split(/\s+/)[0]
    .replace(/ph/g, 'f').replace(/[wy]/g, 'i').replace(/nh/g, 'n').replace(/lh/g, 'l')
    .replace(/ch/g, 'x').replace(/[ckq]/g, 'k').replace(/g(?=[ei])/g, 'j')
    .replace(/s{2,}/g, 's').replace(/(.)\1+/g, '$1').replace(/[aeiou]+/g, 'a');
}

function fuzzyDistanceInMessage(normalized, alias) {
  const messageTokens = tokenize(normalized); const aliasTokens = tokenize(alias);
  if (!aliasTokens.length || messageTokens.length < aliasTokens.length) return Infinity;
  let best = Infinity;
  for (let start = 0; start <= messageTokens.length - aliasTokens.length; start += 1) {
    let total = 0; let okay = true;
    for (let offset = 0; offset < aliasTokens.length; offset += 1) {
      const expected = aliasTokens[offset]; const actual = messageTokens[start + offset];
      if (actual === expected) continue;
      const effective = professorNameTolerance(expected, actual, 2);
      if (!effective || !levenshteinWithin(actual, expected, effective)) { okay = false; break; }
      let distance = 0; const max = Math.max(actual.length, expected.length);
      for (let index = 0; index < max; index += 1) if (actual[index] !== expected[index]) distance += 1;
      total += distance;
    }
    if (okay) best = Math.min(best, total);
  }
  return best;
}

function findTeacherMatches(normalized, teachers) {
  const exact = []; const fuzzy = [];
  for (const teacher of teachers || []) {
    if (teacher?.active === false) continue;
    const aliases = teacherAliases(teacher);
    const alias = aliases.find(candidate => containsPhrase(normalized, candidate));
    if (alias) { exact.push({ teacher, alias, specificity: tokenize(alias).length, fuzzy: false, distance: 0 }); continue; }
    for (const candidate of aliases) {
      const distance = fuzzyDistanceInMessage(normalized, candidate);
      if (Number.isFinite(distance)) { fuzzy.push({ teacher, alias: candidate, specificity: tokenize(candidate).length, fuzzy: true, distance }); break; }
    }
  }
  const matches = exact.length ? exact : fuzzy;
  if (matches.length <= 1) return matches;
  const maxSpecificity = Math.max(...matches.map(item => item.specificity));
  let finalists = matches.filter(item => item.specificity === maxSpecificity);
  if (finalists.length <= 1) return finalists;
  if (!exact.length) {
    const minDistance = Math.min(...finalists.map(item => item.distance));
    finalists = finalists.filter(item => item.distance === minDistance);
    if (finalists.length <= 1) return finalists;
  }
  const firstNames = finalists.map(item => normalizeText(item.teacher.name).split(/\s+/)[0]);
  const sameLiteral = firstNames.every(name => name === firstNames[0]);
  const phonetics = firstNames.map(portuguesePhoneticKey);
  const samePhonetic = phonetics.every(key => key === phonetics[0]);
  if (sameLiteral || samePhonetic) return finalists;
  return [finalists.sort((a, b) => a.distance - b.distance || b.specificity - a.specificity || String(a.teacher.name).localeCompare(String(b.teacher.name), 'pt-BR'))[0]];
}

function classifyProfessorLocationRequest(rawMessage, teachers = []) {
  const raw = String(rawMessage || '').trim();
  const normalized = normalizeText(raw);
  if (!normalized) return { matched: false, reason: 'empty' };

  const endsQuestion = endsWithQuestionMark(raw);
  const questionLike = endsQuestion || implicitQuestionStructure(raw);
  const genericDirect = GENERIC_DIRECT_REQUESTS.has(normalized);
  let matches = questionLike ? findTeacherMatches(normalized, teachers) : exactDirectTeacherMatches(normalized, teachers);
  const professorContext = hasProfessorTerm(normalized) || matches.length > 0;

  const bareRoomByProfessor = matches.length > 0
    && /(?:^|\s)sala(?:\s|$)/u.test(normalized)
    && !/\b(?:atendimento|gabinete|localizacao)\b/u.test(normalized)
    && !/(?:^|\s)onde\s+(?:fica|esta|encontro|achar|acho|localizo|localizar)(?:\s|$)/u.test(normalized);
  if ((isClassroomRequest(normalized) || bareRoomByProfessor) && professorContext) {
    // Quando o professor foi reconhecido, deixe o cartão individual responder:
    // ele contém a sala correta de cada disciplina no quadro 2026.2.
    if (matches.length) return { matched: false, reason: 'handled-by-professor-card' };
    if (!questionLike) return { matched: false, reason: 'not-exact-direct' };
    return { matched: true, kind: 'classroom', matches };
  }
  if (hasExcludedContext(normalized)) return { matched: false, reason: 'excluded-context' };

  if (!questionLike) {
    if (genericDirect) return { matched: true, kind: 'ask-name', matches: [] };
    if (!matches.length) return { matched: false, reason: 'not-exact-direct' };
    return { matched: true, kind: matches.length > 1 ? 'ambiguous' : 'location', matches };
  }

  if (!hasLocationIntent(normalized)) return { matched: false, reason: 'missing-location-intent' };
  if (!matches.length) {
    if (hasProfessorTerm(normalized)) return { matched: true, kind: 'ask-name', matches: [] };
    return { matched: false, reason: 'teacher-not-recognized' };
  }
  return { matched: true, kind: matches.length > 1 ? 'ambiguous' : 'location', matches };
}

function validIsoDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

function isStaleConfirmation(value, staleDays = 180, now = Date.now()) {
  if (!validIsoDate(value)) return false;
  const confirmedAt = new Date(`${value}T12:00:00Z`).getTime();
  return now - confirmedAt > Math.max(1, Number(staleDays || 180)) * 86400000;
}

function formatProfessorLocationResponse(teacher, { staleDays = 180, now = Date.now() } = {}) {
  const name = String(teacher?.name || 'Professor(a)').trim();
  const email = String(teacher?.email || '').trim();
  const room = String(teacher?.room || '').trim();
  const building = String(teacher?.building || '').trim();
  const confirmedAt = String(teacher?.room_confirmed_at || '').trim();
  const source = String(teacher?.room_source || '').trim();
  const confirmed = Boolean(room && validIsoDate(confirmedAt) && source);
  const lines = [`👨‍🏫/👩‍🏫 *Professor(a): ${name}*`, ''];

  if (confirmed) {
    lines.push(`📍 *Local de atendimento:* ${room}`);
    if (building) lines.push(`🏢 *Bloco:* ${building}`);
    if (email) lines.push(`📧 *E-mail:* ${email}`);
    lines.push('', `🗓️ *Sala confirmada em:* ${confirmedAt.split('-').reverse().join('/')}`, `🔎 *Fonte:* ${source}`);
    if (isStaleConfirmation(confirmedAt, staleDays, now)) {
      lines.push('', '⚠️ Esta confirmação tem mais de seis meses. Recomenda-se confirmar com o docente ou com a Coordenação de BSI.');
    }
  } else {
    lines.push('Não há uma sala de atendimento confirmada na base do bot.');
    if (email) lines.push('', `📧 *E-mail:* ${email}`);
    lines.push(`🏫 *Coordenação de BSI:* ${COORDINATION_EMAIL}`);
    lines.push('', '📍 *Consulta geral de salas dos professores:*', ROOM_DIRECTORY_URL);
  }
  lines.push('', '_A sala de atendimento pode ser diferente da sala em que ocorre a aula._');
  return lines.join('\n');
}

function formatAskProfessorNameResponse() {
  return [
    '👨‍🏫/👩‍🏫 *Localização de professor*', '',
    'De qual professor ou professora você deseja saber a localização?', '',
    'Exemplo: `Onde fica o professor Allan?`', '',
    '📍 *Consulta geral de salas dos professores:*', ROOM_DIRECTORY_URL
  ].join('\n');
}

function formatClassroomResponse() {
  return [
    '🏫 *Sala da aula*', '',
    'A sala de atendimento do professor não é necessariamente a sala da turma.',
    'Como salas de aula podem mudar, consulte o quadro atualizado de horários ou confirme com a Coordenação de BSI.', '',
    `🗓️ *Quadro de horários:* ${SCHEDULE_BOARD_URL}`,
    `📧 *Coordenação de BSI:* ${COORDINATION_EMAIL}`
  ].join('\n');
}

function formatProfessorDisambiguation(matches, timeoutSeconds = 120) {
  const list = matches.slice(0, 3).map((match, index) => `${index + 1}. 👨‍🏫/👩‍🏫 *${match.teacher.name}*`).join('\n');
  return [
    'Encontrei mais de um professor com esse nome:', '', list, '',
    `Responda somente com o número desejado em até ${Math.ceil(timeoutSeconds / 60)} min.`
  ].join('\n');
}

module.exports = {
  LOCATION_CARD_TITLE,
  COORDINATION_EMAIL,
  ROOM_DIRECTORY_URL,
  SCHEDULE_BOARD_URL,
  EXCLUDED_CONTEXTS,
  GENERIC_DIRECT_REQUESTS,
  teacherAliases,
  directPhrasesForAlias,
  fuzzyAliasInMessage,
  professorNameTolerance,
  portuguesePhoneticKey,
  findTeacherMatches,
  classifyProfessorLocationRequest,
  validIsoDate,
  isStaleConfirmation,
  formatProfessorLocationResponse,
  formatAskProfessorNameResponse,
  formatClassroomResponse,
  formatProfessorDisambiguation
};
