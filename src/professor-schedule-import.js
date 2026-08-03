const path = require('node:path');
const zlib = require('node:zlib');
const { normalizeText } = require('./text');
const { formatDisciplineLabel } = require('./si-professors-2026-2');

function detectDelimiter(line) {
  const candidates = [',', ';', '\t'];
  let best = ','; let bestCount = -1;
  for (const candidate of candidates) {
    let count = 0; let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') quoted = !quoted;
      else if (!quoted && char === candidate) count += 1;
    }
    if (count > bestCount) { best = candidate; bestCount = count; }
  }
  return best;
}

function parseDelimited(text, delimiter = null) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] || '';
  const separator = delimiter || detectDelimiter(firstLine);
  const rows = [];
  let row = []; let field = ''; let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  row.push(field.replace(/\r$/, ''));
  if (row.some(value => String(value).trim())) rows.push(row);
  return rows.filter(values => values.some(value => String(value).trim()));
}

function findEndOfCentralDirectory(buffer) {
  const signature = 0x06054b50;
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) return offset;
  }
  throw new Error('O arquivo XLSX não possui uma estrutura ZIP válida.');
}

function unzipEntries(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Diretório central inválido no XLSX.');
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const fileName = buffer.subarray(cursor + 46, cursor + 46 + fileNameLength).toString('utf8').replace(/\\/g, '/');
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Entrada inválida no XLSX: ${fileName}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    let data;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = zlib.inflateRawSync(compressed);
    else throw new Error(`Compactação não suportada no XLSX (${method}).`);
    entries.set(fileName, data);
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function xmlText(fragment) {
  return decodeXml([...String(fragment || '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi)].map(match => match[1]).join(''));
}

function columnIndex(reference) {
  const letters = String(reference || '').match(/^[A-Z]+/i)?.[0]?.toUpperCase() || 'A';
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, value - 1);
}

function workbookSheetPath(entries) {
  const workbook = entries.get('xl/workbook.xml')?.toString('utf8') || '';
  const relationshipId = workbook.match(/<sheet\b[^>]*\br:id="([^"]+)"/i)?.[1];
  const relationships = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8') || '';
  if (relationshipId) {
    const escaped = relationshipId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const target = relationships.match(new RegExp(`<Relationship\\b[^>]*\\bId="${escaped}"[^>]*\\bTarget="([^"]+)"`, 'i'))?.[1]
      || relationships.match(new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="${escaped}"`, 'i'))?.[1];
    if (target) {
      const clean = target.replace(/^\/+/, '');
      return path.posix.normalize(clean.startsWith('xl/') ? clean : path.posix.join('xl', clean));
    }
  }
  return entries.has('xl/worksheets/sheet1.xml') ? 'xl/worksheets/sheet1.xml' : [...entries.keys()].find(name => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name));
}

function parseXlsx(buffer) {
  const entries = unzipEntries(buffer);
  const sharedXml = entries.get('xl/sharedStrings.xml')?.toString('utf8') || '';
  const sharedStrings = [...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gi)].map(match => xmlText(match[1]));
  const sheetPath = workbookSheetPath(entries);
  if (!sheetPath || !entries.has(sheetPath)) throw new Error('Nenhuma planilha foi encontrada no arquivo XLSX.');
  const sheet = entries.get(sheetPath).toString('utf8');
  const rows = [];
  for (const rowMatch of sheet.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/gi)) {
    const values = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const attributes = cellMatch[1]; const body = cellMatch[2];
      const reference = attributes.match(/\br="([^"]+)"/i)?.[1] || `A${rows.length + 1}`;
      const type = attributes.match(/\bt="([^"]+)"/i)?.[1] || '';
      let value = '';
      if (type === 'inlineStr') value = xmlText(body);
      else {
        const raw = decodeXml(body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/i)?.[1] || '');
        value = type === 's' ? (sharedStrings[Number(raw)] ?? '') : raw;
      }
      values[columnIndex(reference)] = String(value || '').trim();
    }
    if (values.some(value => String(value || '').trim())) rows.push(values.map(value => value || ''));
  }
  return rows;
}

function headerKey(value) {
  const key = normalizeText(value).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const aliases = {
    professor: 'professor', docente: 'professor', nome: 'professor', nome_completo: 'professor', nome_do_professor: 'professor',
    email: 'email', e_mail: 'email', email_institucional: 'email',
    disciplina: 'discipline', materia: 'discipline', componente: 'discipline', componente_curricular: 'discipline',
    semestre: 'semester', periodo: 'semester', periodo_curricular: 'semester', turma: 'semester',
    dia: 'day', dias: 'day', dia_da_semana: 'day', dias_da_semana: 'day',
    horario: 'hours', horarios: 'hours', faixa_de_horario: 'hours',
    sala: 'room', salas: 'room', laboratorio: 'room', laboratorio_sala: 'room', local: 'room', local_da_aula: 'room',
    periodo_letivo: 'academic_period', semestre_letivo: 'academic_period', ano_semestre: 'academic_period'
  };
  return aliases[key] || key;
}

function rowsToRecords(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length < 2) throw new Error('A planilha precisa de cabeçalho e ao menos uma linha de dados.');
  const headers = rows[0].map(headerKey);
  const required = ['professor', 'discipline', 'semester', 'day', 'hours'];
  const missing = required.filter(field => !headers.includes(field));
  if (missing.length) throw new Error(`Colunas obrigatórias ausentes: ${missing.join(', ')}.`);
  const errors = []; const rawRows = [];
  rows.slice(1).forEach((values, rowIndex) => {
    const data = Object.fromEntries(headers.map((header, column) => [header, String(values[column] || '').trim()]));
    const line = rowIndex + 2;
    const absent = required.filter(field => !data[field]);
    if (absent.length) { errors.push({ line, error: `Campos vazios: ${absent.join(', ')}.` }); return; }
    rawRows.push({
      line,
      professor: data.professor,
      email: String(data.email || '').trim().toLowerCase(),
      discipline: data.discipline,
      semester: data.semester,
      day: data.day,
      hours: data.hours,
      room: data.room || '',
      academic_period: data.academic_period || options.academicPeriod || ''
    });
  });
  const grouped = new Map();
  for (const row of rawRows) {
    const key = normalizeText(row.professor);
    const current = grouped.get(key) || { name: row.professor, email: row.email, academic_period: row.academic_period, classes: [], source_lines: [] };
    if (!current.email && row.email) current.email = row.email;
    if (!current.academic_period && row.academic_period) current.academic_period = row.academic_period;
    const classKey = [row.discipline, row.semester, row.day, row.hours, row.room].map(normalizeText).join('|');
    if (!current.classes.some(entry => entry.key === classKey)) current.classes.push({ key: classKey, discipline: row.discipline, semester: row.semester, day: row.day, hours: row.hours, room: row.room || '' });
    current.source_lines.push(row.line);
    grouped.set(key, current);
  }
  const records = [...grouped.values()].map(record => ({
    name: record.name,
    email: record.email,
    academic_period: record.academic_period || options.academicPeriod || 'período não informado',
    semesters: [...new Set(record.classes.map(entry => entry.semester))],
    classes: record.classes.map(({ key, ...entry }) => entry),
    source_lines: record.source_lines
  })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return { records, errors, sourceRows: rawRows.length };
}

function parseProfessorScheduleFile(buffer, fileName, options = {}) {
  const extension = path.extname(String(fileName || '')).toLowerCase();
  let rows;
  if (extension === '.xlsx') rows = parseXlsx(buffer);
  else if (['.csv', '.tsv', '.txt'].includes(extension) || !extension) rows = parseDelimited(buffer.toString('utf8'), extension === '.tsv' ? '\t' : null);
  else throw new Error('Formato não suportado. Use CSV, TSV ou XLSX.');
  return rowsToRecords(rows, options);
}

function buildProfessorScheduleResponse(record, publishedAt = new Date()) {
  const period = String(record.academic_period || 'período importado').trim();
  const joinHuman = values => values.length <= 1 ? (values[0] || '') : `${values.slice(0, -1).join(', ')} e ${values.at(-1)}`;
  const date = new Intl.DateTimeFormat('pt-BR').format(publishedAt);
  return [
    `*${record.name}*`,
    '',
    '📧 *Contato*',
    record.email || '[ADICIONAR NO PAINEL]',
    '',
    '📚 *Semestres*',
    joinHuman(record.semesters || []),
    '',
    `🗓️ *Horários e salas — ${period}*`,
    ...(record.classes || []).flatMap(entry => [
      '',
      `*${formatDisciplineLabel(entry.discipline)}* — ${entry.semester}`,
      `${entry.day}, ${entry.hours}`,
      `Sala: *${entry.room || 'não informada'}*`
    ]),
    '',
    `_Horário importado em ${date}._`
  ].join('\n');
}

module.exports = {
  detectDelimiter,
  parseDelimited,
  parseXlsx,
  rowsToRecords,
  parseProfessorScheduleFile,
  buildProfessorScheduleResponse
};
