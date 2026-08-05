'use strict';

const { ACADEMIC_CALENDAR_EVENTS_2026 } = require('../../content/academic-calendar-2026');
const { SI_SCHEDULE_SOURCE_2026_2 } = require('../../si-professors-2026-2');
const { RESOURCE_CARDS } = require('../../content/resources');

const createSchemaAndSeedMethods = require('./legacy/schema-and-seed');
const createContentOriginsMethods = require('./legacy/content-origins');
const createContentV010Methods = require('./legacy/content-v010');
const createContentV014Methods = require('./legacy/content-v014');
const createSiAndExamplesMethods = require('./legacy/si-and-examples');

module.exports = function createMixin(deps) {
  const { DEFAULT_SETTINGS, DEFAULT_LINKS, DEFAULT_CALCULATORS, GROUP_FEATURES, GROUP_FEATURE_COLUMNS, boolToDb, asBool, parseJson, parseJsonList, nowIso, clone, comparableMessageSnapshot, messageSnapshotsEqual, packageKeyFor, triggerTermsOverlap, normalizePhone, normalizeTag, normalizeTags, parseList, normalizeText, normalizeTriggerRules, validateRegex, SI_PROFESSORS_2026_2, SI_PENDING_2026_2, SI_PROFESSOR_TRIGGER_ALIASES_2026_2, buildSiProfessorTriggerSentences, buildSiProfessorNameTriggerSentences, buildSiProfessorExactNamePhrases, formatDisciplineLabel, formatDisciplineNamesInText, buildDisciplineTriggerSentences, buildSiProfessorResponse, buildSharedDisciplineCards2026_2, buildProfessorScheduleResponse, SI_SUPPORT_MESSAGES_V083, SCHEDULE_BOARD_V0812, automaticMessagePayload, INSTITUTIONAL_CARDS_V098, FUN_CARDS_V0101, SEMESTER_WEEKLY_CARDS_V0143, CAMPUS_CARDS, captionAnalysis, felipeJuanPhone, injectFelipeJuanPhone, toPortugueseTitleCase, crypto } = deps;

  const professorContactValue = response => {
    const lines = String(response || '').split('\n');
    const legacy = lines.find(line => /^📧 \*E-mail:\*/u.test(line));
    if (legacy) return legacy.replace(/^📧 \*E-mail:\*\s*/u, '').trim();
    const heading = lines.findIndex(line => /^📧 \*Contato\*\s*$/u.test(line.trim()));
    if (heading >= 0) {
      for (let index = heading + 1; index < lines.length; index += 1) {
        const value = lines[index].trim();
        if (value) return value;
      }
    }
    return String(response || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  };
  const professorContactReplaceable = response => {
    const value = professorContactValue(response);
    return !value
      || /\[(?:ADICIONAR|IDENTIFICAR)[^\]]*\]/i.test(value)
      || /^não encontrado$/i.test(value)
      || /^nao encontrado$/i.test(value);
  };
  const replaceProfessorContact = (response, email) => {
    const source = String(response || '');
    if (!email || !professorContactReplaceable(source)) return source;
    const lines = source.split('\n');
    const legacy = lines.findIndex(line => /^📧 \*E-mail:\*/u.test(line));
    if (legacy >= 0) {
      lines[legacy] = `📧 *E-mail:* ${email}`;
      return lines.join('\n');
    }
    const heading = lines.findIndex(line => /^📧 \*Contato\*\s*$/u.test(line.trim()));
    if (heading >= 0) {
      let target = heading + 1;
      while (target < lines.length && !lines[target].trim()) target += 1;
      if (target < lines.length) lines[target] = email;
      else lines.push(email);
      return lines.join('\n');
    }
    return source;
  };
  const scope = { ...deps, ACADEMIC_CALENDAR_EVENTS_2026, SI_SCHEDULE_SOURCE_2026_2, RESOURCE_CARDS,
    professorContactValue, professorContactReplaceable, replaceProfessorContact };
  class LegacyMigrations {}
  for (const createMethods of [createSchemaAndSeedMethods, createContentOriginsMethods, createContentV010Methods, createContentV014Methods, createSiAndExamplesMethods]) {
    const descriptors = Object.getOwnPropertyDescriptors(createMethods(scope));
    delete descriptors.constructor;
    Object.defineProperties(LegacyMigrations.prototype, descriptors);
  }
  return LegacyMigrations;
};
