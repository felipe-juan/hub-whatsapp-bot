const { normalizeText, parseList } = require('./text');

function parseCsv(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  row.push(field.replace(/\r$/, ''));
  if (row.some(value => value.trim())) rows.push(row);
  return rows.filter(item => item.some(value => String(value).trim()));
}

function headerKey(value) {
  const key = normalizeText(value).replace(/\s+/g, '_');
  const aliases = {
    nome: 'name', professor: 'name', name: 'name',
    email: 'email', e_mail: 'email',
    apelidos: 'aliases', aliases: 'aliases', formas_de_busca: 'aliases',
    observacoes: 'notes', observacao: 'notes', notes: 'notes',
    sala: 'room', room: 'room', bloco: 'building', predio: 'building', building: 'building',
    sala_confirmada_em: 'room_confirmed_at', room_confirmed_at: 'room_confirmed_at',
    fonte_da_sala: 'room_source', fonte_sala: 'room_source', room_source: 'room_source',
    disciplinas: 'disciplines', disciplines: 'disciplines', horarios: 'schedule', horario: 'schedule', schedule: 'schedule',
    periodo_academico: 'academic_period', academic_period: 'academic_period',
    ativo: 'active', active: 'active',
    titulo: 'title', title: 'title', categoria: 'category', category: 'category',
    url: 'url', link: 'url', descricao: 'description', description: 'description',
    palavras_chave: 'keywords', keywords: 'keywords', gatilhos: 'keywords',
    resposta: 'response_text', mensagem: 'response_text', texto_da_resposta: 'response_text', resposta_personalizada: 'response_text', response_text: 'response_text',
    topico: 'topic', topic: 'topic', escopo: 'scope', scope: 'scope',
    sentencas: 'sentences', sentenca: 'sentences', frases: 'sentences', sentences: 'sentences', frase_exata: 'sentences', frases_exatas: 'sentences',
    exige_interrogacao: 'require_question_mark', require_question_mark: 'require_question_mark',
    prioridade: 'priority', priority: 'priority', publicar: 'publish', publish: 'publish'
  };
  return aliases[key] || key;
}

function asBool(value, fallback = true) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return ['1', 'true', 'yes', 'sim', 'on', 'ativo', 'publicado'].includes(normalizeText(value));
}

function rowsToObjects(csv) {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new Error('O CSV precisa de cabeçalho e ao menos uma linha de dados.');
  const headers = rows[0].map(headerKey);
  return rows.slice(1).map((values, index) => ({
    line: index + 2,
    data: Object.fromEntries(headers.map((header, column) => [header, String(values[column] || '').trim()]))
  }));
}

function importTeachersCsv(database, csv) {
  const rows = rowsToObjects(csv);
  const report = { total: rows.length, created: 0, updated: 0, skipped: 0, errors: [] };
  for (const { line, data } of rows) {
    try {
      const result = database.upsertTeacherByEmail({
        name: data.name,
        email: data.email,
        aliases: parseList(String(data.aliases || '').replace(/\|/g, '\n')),
        notes: data.notes || '', room: data.room || '', building: data.building || '',
        room_confirmed_at: data.room_confirmed_at || '', room_source: data.room_source || '',
        disciplines: parseList(String(data.disciplines || '').replace(/\|/g, '\n')),
        schedule: parseList(String(data.schedule || '').replace(/\|/g, '\n')),
        academic_period: data.academic_period || '', active: asBool(data.active, true)
      });
      if (result.created) report.created += 1; else report.updated += 1;
    } catch (error) {
      report.skipped += 1;
      report.errors.push({ line, error: error.message });
    }
  }
  return report;
}

function importLinksCsv(database, csv, options = {}) {
  const rows = rowsToObjects(csv);
  const report = { total: rows.length, created: 0, updated: 0, published: 0, drafts: 0, skipped: 0, errors: [] };
  for (const { line, data } of rows) {
    try {
      const publish = data.publish ? asBool(data.publish, false) : Boolean(options.publish);
      const result = database.upsertHubLinkByTitle({
        title: data.title,
        category: data.category || '',
        url: data.url || '',
        description: data.description || '',
        keywords: parseList(String(data.keywords || '').replace(/\|/g, '\n')),
        response_text: data.response_text || '',
        priority: Number(data.priority || 0),
        active: asBool(data.active, true)
      }, { publish });
      if (result.created) report.created += 1; else report.updated += 1;
      if (publish) report.published += 1; else report.drafts += 1;
    } catch (error) {
      report.skipped += 1;
      report.errors.push({ line, error: error.message });
    }
  }
  return report;
}


function importAutomaticMessagesCsv(database, csv, options = {}) {
  const rows = rowsToObjects(csv);
  const report = { total: rows.length, created: 0, updated: 0, published: 0, drafts: 0, skipped: 0, errors: [] };
  for (const { line, data } of rows) {
    try {
      const publish = data.publish ? asBool(data.publish, false) : Boolean(options.publish);
      const result = database.upsertAutomaticMessageByTitle({
        title: data.title,
        topic: '',
        scope: ['group','private','both'].includes(String(data.scope || '').toLowerCase()) ? String(data.scope).toLowerCase() : 'both',
        response_text: data.response_text || '',
        priority: Number(data.priority || 0),
        active: asBool(data.active, true),
        trigger: {
          keywords: parseList(String(data.keywords || '').replace(/\|/g, '\n')),
          match_mode: 'all',
          sentences: parseList(String(data.sentences || '').replace(/\|/g, '\n')),
          exact_phrases: [],
          require_question_mark: asBool(data.require_question_mark, false)
        }
      }, { publish });
      if (result.created) report.created += 1; else report.updated += 1;
      if (publish) report.published += 1; else report.drafts += 1;
    } catch (error) {
      report.skipped += 1; report.errors.push({ line, error: error.message });
    }
  }
  return report;
}

module.exports = { parseCsv, rowsToObjects, importTeachersCsv, importLinksCsv, importAutomaticMessagesCsv };
