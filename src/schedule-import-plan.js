'use strict';

const crypto = require('node:crypto');
const { normalizeText } = require('./text');
const { normalizeStructuredScheduleEntry } = require('./schedule-structure');

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function rowIdentity(row = {}) {
  return [
    normalizeText(row.professor_name || ''),
    normalizeText(row.discipline_code || row.discipline_name || ''),
    Number(row.semester_number || 0),
    Number(row.day_of_week)
  ].join('|');
}

function rowFingerprint(row = {}) {
  return [rowIdentity(row), Number(row.start_minutes ?? -1), Number(row.end_minutes ?? -1), normalizeText(row.hours_label || ''), normalizeText(row.room || '')].join('|');
}

function changeId(parts = []) {
  return crypto.createHash('sha256').update(parts.map(value => String(value ?? '')).join('\u001f')).digest('hex').slice(0, 20);
}

function recordsToRows(records = [], source = {}) {
  return (Array.isArray(records) ? records : []).flatMap(record =>
    (record.classes || []).flatMap(entry => normalizeStructuredScheduleEntry(entry, record, {
      academic_period: record.academic_period || source.academic_period || '',
      source_title: record.source_title || source.source_title || '',
      source_version: record.source_version || source.source_version || '',
      source_date: record.source_date || source.source_date || ''
    })));
}

function displayRow(row = {}) {
  return {
    discipline: String(row.discipline_code ? `${row.discipline_code} - ${row.discipline_name}` : row.discipline_name || ''),
    semester: String(row.semester_label || `${row.semester_number || ''}º semestre`),
    day: String(row.day_label || ''),
    hours: String(row.hours_label || ''),
    room: String(row.room || ''),
    professor: String(row.professor_name || '')
  };
}

function groupRowsByProfessor(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const key = `${normalizeText(row.professor_name)}|${String(row.academic_period || '')}`;
    const current = grouped.get(key) || { name: row.professor_name, academic_period: row.academic_period, email: row.professor_email || '', rows: [] };
    if (!current.email && row.professor_email) current.email = row.professor_email;
    current.rows.push(row);
    grouped.set(key, current);
  }
  return grouped;
}

function buildProfessorScheduleImportPlan(records = [], currentEntries = []) {
  const importedRows = recordsToRows(records);
  const currentRows = (Array.isArray(currentEntries) ? currentEntries : []).filter(entry => entry.active !== false);
  const currentGroups = groupRowsByProfessor(currentRows);
  const importedGroups = groupRowsByProfessor(importedRows);
  const recordByKey = new Map((records || []).map(record => [`${normalizeText(record.name)}|${String(record.academic_period || '')}`, record]));
  const changes = [];
  const professors = [];

  for (const [groupKey, importedGroup] of importedGroups) {
    const currentGroup = currentGroups.get(groupKey) || { name: importedGroup.name, academic_period: importedGroup.academic_period, email: '', rows: [] };
    const currentByIdentity = new Map(currentGroup.rows.map(row => [rowIdentity(row), row]));
    const importedByIdentity = new Map(importedGroup.rows.map(row => [rowIdentity(row), row]));
    const professorChanges = [];
    const importedRecord = recordByKey.get(groupKey) || {};
    const currentEmail = String(currentGroup.email || '').trim().toLowerCase();
    const importedEmail = String(importedRecord.email || importedGroup.email || '').trim().toLowerCase();

    if (validEmail(importedEmail) && importedEmail !== currentEmail) {
      const item = {
        id: changeId([groupKey, 'email', currentEmail, importedEmail]), type: 'email', professor: importedGroup.name,
        academic_period: importedGroup.academic_period, label: currentEmail ? 'Alterar e-mail' : 'Adicionar e-mail',
        before: currentEmail || 'não informado', after: importedEmail, identity: '', selected: true
      };
      changes.push(item); professorChanges.push(item.id);
    }

    for (const [identity, imported] of importedByIdentity) {
      const current = currentByIdentity.get(identity);
      if (!current) {
        const item = {
          id: changeId([groupKey, 'add', rowFingerprint(imported)]), type: 'add-class', professor: importedGroup.name,
          academic_period: importedGroup.academic_period, label: 'Adicionar disciplina/aula', before: '',
          after: displayRow(imported), identity, selected: true
        };
        changes.push(item); professorChanges.push(item.id); continue;
      }
      const currentHours = `${current.start_minutes ?? ''}|${current.end_minutes ?? ''}|${normalizeText(current.hours_label || '')}`;
      const importedHours = `${imported.start_minutes ?? ''}|${imported.end_minutes ?? ''}|${normalizeText(imported.hours_label || '')}`;
      if (currentHours !== importedHours) {
        const item = {
          id: changeId([groupKey, 'hours', identity, currentHours, importedHours]), type: 'hours', professor: importedGroup.name,
          academic_period: importedGroup.academic_period, label: 'Alterar horário', before: String(current.hours_label || 'não informado'),
          after: String(imported.hours_label || 'não informado'), identity, selected: true
        };
        changes.push(item); professorChanges.push(item.id);
      }
      if (normalizeText(current.room || '') !== normalizeText(imported.room || '')) {
        const item = {
          id: changeId([groupKey, 'room', identity, current.room, imported.room]), type: 'room', professor: importedGroup.name,
          academic_period: importedGroup.academic_period, label: 'Alterar sala', before: String(current.room || 'não informada'),
          after: String(imported.room || 'não informada'), identity, selected: true
        };
        changes.push(item); professorChanges.push(item.id);
      }
    }

    for (const [identity, current] of currentByIdentity) {
      if (importedByIdentity.has(identity)) continue;
      const item = {
        id: changeId([groupKey, 'remove', rowFingerprint(current)]), type: 'remove-class', professor: importedGroup.name,
        academic_period: importedGroup.academic_period, label: 'Remover disciplina/aula', before: displayRow(current),
        after: '', identity, selected: true
      };
      changes.push(item); professorChanges.push(item.id);
    }

    professors.push({
      name: importedGroup.name,
      email: importedEmail || currentEmail,
      academic_period: importedGroup.academic_period,
      action: currentGroup.rows.length ? 'update' : 'create',
      changes: professorChanges,
      unchanged: importedGroup.rows.filter(row => {
        const current = currentByIdentity.get(rowIdentity(row));
        return current && rowFingerprint(current) === rowFingerprint(row);
      }).length
    });
  }

  return {
    total_professors: professors.length,
    total_changes: changes.length,
    additions: changes.filter(item => item.type === 'add-class').length,
    removals: changes.filter(item => item.type === 'remove-class').length,
    room_changes: changes.filter(item => item.type === 'room').length,
    hour_changes: changes.filter(item => item.type === 'hours').length,
    email_changes: changes.filter(item => item.type === 'email').length,
    professors,
    changes
  };
}

function rowsToClasses(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const key = [normalizeText(row.discipline_name), Number(row.semester_number), normalizeText(row.hours_label), normalizeText(row.room)].join('|');
    const current = grouped.get(key) || {
      discipline: row.discipline_name,
      semester: row.semester_label || `${row.semester_number}º semestre`,
      days: [], hours: row.hours_label || '', room: row.room || ''
    };
    if (row.day_label && !current.days.includes(row.day_label)) current.days.push(row.day_label);
    grouped.set(key, current);
  }
  return [...grouped.values()].map(item => ({
    discipline: item.discipline,
    semester: item.semester,
    day: item.days.join(' e '),
    hours: item.hours,
    room: item.room
  }));
}

function buildEffectiveProfessorScheduleRecords(records = [], currentEntries = [], selectedChangeIds = null) {
  const plan = buildProfessorScheduleImportPlan(records, currentEntries);
  const selected = selectedChangeIds === null || selectedChangeIds === undefined
    ? new Set(plan.changes.map(item => item.id))
    : new Set((Array.isArray(selectedChangeIds) ? selectedChangeIds : []).map(String));
  const importedRows = recordsToRows(records);
  const currentRows = (Array.isArray(currentEntries) ? currentEntries : []).filter(entry => entry.active !== false);
  const importedGroups = groupRowsByProfessor(importedRows);
  const currentGroups = groupRowsByProfessor(currentRows);
  const changesByProfessor = new Map();
  for (const change of plan.changes) {
    const key = `${normalizeText(change.professor)}|${change.academic_period}`;
    const list = changesByProfessor.get(key) || [];
    list.push(change); changesByProfessor.set(key, list);
  }
  const inputByKey = new Map((records || []).map(record => [`${normalizeText(record.name)}|${String(record.academic_period || '')}`, record]));
  const effective = [];

  for (const [groupKey, importedGroup] of importedGroups) {
    const professorChanges = changesByProfessor.get(groupKey) || [];
    if (!professorChanges.some(change => selected.has(change.id))) continue;
    const currentGroup = currentGroups.get(groupKey) || { rows: [], email: '' };
    const rowMap = new Map(currentGroup.rows.map(row => [rowIdentity(row), { ...row }]));
    const importedMap = new Map(importedGroup.rows.map(row => [rowIdentity(row), row]));
    let email = String(currentGroup.email || '').trim();
    const sourceRecord = inputByKey.get(groupKey) || {};

    for (const change of professorChanges) {
      if (!selected.has(change.id)) continue;
      if (change.type === 'email') email = String(change.after || '').trim();
      else if (change.type === 'add-class') rowMap.set(change.identity, { ...importedMap.get(change.identity) });
      else if (change.type === 'remove-class') rowMap.delete(change.identity);
      else if (change.type === 'hours') {
        const current = rowMap.get(change.identity); const imported = importedMap.get(change.identity);
        if (current && imported) rowMap.set(change.identity, { ...current, start_minutes: imported.start_minutes, end_minutes: imported.end_minutes, hours_label: imported.hours_label });
      } else if (change.type === 'room') {
        const current = rowMap.get(change.identity); const imported = importedMap.get(change.identity);
        if (current && imported) rowMap.set(change.identity, { ...current, room: imported.room });
      }
    }

    if (!email && validEmail(sourceRecord.email)) email = sourceRecord.email;
    const rows = [...rowMap.values()].sort((a, b) => Number(a.day_of_week) - Number(b.day_of_week) || Number(a.start_minutes ?? 9999) - Number(b.start_minutes ?? 9999));
    effective.push({
      ...sourceRecord,
      name: importedGroup.name,
      email,
      academic_period: importedGroup.academic_period,
      semesters: [...new Set(rows.map(row => row.semester_label || `${row.semester_number}º semestre`))],
      classes: rowsToClasses(rows),
      selected_change_ids: professorChanges.filter(change => selected.has(change.id)).map(change => change.id)
    });
  }
  return { plan, records: effective, selected_change_ids: [...selected] };
}

module.exports = {
  rowIdentity,
  recordsToRows,
  buildProfessorScheduleImportPlan,
  buildEffectiveProfessorScheduleRecords
};
