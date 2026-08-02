const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { formatSectorResponse } = require('../src/sector-directory');

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0814-'));
  return { dir, file: path.join(dir, 'bot.sqlite') };
}

test('cadastro estruturado exibe sigla e nome institucional completo', () => {
  const temp = tempDb();
  const db = new Database(temp.file, { seedBundledContent: true });
  try {
    const expected = new Map([
      ['CORES', 'CORES — Coordenação de Registros Escolares'],
      ['CAENS', 'CAENS — Coordenação de Apoio ao Ensino'],
      ['CAPNE', 'CAPNE — Coordenação de Atendimento às Pessoas com Necessidades Educacionais Específicas'],
      ['CSI', 'CSI — Coordenação do Bacharelado em Sistemas de Informação']
    ]);
    const sectors = db.listSectors({ activeOnly: true });
    for (const [acronym, fullName] of expected) {
      const sector = sectors.find(item => item.acronym === acronym);
      assert.ok(sector, `setor ausente: ${acronym}`);
      assert.match(formatSectorResponse(sector), new RegExp(fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  } finally {
    db.close();
    fs.rmSync(temp.dir, { recursive: true, force: true });
  }
});
