'use strict';

const { resolveGroupActivation } = require('../group-activation');

function resolveIncomingActivation(message, { engine = null, fragmentPending = false } = {}) {
  const isGroup = Boolean(message?.isGroup || String(message?.from || '').endsWith('@g.us'));
  const originalBody = String(message?.body || '').trim();
  let activation = resolveGroupActivation({ ...message, isGroup });
  if (isGroup && !activation.active) {
    const pendingChoice = Boolean(engine?.canResolvePendingChoice?.(message, originalBody));
    const pendingPrompt = Boolean(engine?.canResolvePromptContext?.(message, originalBody));
    if (pendingChoice || pendingPrompt || fragmentPending) {
      activation = { active: true, body: originalBody, mode: pendingChoice ? 'pending-choice' : pendingPrompt ? 'pending-prompt' : 'fragment-continuation' };
    }
  }
  return { ...activation, isGroup, originalBody };
}

function applyIncomingActivation(message, activation) {
  message.originalBody = message.originalBody || message.body;
  message.body = activation.body;
  message.groupActivationMode = activation.mode;
  message.activationResolved = true;
  if (activation.isGroup) message.groupActivated = true;
  return message;
}

module.exports = { resolveIncomingActivation, applyIncomingActivation };
