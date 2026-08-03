'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PRIVATE_CONTENT_PATH = path.resolve(__dirname, '..', 'private-content.json');

function readPrivateContent() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PRIVATE_CONTENT_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function digits(value) { return String(value || '').replace(/\D/g, ''); }

function felipeJuanPhone() {
  return digits(readPrivateContent()?.community?.felipe_juan?.phone || '');
}

function formatBrazilianMobile(value) {
  const phone = digits(value);
  const national = phone.startsWith('55') && phone.length === 13 ? phone.slice(2) : phone;
  if (national.length !== 11) return String(value || '').trim();
  return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
}

function injectFelipeJuanPhone(response, phone = felipeJuanPhone()) {
  const source = String(response || '').trim();
  const cleanPhone = digits(phone);
  if (!source || !cleanPhone) return source;
  const formatted = formatBrazilianMobile(cleanPhone);
  if (!formatted || source.includes(formatted)) return source;

  const lines = source.split('\n');
  const insertion = ['', '📱 *Contato*', formatted];
  const roleIndex = lines.findIndex(line => /Diretor-geral do Diretório Acadêmico de Sistemas de Informação/u.test(line));
  if (roleIndex >= 0) lines.splice(roleIndex + 1, 0, ...insertion);
  else lines.splice(1, 0, ...insertion);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = {
  PRIVATE_CONTENT_PATH,
  readPrivateContent,
  felipeJuanPhone,
  formatBrazilianMobile,
  injectFelipeJuanPhone
};
