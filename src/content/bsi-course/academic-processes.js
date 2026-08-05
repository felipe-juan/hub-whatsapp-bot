'use strict';

const BSI_ACADEMIC_PROCESSES_CARDS = Object.freeze([
  {
    "key": "ifba-bsi-v098-aproveitamento-estudos",
    "message": {
      "title": "BSI — Aproveitamento de estudos",
      "response_text": "📘 *Aproveitamento de estudos*\n\nA solicitação será analisada pela equivalência entre os componentes e pela documentação apresentada. Consulte o procedimento vigente e confirme com a CORES ou a Coordenação quais documentos devem acompanhar o pedido; podem ser exigidos histórico e ementa ou programa da disciplina cursada.",
      "details_text": "",
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/regulamentos/gerais/normas-academicas-ensino-superior-resolucaoo-23-2019-consepe.pdf/view",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "priority": 64,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "aproveitamento",
        "equivalencia"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como aproveitar disciplina de outra faculdade em bsi",
          "posso dispensar uma matéria que já cursei",
          "como pedir equivalência de disciplina em bsi",
          "aproveitamento de estudos em sistemas de informação"
        ],
        "keywords": [],
        "required_words": [],
        "excluded_words": [],
        "exact_phrases": [],
        "require_question_mark": true,
        "regex_pattern": "",
        "regex_flags": "iu",
        "typo_tolerance": 0,
        "synonym_group_ids": [],
        "negative_examples": []
      }
    },
    "legacyGroup": "v098"
  },
  {
    "key": "ifba-bsi-v098-conhecimentos-previos",
    "message": {
      "title": "BSI — Aproveitamento de conhecimentos prévios",
      "response_text": "🧠 *Aproveitamento de conhecimentos prévios*\n\nÉ diferente do aproveitamento de disciplina já cursada. A Resolução CONSEPE nº 153/2024 regulamenta a avaliação de conhecimentos adquiridos por experiência profissional, cursos ou outras formas de aprendizagem. Consulte o período e o procedimento vigente com a Coordenação.",
      "details_text": "",
      "source_url": "https://portal.ifba.edu.br/conquista/nota-ifba-regulamenta-aproveitamento-de-conhecimentos-previos-no-ensino-superior",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "priority": 64,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "conhecimentos-previos",
        "aproveitamento"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "posso eliminar disciplina por experiência profissional em bsi",
          "aproveitamento de conhecimentos prévios em bsi",
          "já trabalho na área posso dispensar matéria",
          "posso fazer prova para eliminar disciplina em bsi"
        ],
        "keywords": [],
        "required_words": [],
        "excluded_words": [],
        "exact_phrases": [],
        "require_question_mark": true,
        "regex_pattern": "",
        "regex_flags": "iu",
        "typo_tolerance": 0,
        "synonym_group_ids": [],
        "negative_examples": []
      }
    },
    "legacyGroup": "v098"
  },
  {
    "key": "ifba-bsi-v098-trancamento-curso",
    "message": {
      "title": "Graduação — Como trancar o curso",
      "response_text": "🎓 *Como trancar o curso de graduação no IFBA*\n\nA solicitação deve ser feita à *CORES*, dentro do prazo previsto no Calendário Acadêmico do campus. Confirme com o setor o requerimento e os documentos exigidos no semestre atual.\n\n*Regras principais*\n• Não é permitido trancar no primeiro semestre letivo.\n• Trancamento total: no máximo 2 semestres, consecutivos ou alternados.\n• Trancamento parcial: no máximo 2 vezes por disciplina, permanecendo matriculado em pelo menos 3 disciplinas.\n• Também não é concedido no primeiro semestre após reintegração nem no primeiro semestre de estudante transferido.\n\n📞 *CORES — Vitória da Conquista*\nWhatsApp: (77) 99929-9331\nE-mail: coresvc@ifba.edu.br\nAtendimento presencial: segunda a sexta-feira, das 7h às 19h.\n\n📅 *Calendário Acadêmico*\nhttps://portal.ifba.edu.br/conquista/ensino/calendario-academico",
      "details_text": "",
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/regulamentos/gerais/normas-academicas-ensino-superior-resolucaoo-23-2019-consepe.pdf/view",
      "source_title": "Normas Acadêmicas dos Cursos Superiores — Resolução nº 23/2019",
      "verified_at": "2026-08-03",
      "priority": 78,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como trancar o curso",
          "como trancar a faculdade",
          "como trancar a graduação",
          "como trancar sistemas de informação",
          "como trancar o curso de sistemas de informação",
          "quero trancar o curso",
          "quero trancar a faculdade",
          "quero trancar bsi no ifba",
          "posso trancar o curso",
          "onde peço trancamento",
          "onde pedir trancamento",
          "como pedir trancamento total",
          "como pedir trancamento parcial",
          "trancamento do curso",
          "trancamento do curso de bsi",
          "trancamento de matrícula da graduação",
          "trancar uma disciplina",
          "trancamento parcial de disciplina"
        ],
        "keywords": [],
        "required_words": [],
        "excluded_words": [
          "cancelar matrícula",
          "cancelamento"
        ],
        "exact_phrases": [],
        "require_question_mark": true,
        "regex_pattern": "",
        "regex_flags": "iu",
        "typo_tolerance": 1,
        "synonym_group_ids": [],
        "negative_examples": []
      }
    },
    "legacyGroup": "v098"
  },
  {
    "key": "ifba-bsi-v098-cancelamento-componente",
    "message": {
      "title": "Ensino superior — Cancelamento de disciplina",
      "response_text": "📚 *Cancelamento de disciplina*\n\nO cancelamento ou trancamento de componente deve seguir o calendário e as Normas Acadêmicas. Confirme no SUAP e com a CORES se o período de solicitação está aberto.",
      "details_text": "",
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/regulamentos/gerais/normas-academicas-ensino-superior-resolucaoo-23-2019-consepe.pdf/view",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "priority": 64,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "cancelamento",
        "matricula"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como cancelar uma disciplina em bsi",
          "como trancar uma matéria em sistemas de informação",
          "cancelamento de componente curricular no ifba"
        ],
        "keywords": [],
        "required_words": [],
        "excluded_words": [],
        "exact_phrases": [],
        "require_question_mark": true,
        "regex_pattern": "",
        "regex_flags": "iu",
        "typo_tolerance": 0,
        "synonym_group_ids": [],
        "negative_examples": []
      }
    },
    "legacyGroup": "v098"
  },
  {
    "key": "ifba-bsi-v098-abandono-retorno",
    "message": {
      "title": "Ensino superior — Abandono e retorno ao curso",
      "response_text": "↩️ *Abandono e retorno ao curso*\n\nNão deixe de renovar matrícula sem orientação. A interrupção pode gerar consequências acadêmicas. Para retornar, confirme sua situação e o procedimento aplicável com a CORES e a Coordenação.",
      "details_text": "",
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/regulamentos/gerais/normas-academicas-ensino-superior-resolucaoo-23-2019-consepe.pdf/view",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "priority": 64,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "retorno",
        "abandono"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "abandonei bsi como faço para voltar",
          "como retornar ao curso de sistemas de informação",
          "fiquei sem renovar matrícula em bsi",
          "como voltar para o ifba depois de abandonar o curso"
        ],
        "keywords": [],
        "required_words": [],
        "excluded_words": [],
        "exact_phrases": [],
        "require_question_mark": true,
        "regex_pattern": "",
        "regex_flags": "iu",
        "typo_tolerance": 0,
        "synonym_group_ids": [],
        "negative_examples": []
      }
    },
    "legacyGroup": "v098"
  },
  {
    "key": "ifba-bsi-v098-renovacao-matricula",
    "message": {
      "title": "Ensino superior — Renovação de matrícula",
      "response_text": "🗓️ *Renovação de matrícula*\n\nAcompanhe o calendário acadêmico e realize a renovação pelo procedimento vigente. Se houver erro ou componente indisponível, procure a CORES e a Coordenação.",
      "details_text": "",
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/regulamentos/gerais/normas-academicas-ensino-superior-resolucaoo-23-2019-consepe.pdf/view",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "priority": 64,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "matricula",
        "renovacao"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como renovar matrícula em bsi",
          "quando faço renovação de matrícula no ifba",
          "minha renovação de matrícula de bsi deu erro"
        ],
        "keywords": [],
        "required_words": [],
        "excluded_words": [],
        "exact_phrases": [],
        "require_question_mark": true,
        "regex_pattern": "",
        "regex_flags": "iu",
        "typo_tolerance": 0,
        "synonym_group_ids": [],
        "negative_examples": []
      }
    },
    "legacyGroup": "v098"
  },
  {
    "key": "ifba-bsi-v098-segunda-chamada",
    "message": {
      "title": "Ensino superior — Segunda chamada",
      "response_text": "📝 *Segunda chamada*\n\nA solicitação deve seguir as Normas Acadêmicas e o procedimento vigente. Guarde a justificativa e confirme com o professor e o setor responsável quais documentos devem ser apresentados.",
      "details_text": "",
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/regulamentos/gerais/normas-academicas-ensino-superior-resolucaoo-23-2019-consepe.pdf/view",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "priority": 64,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "segunda-chamada",
        "avaliacao"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "perdi uma prova em bsi o que faço",
          "como pedir segunda chamada no ifba",
          "segunda chamada de prova em sistemas de informação"
        ],
        "keywords": [],
        "required_words": [],
        "excluded_words": [],
        "exact_phrases": [],
        "require_question_mark": true,
        "regex_pattern": "",
        "regex_flags": "iu",
        "typo_tolerance": 0,
        "synonym_group_ids": [],
        "negative_examples": []
      }
    },
    "legacyGroup": "v098"
  },
  {
    "key": "ifba-bsi-v098-exercicios-domiciliares",
    "message": {
      "title": "Ensino superior — Exercícios domiciliares e atestado",
      "response_text": "🏠 *Exercícios domiciliares*\n\nEm afastamento por motivo de saúde ou outra situação prevista, siga o procedimento institucional e apresente a documentação ao setor indicado. Confirme o encaminhamento com a CORES e a Coordenação; o bot não informa prazo sem uma publicação vigente.",
      "details_text": "",
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/regulamentos/gerais/normas-academicas-ensino-superior-resolucaoo-23-2019-consepe.pdf/view",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "priority": 64,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "exercicios-domiciliares",
        "atestado"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como pedir exercícios domiciliares no ifba",
          "estou afastado por saúde em bsi",
          "onde entrego atestado no ifba",
          "como solicitar atividade domiciliar em bsi"
        ],
        "keywords": [],
        "required_words": [],
        "excluded_words": [],
        "exact_phrases": [],
        "require_question_mark": true,
        "regex_pattern": "",
        "regex_flags": "iu",
        "typo_tolerance": 0,
        "synonym_group_ids": [],
        "negative_examples": []
      }
    },
    "legacyGroup": "v098"
  },
  {
    "key": "ifba-bsi-v098-colacao-grau",
    "message": {
      "title": "Ensino superior — Colação de grau",
      "response_text": "🎓 *Colação de grau*\n\nA colação depende da conclusão de todas as exigências acadêmicas e da inexistência de pendências. Solicite a conferência da integralização à Coordenação e confirme o procedimento com a CORES.",
      "details_text": "",
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/regulamentos/gerais/normas-academicas-ensino-superior-resolucaoo-23-2019-consepe.pdf/view",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "priority": 64,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "colacao",
        "conclusao"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como pedir colação de grau em bsi",
          "quando posso colar grau em sistemas de informação",
          "o que impede minha colação de grau no ifba"
        ],
        "keywords": [],
        "required_words": [],
        "excluded_words": [],
        "exact_phrases": [],
        "require_question_mark": true,
        "regex_pattern": "",
        "regex_flags": "iu",
        "typo_tolerance": 0,
        "synonym_group_ids": [],
        "negative_examples": []
      }
    },
    "legacyGroup": "v098"
  },
  {
    "key": "ifba-bsi-v098-diploma",
    "message": {
      "title": "Ensino superior — Diploma",
      "response_text": "📜 *Diploma*\n\nApós a colação de grau, siga o procedimento institucional para solicitação e acompanhamento do diploma. Confirme os documentos e o canal vigente com a CORES.",
      "details_text": "",
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/regulamentos/gerais/normas-academicas-ensino-superior-resolucaoo-23-2019-consepe.pdf/view",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "priority": 64,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "diploma",
        "cores"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como solicitar diploma de bsi",
          "onde peço meu diploma do ifba",
          "como acompanhar o diploma de sistemas de informação"
        ],
        "keywords": [],
        "required_words": [],
        "excluded_words": [],
        "exact_phrases": [],
        "require_question_mark": true,
        "regex_pattern": "",
        "regex_flags": "iu",
        "typo_tolerance": 0,
        "synonym_group_ids": [],
        "negative_examples": []
      }
    },
    "legacyGroup": "v098"
  },
  {
    "key": "ifba-bsi-v098-enade",
    "message": {
      "title": "BSI — ENADE",
      "response_text": "📋 *ENADE*\n\nA participação depende do ciclo e da situação acadêmica do estudante. Consulte os comunicados vigentes e confirme sua inscrição e regularidade com a Coordenação de BSI. O bot não presume que uma turma esteja convocada.",
      "details_text": "",
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "priority": 64,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "enade"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "preciso fazer enade em bsi",
          "como saber se fui inscrito no enade",
          "enade é obrigatório para sistemas de informação",
          "não fiz enade posso colar grau",
          "onde vejo minha situação no enade"
        ],
        "keywords": [],
        "required_words": [],
        "excluded_words": [],
        "exact_phrases": [],
        "require_question_mark": true,
        "regex_pattern": "",
        "regex_flags": "iu",
        "typo_tolerance": 0,
        "synonym_group_ids": [],
        "negative_examples": []
      }
    },
    "legacyGroup": "v098"
  },
  {
    "key": "ifba-bsi-v098-editais-oportunidades",
    "message": {
      "title": "BSI — Editais e oportunidades",
      "response_text": "📣 *Editais e oportunidades*\n\nConsulte a área oficial de editais do campus para pesquisa, inovação, monitorias, bolsas e outras oportunidades. Para estágio, acompanhe também os canais da CAENS e as publicações do campus.\n\nAs datas mudam; use sempre o edital vigente.",
      "details_text": "",
      "source_url": "https://portal.ifba.edu.br/conquista/menu-pesquisa/editais",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "priority": 64,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "editais",
        "oportunidades"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "editais abertos para estudantes de bsi",
          "oportunidades para alunos de sistemas de informação",
          "onde vejo bolsas monitorias e projetos do ifba",
          "vagas e editais para bsi"
        ],
        "keywords": [],
        "required_words": [],
        "excluded_words": [],
        "exact_phrases": [],
        "require_question_mark": true,
        "regex_pattern": "",
        "regex_flags": "iu",
        "typo_tolerance": 0,
        "synonym_group_ids": [],
        "negative_examples": []
      }
    },
    "legacyGroup": "v098"
  }
]);

module.exports = { BSI_ACADEMIC_PROCESSES_CARDS };
