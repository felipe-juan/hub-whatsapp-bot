const { normalizeText } = require('./text');

const FLOW_DEFINITIONS = Object.freeze([
  {
    key: 'stage', title: 'Estágio de BSI',
    triggers: ['quero começar meu estágio', 'preciso de ajuda com estágio', 'como funciona o estágio de bsi', 'ajuda com estágio de sistemas de informação'],
    options: [
      ['Estágio obrigatório', 'Estágio — Obrigatório'],
      ['Estágio não obrigatório', 'Estágio — Não obrigatório'],
      ['Aproveitar experiência profissional', 'Estágio — Aproveitamento de experiência profissional'],
      ['Encerrar ou prorrogar estágio', 'Estágio — Encerramento antecipado'],
      ['Entregar relatório', 'Estágio — Conclusão do obrigatório']
    ]
  },
  {
    key: 'tcc', title: 'TCC de BSI',
    triggers: ['preciso de ajuda com o tcc', 'como funciona o tcc de bsi', 'quero começar meu tcc', 'ajuda com tcc de sistemas de informação'],
    options: [
      ['Iniciar o TCC I', 'BSI — Como iniciar o TCC I'],
      ['Escolher orientador', 'BSI — Escolha de orientador de TCC'],
      ['Marcar defesa e documentos', 'BSI — Defesa e documentos do TCC'],
      ['Artigo ou monografia', 'BSI — Formato do TCC'],
      ['Depois da aprovação', 'BSI — Depois da aprovação do TCC']
    ]
  },
  {
    key: 'activities', title: 'Atividades acadêmicas de BSI',
    triggers: ['ajuda com atividades complementares', 'dúvida sobre atividades complementares', 'duvida sobre atividades complementares', 'ajuda com acex'],
    options: [
      ['ACEX ou atividade complementar', 'BSI — ACEX ou atividade complementar'],
      ['Atividades da matriz atual', 'BSI — Atividades complementares da matriz atual'],
      ['Atividades de matrizes anteriores', 'BSI — Atividades complementares de matrizes anteriores'],
      ['Regulamento de ACEX', 'BSI — Atividades Curriculares de Extensão'],
      ['Regulamentos do curso', 'BSI — Regulamentos específicos']
    ]
  },
  {
    key: 'suap', title: 'Ajuda com o SUAP',
    triggers: ['estou com problema no suap', 'preciso de ajuda com o suap', 'suap não funciona', 'duvida sobre o suap', 'dúvida sobre o suap'],
    options: [
      ['Acessar o SUAP', 'SUAP — Acessar o sistema'],
      ['Recuperar senha', 'SUAP — Esqueci a senha'],
      ['Consultar notas e faltas', 'SUAP — Consultar notas e faltas'],
      ['Documentos e histórico', 'SUAP — Documentos e histórico'],
      ['Suporte técnico', 'CGTI — Suporte técnico e contas']
    ]
  },
  {
    key: 'aid', title: 'Auxílios estudantis',
    triggers: ['quero saber sobre auxílios', 'preciso de auxílio estudantil', 'ajuda com o paae', 'quais auxílios existem'],
    options: [
      ['O que é o PAAE', 'PAAE — O que é'],
      ['Bolsas e tipos de auxílio', 'PAAE — Bolsas e auxílios'],
      ['Quem pode participar', 'PAAE — Quem pode participar'],
      ['Editais vigentes', 'PAAE — Editais atuais'],
      ['Consultar resultado', 'PAAE — Consultar resultado']
    ]
  }
]);

function classifyGuidedFlow(text) {
  const raw = String(text || '').trim();
  const hasQuestion = /\?\s*$/.test(raw);
  const normalized = normalizeText(raw.replace(/[?]+\s*$/, ''));
  for (const flow of FLOW_DEFINITIONS) {
    for (const trigger of flow.triggers) {
      const t = normalizeText(trigger);
      if (normalized === t || (hasQuestion && normalized.includes(t))) return flow;
    }
  }
  return null;
}
function formatFlowMenu(flow, timeoutSeconds = 120) {
  return [`🧭 *${flow.title}*`, '', ...flow.options.map((item, index) => `${index + 1}. ${item[0]}`), '', `Responda apenas com o número em até ${timeoutSeconds} segundos.`].join('\n');
}
module.exports = { FLOW_DEFINITIONS, classifyGuidedFlow, formatFlowMenu };
