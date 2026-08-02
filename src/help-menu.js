const { normalizeText } = require('./text');

const MENUS = Object.freeze({
  root: {
    title: 'Como posso ajudar?',
    options: [
      { label: 'Professores e horários', menu: 'professors' },
      { label: 'Curso de Sistemas de Informação', menu: 'course' },
      { label: 'TCC, estágio e atividades acadêmicas', menu: 'academic' },
      { label: 'Matrícula, documentos e SUAP', menu: 'records' },
      { label: 'Auxílios e permanência', menu: 'aid' },
      { label: 'Setores e contatos', menu: 'sectors' }
    ]
  },
  professors: {
    title: 'Professores e horários',
    options: [
      { label: 'Contato ou horário de professor', staticText: 'Digite uma pergunta com o nome do docente. Ex.: *qual o contato do professor Allan?* ou *horário da professora Amanda?*' },
      { label: 'Localização de professor', message: 'Onde está o professor — salas do IFBA' },
      { label: 'Quadro de horários de BSI', message: 'HUB — Quadro de horários 2026.2' },
      { label: 'Professor de uma disciplina', staticText: 'Digite *quem ministra* seguido da disciplina. Ex.: *quem ministra TCC I?*' }
    ]
  },
  course: {
    title: 'Curso de Sistemas de Informação',
    options: [
      { label: 'Página oficial do curso', message: 'BSI — Página oficial do curso' },
      { label: 'Qual matriz se aplica', message: 'BSI — Qual matriz curricular se aplica' },
      { label: 'PPC vigente', message: 'BSI — PPC vigente' },
      { label: 'Fluxograma e pré-requisitos', message: 'BSI — Fluxograma e pré-requisitos' },
      { label: 'Coordenação de BSI', message: 'BSI — Contato da coordenação' }
    ]
  },
  academic: {
    title: 'TCC, estágio e atividades acadêmicas',
    options: [
      { label: 'TCC', menu: 'tcc' },
      { label: 'Estágio', menu: 'internship' },
      { label: 'ACEX', message: 'BSI — Atividades Curriculares de Extensão' },
      { label: 'Atividades complementares', message: 'BSI — Atividades complementares da matriz atual' },
      { label: 'Aproveitamento de disciplinas', menu: 'recognition' }
    ]
  },
  tcc: {
    title: 'TCC de BSI',
    options: [
      { label: 'Como começar', message: 'BSI — Como iniciar o TCC I' },
      { label: 'Escolher orientador', message: 'BSI — Escolha de orientador de TCC' },
      { label: 'Defesa e documentos', message: 'BSI — Defesa e documentos do TCC' },
      { label: 'Passar para o TCC II', message: 'BSI — Passagem do TCC I para o TCC II' },
      { label: 'Regulamento completo', message: 'BSI — Regulamento de TCC' }
    ]
  },
  internship: {
    title: 'Estágio de BSI',
    options: [
      { label: 'Estágio obrigatório', message: 'Estágio — Obrigatório' },
      { label: 'Estágio não obrigatório', message: 'Estágio — Não obrigatório' },
      { label: 'Documentos do estágio', message: 'Estágio — Termo de Compromisso, Convênio e Plano' },
      { label: 'Vagas de estágio', message: 'Estágio — Oportunidades' },
      { label: 'Iniciar, encerrar ou aproveitar experiência', menu: 'internship_steps' }
    ]
  },
  internship_steps: {
    title: 'Etapas do estágio',
    options: [
      { label: 'Começar estágio', message: 'Estágio — Como iniciar' },
      { label: 'Aproveitar experiência profissional', message: 'Estágio — Aproveitamento de experiência profissional' },
      { label: 'Encerrar ou prorrogar', message: 'Estágio — Encerramento antecipado' },
      { label: 'Entregar relatório', message: 'Estágio — Conclusão do obrigatório' }
    ]
  },
  recognition: {
    title: 'Aproveitamento acadêmico',
    options: [
      { label: 'Disciplina cursada em outra instituição', message: 'BSI — Aproveitamento de estudos' },
      { label: 'Conhecimentos ou experiência prévios', message: 'BSI — Aproveitamento de conhecimentos prévios' }
    ]
  },
  records: {
    title: 'Matrícula, documentos e SUAP',
    options: [
      { label: 'Acessar o SUAP', message: 'SUAP — Acessar o sistema' },
      { label: 'Recuperar senha', message: 'SUAP — Esqueci a senha' },
      { label: 'Notas e faltas', message: 'SUAP — Consultar notas e faltas' },
      { label: 'Histórico e documentos', message: 'SUAP — Documentos e histórico' },
      { label: 'Trancamento e cancelamento', message: 'BSI — Trancamento ou cancelamento de componente' }
    ]
  },
  aid: {
    title: 'Auxílios e permanência',
    options: [
      { label: 'O que é o PAAE', message: 'PAAE — O que é' },
      { label: 'Bolsas e auxílios', message: 'PAAE — Bolsas e auxílios' },
      { label: 'Editais atuais', message: 'PAAE — Editais atuais' },
      { label: 'Resultado do PAAE', message: 'PAAE — Consultar resultado' },
      { label: 'Psicologia e permanência', message: 'Psicologia — Apoio ao estudante' }
    ]
  },
  sectors: {
    title: 'Setores e contatos',
    options: [
      { label: 'CAENS', staticText: 'Digite *contato da CAENS*, *onde fica a CAENS?* ou *o que a CAENS resolve?*' },
      { label: 'CORES', staticText: 'Digite *contato da CORES*, *onde fica a CORES?* ou *o que a CORES resolve?*' },
      { label: 'Biblioteca', staticText: 'Digite *contato da Biblioteca*, *onde fica a Biblioteca?* ou *quais serviços a Biblioteca oferece?*' },
      { label: 'CAPNE', staticText: 'Digite *contato da CAPNE* ou *o que a CAPNE atende?*' },
      { label: 'Outros setores', staticText: 'Digite *contato* seguido da sigla ou do nome do setor. Ex.: *contato da CGTI?*' }
    ]
  }
});

function menuCandidates(menuKey, messages = []) {
  const menu = MENUS[menuKey];
  if (!menu) return [];
  const byTitle = new Map(messages.map(item => [normalizeText(item.title), item]));
  return menu.options.map((option, index) => {
    if (option.menu) return {
      kind: 'submenu', label: option.label, submenuKey: option.menu,
      item: { id: `menu:${menuKey}:${index}`, title: option.label, topic: menu.title, response_text: '' },
      score: 100, reasons: [`submenu ${option.menu}`]
    };
    if (option.message) {
      const item = byTitle.get(normalizeText(option.message));
      if (!item) return null;
      return { kind: 'message', label: option.label, item: { ...item, topic: item.topic || item.title }, score: 100, reasons: [`menu ${menuKey}`] };
    }
    return {
      kind: 'static', label: option.label,
      item: { id: `static:${menuKey}:${index}`, title: option.label, topic: menu.title, response_text: option.staticText || '' },
      score: 100, reasons: [`orientação do menu ${menuKey}`]
    };
  }).filter(Boolean).slice(0, 6);
}

function formatMenu(menuKey, candidates, timeoutSeconds = 120) {
  const menu = MENUS[menuKey];
  if (!menu) return '';
  return [`🧭 *${menu.title}*`, '', ...candidates.map((candidate, index) => `${index + 1}. ${candidate.label || candidate.item.title}`), '', `Responda apenas com o número em até ${timeoutSeconds} segundos.`].join('\n');
}

module.exports = { MENUS, menuCandidates, formatMenu };
