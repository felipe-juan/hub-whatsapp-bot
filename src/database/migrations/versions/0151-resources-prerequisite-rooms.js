'use strict';

const { RESOURCE_CARDS, REPOSITORY_URLS } = require('../../../content/resources');
const { normalizeText } = require('../../../text');

const REPOSITORY_SHORT_TRIGGERS = new Set([
  'repositorio', 'arquivos', 'drive', 'links do drive', 'repositorio bsi',
  'repositorio de bsi', 'arquivos bsi', 'arquivos de bsi', 'drive bsi',
  'drive de bsi', 'materiais bsi', 'materiais de bsi', 'materiais do curso',
  'arquivos do curso', 'provas antigas', 'provas de bsi', 'repositorios de bsi',
  'manual de sobrevivencia'
]);

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function stripRepositoryShortTriggers(triggerInput = {}) {
  const trigger = { ...triggerInput };
  for (const field of ['sentences', 'exact_phrases', 'keywords']) {
    trigger[field] = (Array.isArray(trigger[field]) ? trigger[field] : [])
      .filter(value => !REPOSITORY_SHORT_TRIGGERS.has(normalizeText(value)));
  }
  return trigger;
}

module.exports = {
  id: '0151-resources-prerequisite-rooms',
  up(db, database) {
    const seedBundledContent = database.options?.seedBundledContent === true
      || (database.options?.seedBundledContent !== false && process.env.HUB_SKIP_BUNDLED_CONTENT !== '1');
    if (!seedBundledContent) return;
    for (const definition of RESOURCE_CARDS) {
      database.stagePackageAutomaticMessage(definition.key, definition.message);
    }

    const canonical = db.prepare('SELECT id FROM automatic_messages WHERE package_key=?').get('hub-bsi-repositorios-arquivos-v0151');
    const candidates = db.prepare(`
      SELECT id,title,response_text,trigger_json,customized,source_type
      FROM automatic_messages
      WHERE id<>?
        AND (
          lower(title) IN ('links do drive','arquivos do drive','repositório bsi','repositorio bsi','repositório - bsi','repositorio - bsi')
          OR response_text LIKE ?
        )
    `).all(Number(canonical?.id || -1), `%${REPOSITORY_URLS.drive}%`);

    const updateTrigger = db.prepare('UPDATE automatic_messages SET trigger_json=?,updated_at=? WHERE id=?');
    const retire = db.prepare("UPDATE automatic_messages SET active=0,archived=1,updated_at=? WHERE id=?");
    const timestamp = new Date().toISOString();
    for (const row of candidates) {
      const title = normalizeText(row.title || '');
      const genericTitle = ['links do drive', 'arquivos do drive', 'repositorio bsi', 'repositorio - bsi'].includes(title);
      if (genericTitle && !Number(row.customized || 0)) {
        const current = database.getAutomaticMessage(Number(row.id));
        if (current) database.archiveAutomaticMessage(current, 'v0.15.1-substituido-por-repositorios-bsi');
        retire.run(timestamp, Number(row.id));
        continue;
      }
      const trigger = stripRepositoryShortTriggers(parseJson(row.trigger_json, {}));
      updateTrigger.run(JSON.stringify(trigger), timestamp, Number(row.id));
    }

    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='regression_cases'").get()) {
      const insert = db.prepare(`INSERT OR IGNORE INTO regression_cases
        (phrase,normalized_phrase,expectation,expected_title,active,created_at,updated_at)
        VALUES (?,?,?,?,1,?,?)`);
      const cases = [
        ['repositório', 'respond', 'BSI — Repositórios, arquivos e materiais'],
        ['onde encontro provas antigas de BSI?', 'respond', 'BSI — Repositórios, arquivos e materiais'],
        ['como funciona a quebra de pré-requisito?', 'respond', 'BSI — Quebra de pré-requisito'],
        ['qual prédio será ministrada a aula?', 'respond', 'Campus — Como identificar prédio, andar e sala'],
        ['repositório institucional do IFBA', 'ignore', '']
      ];
      for (const [phrase, expectation, title] of cases) {
        insert.run(phrase, normalizeText(phrase), expectation, title, timestamp, timestamp);
      }
    }
  }
};
