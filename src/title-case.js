'use strict';

const SMALL_WORDS = new Set([
  'a','as','o','os','de','da','das','do','dos','e','em','no','na','nos','nas','por','para','com','sem','sob','sobre','entre','ou','ao','aos','à','às'
]);

function titleWord(word, index, words) {
  const raw = String(word || '');
  if (!raw) return raw;
  const clean = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}?!.:]+$/gu, '');
  const lower = clean.toLocaleLowerCase('pt-BR');
  const preserve = /^[A-Z0-9]{2,}(?:-[A-Z0-9]+)*$/u.test(clean)
    || /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X)$/u.test(clean)
    || /^\d+[ºª°]?$/u.test(clean);
  if (preserve) return raw;
  const firstSignificant = index === 0 || /(?:—|–|-|:)$/.test(String(words[index - 1] || ''));
  if (!firstSignificant && SMALL_WORDS.has(lower)) return raw.replace(clean, lower);
  const converted = lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
  return raw.replace(clean, converted);
}

function toPortugueseTitleCase(value) {
  const source = String(value || '').trim().replace(/\s+/g, ' ');
  if (!source) return '';
  const words = source.split(' ');
  return words.map((word, index) => titleWord(word, index, words)).join(' ');
}

module.exports = { toPortugueseTitleCase, SMALL_WORDS };
