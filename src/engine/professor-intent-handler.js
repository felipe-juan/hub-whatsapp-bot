'use strict';
const { requestedProfessorFields, professorIntentLabel, formatProfessorFieldResponse, isProfessorPrivatePhoneRequest, formatProfessorPhonePrivacyResponse } = require('../professor-card-response');

const DISCIPLINE_FIELD_ORDER = Object.freeze(['professor', 'contact', 'discipline', 'semester', 'day', 'hours', 'room']);

function requestedDisciplineFields(text) {
  const requested = new Set(requestedProfessorFields(text));
  return DISCIPLINE_FIELD_ORDER.filter(field => requested.has(field));
}

module.exports = { requestedProfessorFields, requestedDisciplineFields, professorIntentLabel, formatProfessorFieldResponse, isProfessorPrivatePhoneRequest, formatProfessorPhonePrivacyResponse };
