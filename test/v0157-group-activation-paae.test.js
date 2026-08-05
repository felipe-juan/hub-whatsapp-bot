'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveGroupActivation } = require('../src/group-activation');
const { STUDENT_ASSISTANCE_CARDS } = require('../src/content/student-assistance');
const { evaluateTrigger } = require('../src/trigger-rules');

test('group activation accepts prefix, mention, leading dot or reply to bot', () => {
  const cases = [
    ['Bot qual sala de LPI?', false, 'qual sala de LPI?', 'name-prefix'],
    ['ROBÔ, qual sala?', false, 'qual sala?', 'name-prefix'],
    ['Escravo do Juan: horários semestre 2', false, 'horários semestre 2', 'name-prefix'],
    ['.qual sala de LPI?', false, 'qual sala de LPI?', 'dot'],
    ['. qual sala de LPI?', false, 'qual sala de LPI?', 'dot'],
    ['qual sala de LPI? @5577999999999', true, 'qual sala de LPI?', 'mention']
  ];
  for (const [body, mentionedMe, expected, mode] of cases) {
    const result = resolveGroupActivation({ isGroup: true, body, mentionedMe, ownMentionNumbers: ['5577999999999'] });
    assert.equal(result.active, true);
    assert.equal(result.body, expected);
    assert.equal(result.mode, mode);
  }
  assert.equal(resolveGroupActivation({ isGroup: true, body: 'qual sala de LPI?' }).active, false);
  const reply = resolveGroupActivation({ isGroup: true, body: 'e a sala?', quotedFromMe: true });
  assert.equal(reply.active, true);
  assert.equal(reply.mode, 'reply-to-bot');
  assert.equal(resolveGroupActivation({ isGroup: false, body: 'qual sala de LPI?' }).active, true);
});

test('PAAE cards include direct and contextual aid triggers', () => {
  const overview = STUDENT_ASSISTANCE_CARDS.find(item => item.key === 'ifba-bsi-v095-paae-bolsas-e-auxilios').message;
  const timeline = STUDENT_ASSISTANCE_CARDS.find(item => item.key === 'ifba-bsi-v0157-paae-valores-cronograma').message;
  for (const phrase of ['auxílio', 'paae', 'como recebo os auxílios?']) assert.equal(evaluateTrigger(phrase, overview).matched, true, phrase);
  for (const phrase of ['quanto é o auxílio?', 'quando sai o resultado do paae?', 'como foi o último paae?']) assert.equal(evaluateTrigger(phrase, timeline).matched, true, phrase);
});
