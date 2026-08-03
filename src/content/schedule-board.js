const SCHEDULE_BOARD_V0812 = Object.freeze({
  "title": "HUB — Quadro de horários 2026.2",
  "tags": [
    "hub",
    "quadro-de-horarios",
    "horarios",
    "turmas",
    "2026-2"
  ],
  "priority": 46,
  "sentences": [
    "quadro de horários",
    "quadro de aulas",
    "horário das turmas",
    "horários das turmas",
    "planilha de horários",
    "planilha dos horários",
    "grade de horários",
    "grade de aulas",
    "horário geral do curso",
    "horários gerais do curso",
    "horário de sistemas de informação",
    "horário do curso de sistemas de informação",
    "horário de si",
    "onde vejo o quadro de horários",
    "onde encontro o quadro de horários",
    "link do quadro de horários",
    "link dos horários das turmas"
  ],
  "response_text": "*Quadro de horários — 2026.2*\n\n🗓️ Consulte a planilha com os horários das turmas e docentes:\nhttps://ifbaedubr-my.sharepoint.com/:x:/g/personal/rodrigobonfim_ifba_edu_br/IQCqjeOoMcvWQoiikRSUwWOxAZSOwJaih1qWmWFq5Vxa73Y",
  "source_url": "https://portal.ifba.edu.br/conquista/menu-ensino/horarios-de-aula-2",
  "source_title": "Horários de aula — IFBA Vitória da Conquista",
  "verified_at": "2026-08-01"
});


const SEMESTER_DAY_SCHEDULE_CARD_V0106 = Object.freeze({
  key: 'hub-bsi-aulas-semestre-dia-v0106',
  message: {
    title: 'BSI — Aulas por semestre e dia',
    response_text: [
      '*Aulas de BSI por semestre e dia*', '',
      'Informe um dia e o semestre para consultar disciplina, sala e professor.', '',
      'O semestre pode ser escrito como `2 semestre`, `2º semestre` ou `segundo semestre`.', '',
      'Exemplos:',
      '• qual é a aula de hoje para o terceiro semestre?',
      '• aulas de amanhã do 5º semestre',
      '• segunda-feira 2 semestre',
      '• qual matéria tem sexta-feira no primeiro semestre?'
    ].join('\n'),
    priority: 72,
    active: true,
    archived: false,
    scope: 'both',
    trigger: {
      match_mode: 'all',
      sentences: [
        'aulas por semestre e dia', 'consultar aulas do semestre',
        'aula de hoje por semestre', 'horário do semestre por dia'
      ],
      keywords: [], required_words: [], excluded_words: [], exact_phrases: [],
      require_question_mark: true, typo_tolerance: 1, synonym_group_ids: [],
      negative_examples: [], regex_pattern: '', regex_flags: 'iu'
    }
  }
});

module.exports = { SCHEDULE_BOARD_V0812, SEMESTER_DAY_SCHEDULE_CARD_V0106 };
