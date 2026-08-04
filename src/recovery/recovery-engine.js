'use strict';

const { normalizeText } = require('../text');
const { assessAcademicQuestion, missingQuestion } = require('./academic-interpreter');
const { relatedCardCandidates } = require('./card-search');
const { examplesFor } = require('./dynamic-examples');

function optionList(candidates = [], includeNone = true) {
  const lines = candidates.map((candidate, index) => `${index + 1}. ${candidate.label || candidate.item?.title || 'Opção'}`);
  if (includeNone) lines.push(`${lines.length + 1}. Nenhuma dessas`);
  return lines.join('\n');
}

function clarificationEvaluation(assessment, context = {}) {
  const question = missingQuestion(assessment);
  if (!question) return null;
  return {
    matched: true, type: 'recovery_clarification', text: question,
    signature: `recovery-clarification:${assessment.primaryIntent}:${assessment.missing[0]}`,
    matchedItem: 'Recuperação — informação ausente', topic: 'Recuperação de conversa',
    detectedIntent: assessment.primaryIntent, reasons: ['intenção parcialmente compreendida', `informação ausente: ${assessment.missing[0]}`],
    candidates: [], conflict: false, redactLog: false, analysis: [], attachment: null, context: { ...context },
    recoveryMetadata: { stage: 1, outcome: 'clarification', intent: assessment.primaryIntent, optionCount: 0 },
    contextSubject: {
      kind: 'recovery_prompt', title: 'Pergunta complementar', expected: assessment.missing[0],
      originalMessage: assessment.originalMessage || context.originalMessage || '', primaryIntent: assessment.primaryIntent,
      targetDate: assessment.targetDate?.iso || '', semester: assessment.semester || 0
    }
  };
}

function suggestionsEvaluation(message, candidates = [], context = {}, stage = 1) {
  if (!candidates.length) return null;
  const pending = [...candidates, {
    kind: 'none', label: 'Nenhuma dessas', item: { id: 'none', title: 'Nenhuma dessas', topic: 'Recuperação', response_text: '' },
    score: 0, reasons: ['saída da lista']
  }];
  const text = candidates.length === 1
    ? `Acho que você está procurando *${candidates[0].label || candidates[0].item?.title}*. É isso?\n\n1. Sim — ${candidates[0].label || candidates[0].item?.title}\n2. Ver outras opções\n\nResponda com 1 ou 2.`
    : `Encontrei estes assuntos relacionados:\n\n${optionList(candidates)}\n\nResponda com o número, o nome da opção ou “nenhuma dessas”.`;
  if (candidates.length === 1) {
    pending[0] = { ...pending[0], label: `Sim — ${pending[0].label || pending[0].item?.title}`, aliases: ['sim', 'isso', 'correto'] };
    pending[1] = { ...pending[1], label: 'Ver outras opções', aliases: ['nao', 'não', 'ver outras opções'], item: { ...pending[1].item, title: 'Ver outras opções' } };
  }
  return {
    matched: true, type: 'disambiguation', text,
    signature: `recovery-suggestions:${candidates.map(item => item.item?.id || item.item?.title).join('|')}`,
    matchedItem: candidates.map(item => item.item?.title).join(', '), topic: 'Recuperação de conversa',
    reasons: ['resultados relacionados à mensagem'], candidates: pending.map(item => ({ kind: item.kind, id: item.item?.id, title: item.item?.title })),
    conflict: true, redactLog: false, analysis: [], attachment: null, context: { ...context }, pendingCandidates: pending,
    recoveryMetadata: { stage, outcome: 'suggestions', intent: '', optionCount: candidates.length, originalMessage: message }
  };
}


function firstFailureCandidates() {
  return [
    { kind: 'static', label: 'Saber a sala de uma disciplina', aliases: ['sala'], item: { id: 'recovery:first:room', title: 'Sala de uma disciplina', topic: 'Recuperação', response_text: 'De qual disciplina você quer saber a sala?' },
      contextSubject: { kind: 'recovery_prompt', expected: 'discipline', originalMessage: 'qual sala de', primaryIntent: 'room', title: 'Complementar disciplina' } },
    { kind: 'static', label: 'Consultar professor ou contato', aliases: ['professor', 'contato'], item: { id: 'recovery:first:professor', title: 'Professor ou contato', topic: 'Recuperação', response_text: 'Qual é o nome do professor ou da disciplina?' },
      contextSubject: { kind: 'recovery_prompt', expected: 'subject', originalMessage: 'contato do professor de', primaryIntent: 'contact', title: 'Complementar professor ou disciplina' } },
    { kind: 'static', label: 'Ver aulas ou horários', aliases: ['horario', 'horário', 'aulas'], item: { id: 'recovery:first:schedule', title: 'Aulas e horários', topic: 'Recuperação', response_text: 'Você quer consultar as aulas de qual semestre ou disciplina?' },
      contextSubject: { kind: 'recovery_prompt', expected: 'subject', originalMessage: 'horario de', primaryIntent: 'schedule', title: 'Complementar semestre ou disciplina' } },
    { kind: 'none', label: 'Nenhuma dessas', item: { id: 'none', title: 'Nenhuma dessas', topic: 'Recuperação', response_text: '' } }
  ];
}

function firstFailureEvaluation(message, context = {}) {
  const candidates = firstFailureCandidates();
  return {
    matched: true, type: 'recovery_menu',
    text: ['Não consegui identificar exatamente. Você está procurando:', '',
      '1. Saber a sala de uma disciplina', '2. Consultar professor ou contato', '3. Ver aulas ou horários', '4. Nenhuma dessas', '',
      'Responda somente com o número ou descreva o assunto em uma frase curta.'].join('\n'),
    signature: 'recovery-menu:stage1', matchedItem: 'Recuperação — primeira tentativa', topic: 'Recuperação de conversa',
    reasons: ['primeira tentativa sem informação suficiente'], candidates: candidates.map(item => ({ kind: item.kind, id: item.item.id, title: item.item.title })),
    conflict: false, redactLog: false, analysis: [], attachment: null, context: { ...context }, pendingCandidates: candidates,
    recoveryMetadata: { stage: 1, outcome: 'first_failure_prompt', optionCount: 4, originalMessage: message },
    contextSubject: { kind: 'recovery_categories', title: 'Primeira recuperação', originalMessage: message, stage: 1 }
  };
}

function broadHelpText(message, stage = 2) {
  const examples = examplesFor(message);
  const lines = [
    stage >= 3 ? 'Ainda não consegui localizar o assunto.' : 'Você está procurando:', '',
    '1. Aulas, salas e horários',
    '2. Professores e contatos',
    '3. Setores do IFBA',
    '4. Documentos e regulamentos',
    '5. BSI, estágio e TCC',
    '6. Calculadora da final',
    '7. Ver todos os assuntos',
    stage >= 3 ? '8. Atendimento e encaminhamento' : '8. Nenhuma dessas', '',
    'Responda somente com o número.'
  ];
  if (stage >= 3) lines.push('', `Exemplos: ${examples.map(item => `“${item}”`).join('; ')}.`);
  return lines.join('\n');
}


function categoryCandidates(stage = 2) {
  const candidates = [
    { kind: 'submenu', label: 'Aulas, salas e horários', submenuKey: 'professors', item: { id: 'category:classes', title: 'Aulas, salas e horários', topic: 'Ajuda' } },
    { kind: 'submenu', label: 'Professores e contatos', submenuKey: 'professors', item: { id: 'category:professors', title: 'Professores e contatos', topic: 'Ajuda' } },
    { kind: 'submenu', label: 'Setores do IFBA', submenuKey: 'sectors', item: { id: 'category:sectors', title: 'Setores do IFBA', topic: 'Ajuda' } },
    { kind: 'submenu', label: 'Documentos e regulamentos', submenuKey: 'records', item: { id: 'category:records', title: 'Documentos e regulamentos', topic: 'Ajuda' } },
    { kind: 'submenu', label: 'BSI, estágio e TCC', submenuKey: 'academic', item: { id: 'category:academic', title: 'BSI, estágio e TCC', topic: 'Ajuda' } },
    { kind: 'static', label: 'Calculadora da final', item: { id: 'category:calculator', title: 'Calculadora da final', topic: 'Calculadoras', response_text: 'Para calcular a nota da final, envie por exemplo: `!final 6,9`.' } },
    { kind: 'submenu', label: 'Ver todos os assuntos', submenuKey: 'root', item: { id: 'category:all', title: 'Ver todos os assuntos', topic: 'Ajuda' } },
    { kind: 'static', label: stage >= 3 ? 'Atendimento e encaminhamento' : 'Nenhuma dessas', item: { id: 'category:other', title: 'Outro assunto', topic: 'Recuperação', response_text: 'Descreva em uma frase curta o que você precisa resolver. Vou procurar o assunto ou o setor mais adequado.' },
      contextSubject: { kind: 'recovery_prompt', expected: 'subject', originalMessage: 'preciso de atendimento para', primaryIntent: 'contact', title: 'Encaminhamento por setor' } }
  ];
  return candidates;
}

function recoveryEvaluation(message, { prepared, snapshot, context = {}, failures = 0, maxSuggestions = 3 } = {}) {
  const assessment = assessAcademicQuestion(message, { prepared, snapshot, now: context.now || Date.now() });
  assessment.originalMessage = message;
  if (assessment.matched && assessment.missing?.length) return clarificationEvaluation(assessment, { ...context, originalMessage: message });

  const candidates = relatedCardCandidates(message, snapshot?.messages || [], { limit: maxSuggestions });
  if (candidates.length) {
    const first = candidates[0]; const second = candidates[1];
    if (first.confidence >= Number(first.directThreshold || 0.82) && (!second || first.confidence - second.confidence >= 0.15)) {
      return {
        matched: true, type: 'message', text: String(first.item?.response_text || ''),
        signature: `recovery-direct:${first.item?.id || first.item?.title}`, matchedItem: first.item?.title || 'Resultado relacionado',
        topic: first.item?.topic || first.item?.title || 'Recuperação de conversa', attachment: first.item?.attachment || null,
        details_text: first.item?.details_text || '', source_url: first.item?.source_url || '', source_title: first.item?.source_title || '', verified_at: first.item?.verified_at || '',
        reasons: ['resultado relacionado com confiança alta', ...(first.reasons || [])], candidates: [{ kind: 'message', id: first.item?.id, title: first.item?.title }],
        conflict: false, redactLog: false, analysis: [], context: { ...context }, detectedIntent: assessment.primaryIntent || '',
        recoveryMetadata: { stage: Math.min(2, failures + 1), outcome: 'direct', optionCount: 1, originalMessage: message },
        contextSubject: { kind: 'message', id: Number(first.item?.id || 0), title: first.item?.title || '', topic: first.item?.topic || first.item?.title || '',
          details_text: first.item?.details_text || '', source_url: first.item?.source_url || '', source_title: first.item?.source_title || '', verified_at: first.item?.verified_at || '' }
      };
    }
    return suggestionsEvaluation(message, candidates, context, Math.min(2, failures + 1));
  }

  if (failures <= 0) return firstFailureEvaluation(message, context);
  const stage = failures >= 2 ? 3 : 2;
  const categoryOptions = categoryCandidates(stage);
  return {
    matched: true, type: 'recovery_menu', text: broadHelpText(message, stage), signature: `recovery-menu:stage${stage}`,
    matchedItem: stage >= 3 ? 'Recuperação — menu completo' : 'Recuperação — categorias', topic: 'Recuperação de conversa',
    reasons: [stage >= 3 ? 'terceira tentativa sem resolução' : 'nenhum resultado direto; categorias oferecidas'],
    candidates: categoryOptions.map(item => ({ kind: item.kind, id: item.item.id, title: item.item.title })), conflict: false,
    redactLog: false, analysis: [], attachment: null, context: { ...context }, pendingCandidates: categoryOptions,
    recoveryMetadata: { stage, outcome: stage >= 3 ? 'menu' : 'categories', optionCount: categoryOptions.length, originalMessage: message },
    contextSubject: { kind: stage >= 3 ? 'recovery_menu' : 'recovery_categories', title: 'Categorias de ajuda', originalMessage: message, stage }
  };
}

module.exports = { recoveryEvaluation, clarificationEvaluation, suggestionsEvaluation, broadHelpText, categoryCandidates, firstFailureCandidates, firstFailureEvaluation };
