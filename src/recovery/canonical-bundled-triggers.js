'use strict';

const { normalizeTriggerRules } = require('../trigger-rules');
const { normalizeText } = require('../text');
const { STUDENT_ASSISTANCE_CARDS } = require('../content/student-assistance');
const { RESOURCE_CARDS } = require('../content/resources');

function parseObject(value) {
  if (!value) return null;
  try {
    const object = JSON.parse(value);
    return object && typeof object === 'object' ? object : null;
  } catch {
    return null;
  }
}

function patchSnapshot(value, trigger) {
  const object = parseObject(value);
  if (!object) return value || '';
  object.trigger = trigger;
  return JSON.stringify(object);
}

function normalizedSet(values) {
  return [...new Set((values || []).map(normalizeText).filter(Boolean))].sort();
}

function sameList(first, second) {
  return JSON.stringify(normalizedSet(first)) === JSON.stringify(normalizedSet(second));
}

function sameNonPhrasePolicy(current, canonical) {
  const listFields = ['keywords', 'required_words', 'excluded_words', 'synonym_group_ids', 'negative_examples'];
  for (const field of listFields) if (!sameList(current[field], canonical[field])) return false;
  for (const field of ['match_mode', 'require_question_mark', 'regex_pattern', 'regex_flags', 'typo_tolerance']) {
    if (String(current[field] ?? '') !== String(canonical[field] ?? '')) return false;
  }
  return true;
}

function isLegacyExpandedExactTrigger(currentInput, canonicalInput) {
  const current = normalizeTriggerRules(currentInput || {});
  const canonical = normalizeTriggerRules(canonicalInput || {});
  if (canonical.exact_phrases.length === 0) return false;
  if (current.exact_phrases.length !== 0) return false;
  const expandedSentences = [...canonical.sentences, ...canonical.exact_phrases];
  return sameList(current.sentences, expandedSentences) && sameNonPhrasePolicy(current, canonical);
}

function restoreCanonicalBundledTriggers(database) {
  const db = database?.db || database;
  if (!db?.prepare) return 0;
  const select = db.prepare(`SELECT id,response_text,trigger_json,draft_json,package_snapshot_json,customized
    FROM automatic_messages
    WHERE source_type='hub_package' AND (package_key=? OR lower(title)=lower(?))
    ORDER BY CASE WHEN package_key=? THEN 0 ELSE 1 END,id
    LIMIT 1`);
  const update = db.prepare(`UPDATE automatic_messages
    SET trigger_json=?,draft_json=?,package_snapshot_json=?,pending_package_json='',customized=?,updated_at=?
    WHERE id=?`);
  const timestamp = new Date().toISOString();
  let changed = 0;
  for (const definition of [...STUDENT_ASSISTANCE_CARDS, ...RESOURCE_CARDS]) {
    const row = select.get(definition.key, definition.message.title, definition.key);
    if (!row) continue;
    const canonical = normalizeTriggerRules(definition.message.trigger || {});
    const current = normalizeTriggerRules(parseObject(row.trigger_json) || {});
    const officialUncustomized = Number(row.customized || 0) === 0;
    const safelyLegacyExpanded = isLegacyExpandedExactTrigger(current, canonical)
      && String(row.response_text || '') === String(definition.message.response_text || '');
    if (!officialUncustomized && !safelyLegacyExpanded) continue;
    if (JSON.stringify(current) === JSON.stringify(canonical) && !safelyLegacyExpanded) continue;
    update.run(
      JSON.stringify(canonical),
      patchSnapshot(row.draft_json, canonical),
      patchSnapshot(row.package_snapshot_json, canonical),
      safelyLegacyExpanded ? 0 : Number(row.customized || 0),
      timestamp,
      Number(row.id)
    );
    changed += 1;
  }
  return changed;
}

module.exports = { restoreCanonicalBundledTriggers, isLegacyExpandedExactTrigger };
