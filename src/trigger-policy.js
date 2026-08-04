'use strict';
const { normalizeText } = require('./text');
const CATEGORIES = Object.freeze({ EXACT:'exact_isolated', ENTITY:'entity', INTENT:'intent', SAFE:'safe_phrase', RISKY:'risky_short', NEGATION:'contextual_block', CONTINUATION:'continuation' });
const TRIGGER_POLICY_TYPES = Object.freeze({
  [CATEGORIES.EXACT]: { description: 'Só dispara quando a frase ocupa a mensagem inteira.' },
  [CATEGORIES.ENTITY]: { description: 'Reconhece uma entidade, como professor ou setor, e considera o contexto.' },
  [CATEGORIES.INTENT]: { description: 'Define a informação solicitada, como sala, horário ou contato.' },
  [CATEGORIES.SAFE]: { description: 'Frase suficientemente específica para aparecer em mensagens maiores.' },
  [CATEGORIES.RISKY]: { description: 'Termo curto protegido, aceito isoladamente ou em comandos seguros.' },
  [CATEGORIES.NEGATION]: { description: 'Bloqueio contextual que evita respostas inadequadas.' },
  [CATEGORIES.CONTINUATION]: { description: 'Continuação curta que exige contexto anterior válido.' },
  observation: { description: 'Registra ocorrências no diagnóstico, mas ainda não responde.' }
});
const RISKY = new Set(['final','protocolo','calendario','calendário','ppc','suap','caens','cores','capne']);
function classifyTriggerPolicy(item = {}) {
  const trigger = item.trigger || {}; const title = normalizeText(item.title || '');
  if (item.observation_mode) return { category:'observation', responds:false, label:'Observação' };
  if ((trigger.exact_phrases || []).length && !(trigger.sentences || []).length) return { category:CATEGORIES.EXACT, responds:true, label:'Exato isolado' };
  if (title.startsWith('professor ')) return { category:CATEGORIES.ENTITY, responds:true, label:'Entidade docente' };
  const terms=[...(trigger.sentences||[]),...(trigger.keywords||[])].map(normalizeText);
  if (terms.some(t=>RISKY.has(t))) return { category:CATEGORIES.RISKY, responds:true, label:'Curto protegido' };
  return { category:CATEGORIES.SAFE, responds:true, label:'Frase segura' };
}
module.exports = { CATEGORIES, TRIGGER_POLICY_TYPES, classifyTriggerPolicy };
