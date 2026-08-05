'use strict';

const PRECEDENCE = Object.freeze({
  emergency_change: 600,
  room_change: 550,
  class_replacement: 500,
  no_classes: 450,
  partial_no_classes: 425,
  replacement_day: 400,
  recess: 350,
  warning: 200,
  regular: 100,
  historical: 10
});

function eventPrecedence(event = {}) {
  const explicit = Number(event.precedence);
  return Number.isFinite(explicit) && explicit > 0 ? explicit : (PRECEDENCE[event.event_type] || PRECEDENCE.regular);
}

function isWithinValidity(item = {}, date = '') {
  if (!date) return true;
  const from = String(item.valid_from || item.start_date || '');
  const until = String(item.valid_until || item.end_date || '');
  if (from && date < from) return false;
  if (until && date > until) return false;
  return true;
}

function eventScopeKey(event = {}) {
  return [String(event.discipline_code || '').toUpperCase(), String(event.professor_name || '').toLowerCase(), Number(event.start_minutes ?? -1), Number(event.end_minutes ?? -1)].join('|');
}

function resolveAcademicEventLayers(events = [], { date = '' } = {}) {
  const active = events.filter(event => isWithinValidity(event, date)).sort((a, b) => eventPrecedence(b) - eventPrecedence(a) || Number(b.id || 0) - Number(a.id || 0));
  const globalBlocker = active.find(event => ['no_classes', 'recess'].includes(event.event_type) && !event.discipline_code && !event.professor_name);
  if (globalBlocker) return { effective: [globalBlocker], suppressed: active.filter(item => item !== globalBlocker), winner: globalBlocker, reason: 'exceção global de maior precedência' };
  const winners = new Map(); const suppressed = [];
  for (const event of active) {
    const key = eventScopeKey(event);
    if (!winners.has(key)) winners.set(key, event); else suppressed.push(event);
  }
  const effective = [...winners.values()].sort((a, b) => eventPrecedence(b) - eventPrecedence(a));
  return { effective, suppressed, winner: effective[0] || null, reason: effective.length ? 'camadas resolvidas por precedência explícita' : 'nenhuma exceção aplicável' };
}

function filterScheduleByValidity(entries = [], date = '') {
  return entries.filter(entry => isWithinValidity(entry, date)).sort((a, b) => Number(b.precedence || PRECEDENCE.regular) - Number(a.precedence || PRECEDENCE.regular));
}

module.exports = { PRECEDENCE, eventPrecedence, isWithinValidity, resolveAcademicEventLayers, filterScheduleByValidity };
