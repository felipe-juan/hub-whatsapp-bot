'use strict';

const BSI_CURRICULUM_CARDS = Object.freeze([
  {
    "key": "ifba-bsi-v095-bsi-ppc-atual",
    "message": {
      "title": "BSI — PPC atual",
      "response_text": "*PPC vigente de BSI*\n\nA página oficial identifica como atual o PPC implantado em *2024.1*.\n\nDocumentos do PPC, matriz curricular, optativas, migração, ementário e resolução:\nhttps://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/projeto-pedagogico",
      "priority": 90,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "ppc",
        "matriz"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "onde encontro o ppc atual de sistemas de informação",
          "qual é o ppc vigente de bsi",
          "link do ppc de bsi 2024",
          "projeto pedagógico de sistemas de informação",
          "Onde baixo o PPC atual de Sistemas de Informação"
        ],
        "keywords": [],
        "required_words": [],
        "excluded_words": [],
        "exact_phrases": [
          "ppc"
        ],
        "require_question_mark": true,
        "regex_pattern": "",
        "regex_flags": "iu",
        "typo_tolerance": 0,
        "synonym_group_ids": [],
        "negative_examples": []
      },
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/projeto-pedagogico",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-bsi-migracao-entre-matrizes-curriculares",
    "message": {
      "title": "BSI — Migração entre matrizes curriculares",
      "response_text": "*Migração entre matrizes curriculares de BSI*\n\nA página oficial do curso disponibiliza o quadro de equivalência e o regulamento de migração curricular entre as versões do PPC. A mudança não deve ser presumida automaticamente: consulte os documentos publicados e confirme sua situação com a Coordenação de Sistemas de Informação antes de solicitar qualquer alteração.",
      "priority": 93,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "matriz",
        "migração",
        "ppc"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como faço a migração para o ppc 2024 de bsi",
          "posso solicitar mudança para o ppc 2024 de bsi",
          "onde encontro o regulamento de migração do ppc de bsi",
          "quero mudar do ppc antigo para o ppc 2024 de bsi",
          "quadro de equivalência para migrar ao ppc 2024 de bsi",
          "migração entre ppcs de bsi"
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
      },
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-hub-fluxograma-e-matriz-de-sistemas-de-informacao",
    "message": {
      "title": "HUB — Fluxograma e matriz de Sistemas de Informação",
      "response_text": "📘 *Matriz curricular de BSI*\n\n• Ingresso a partir de 2024.1: PPC atual.\n• Ingresso entre 2017.2 e 2023.2: PPC 2017.\n• Ingresso entre 2010.2 e 2017.1: PPC 2010.\n\nSe você migrou de matriz, confirme a versão registrada no SUAP.",
      "priority": 93,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "matriz",
        "disciplinas"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "onde encontro a matriz curricular atual de bsi",
          "qual é a grade atual de sistemas de informação",
          "link da matriz curricular de sistemas de informação",
          "quais disciplinas tem na matriz atual de bsi",
          "qual matriz curricular de bsi se aplica a mim",
          "qual é a minha matriz de sistemas de informação",
          "entrei em 2023 qual matriz de bsi",
          "entrei em 2024 qual matriz de bsi",
          "como saber minha matriz curricular de sistemas de informação",
          "comecei bsi em 2024 qual é minha matriz"
        ],
        "keywords": [],
        "required_words": [],
        "excluded_words": [],
        "exact_phrases": [
          "fluxograma",
          "matriz curricular",
          "matriz de bsi"
        ],
        "require_question_mark": true,
        "regex_pattern": "",
        "regex_flags": "iu",
        "typo_tolerance": 0,
        "synonym_group_ids": [],
        "negative_examples": []
      },
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/projeto-pedagogico",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": "*Matrizes curriculares de BSI*\n\nA página oficial do curso organiza as versões assim:\n• ingresso a partir de 2024.1: PPC atual;\n• ingresso de 2017.2 a 2023.2: PPC de 2017;\n• ingresso de 2010.2 a 2017.1: PPC de 2010.\n\nA matriz atual, implantada em 2024.1, e os documentos das versões anteriores estão na seção “Projeto Pedagógico”. Use-os para conferir componentes, períodos, carga horária e pré-requisitos. Se houve migração formal ou uma situação acadêmica específica, confirme a matriz registrada no SUAP ou com a Coordenação.\n\n\n*Fluxograma interativo do HUB:*\nhttps://felipe-juan.github.io/hub-arquivos-ifba/apps/fluxogramas/#sistemas-de-informacao/"
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-bsi-disciplinas-optativas",
    "message": {
      "title": "BSI — Disciplinas optativas",
      "response_text": "*Disciplinas optativas de BSI*\n\nA página do PPC atual disponibiliza uma *Matriz Curricular Optativa* separada.\n\nConsulte a versão oficial em:\nhttps://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/projeto-pedagogico\n\nA oferta efetiva de cada optativa pode variar por semestre.",
      "priority": 89,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "matriz",
        "optativas"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "onde encontro as disciplinas optativas de bsi",
          "quais são as optativas de sistemas de informação",
          "matriz optativa de bsi",
          "lista de optativas do curso de sistemas de informação",
          "Quais são as disciplinas optativas de BSI"
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
      },
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/projeto-pedagogico",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-bsi-ementas-e-bibliografias",
    "message": {
      "title": "BSI — Ementas e bibliografias",
      "response_text": "*Ementas e bibliografias de BSI*\n\nO ementário e as bibliografias dos componentes curriculares estão reunidos na seção do PPC atual:\nhttps://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/projeto-pedagogico",
      "priority": 90,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "ementa",
        "bibliografia"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "onde encontro as ementas de bsi",
          "qual é a ementa das disciplinas de sistemas de informação",
          "onde encontro a bibliografia de bsi",
          "ementário do curso de sistemas de informação",
          "Onde encontro as ementas das disciplinas de BSI"
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
      },
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/projeto-pedagogico",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-bsi-pre-requisitos-das-disciplinas",
    "message": {
      "title": "BSI — Pré-requisitos das disciplinas",
      "response_text": "*Pré-requisitos em BSI*\n\nConsulte a *Matriz Curricular* correspondente ao seu período de ingresso. Ela é a referência oficial para componentes e pré-requisitos.\n\nDocumentos:\nhttps://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/projeto-pedagogico\n\nPara exceções, quebra de pré-requisito ou divergência no SUAP, procure a coordenação.",
      "priority": 92,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "matriz",
        "pre-requisito"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "onde vejo os pré requisitos de bsi",
          "qual é o pré requisito de uma disciplina de sistemas de informação",
          "como consultar pré requisito em bsi",
          "quais matérias bloqueiam outras em bsi",
          "Onde vejo os pré-requisitos das disciplinas de BSI",
          "qual é o pré requisito de TCC I em BSI",
          "qual é o pré requisito de TCC II em BSI",
          "pré requisito de TCC I",
          "pré requisito de TCC II"
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
      },
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/projeto-pedagogico",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-bsi-equivalencia-entre-matrizes",
    "message": {
      "title": "BSI — Equivalência entre matrizes",
      "response_text": "*Equivalência curricular em BSI*\n\nA seção do Projeto Pedagógico disponibiliza documentos de equivalência para relacionar componentes de versões diferentes da matriz.\n\nConsulte o documento oficial correspondente:\nhttps://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/projeto-pedagogico\n\nA aplicação ao histórico individual deve ser confirmada pela coordenação.",
      "priority": 92,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "matriz",
        "equivalencia"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "onde encontro a equivalência de disciplinas de bsi",
          "qual disciplina equivale na nova matriz de bsi",
          "quadro de equivalência curricular de sistemas de informação",
          "como comparar a matriz antiga e nova de bsi",
          "Onde encontro o quadro de equivalência da matriz de BSI"
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
      },
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/projeto-pedagogico",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-bsi-migracao-curricular",
    "message": {
      "title": "BSI — Migração curricular",
      "response_text": "*Migração curricular em BSI*\n\nA página do PPC atual disponibiliza o *Regulamento de Migração Curricular*.\n\nLeia o documento oficial e confirme sua situação individual com a coordenação antes de solicitar qualquer alteração:\nhttps://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/projeto-pedagogico",
      "priority": 93,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "matriz",
        "migracao"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como funciona a migração curricular de bsi",
          "posso migrar para a matriz nova de sistemas de informação",
          "onde encontro o regulamento de migração de bsi",
          "quero mudar para a matriz 2024 de bsi",
          "Posso migrar para a matriz nova de BSI"
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
      },
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/projeto-pedagogico",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-bsi-regulamentos-especificos",
    "message": {
      "title": "BSI — Regulamentos específicos",
      "response_text": "*Regulamentos específicos de BSI*\n\nA página oficial reúne regulamentos de:\n• atividades complementares;\n• atividades curriculares de extensão (ACEX);\n• estágio curricular supervisionado;\n• trabalho de conclusão de curso (TCC).\n\nAcesse:\nhttps://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao",
      "priority": 88,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "regulamentos",
        "documentos"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "onde encontro os regulamentos de bsi",
          "quais são os regulamentos de sistemas de informação",
          "regulamentos específicos do curso de bsi",
          "onde ficam as normas de tcc estágio e atividades de bsi",
          "Onde encontro os regulamentos específicos de BSI"
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
      },
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-bsi-atividades-complementares-da-matriz-atual",
    "message": {
      "title": "BSI — Atividades complementares da matriz atual",
      "response_text": "📚 *Atividades complementares — PPC 2024*\n\nUse o regulamento aplicável à matriz implantada em 2024. A validação depende da categoria, do limite e da documentação apresentada.\n\nEnvie *mais detalhes* para receber a explicação completa.",
      "priority": 95,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "atividades-complementares",
        "regulamento"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "onde encontro o regulamento de atividades complementares de bsi 2024",
          "quais atividades complementares valem na matriz atual de bsi",
          "regulamento de horas complementares de sistemas de informação",
          "como validar atividades complementares em bsi",
          "Como validar atividades complementares na matriz 2024 de BSI"
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
      },
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/regulamentos/especificos/regulamento-atividades-complementares-ppc-2024.pdf/view",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": "*Atividades complementares — PPC vigente*\n\nEstudantes vinculados ao PPC implantado em 2024 devem consultar o regulamento específico da matriz atual.\n\nDocumento oficial:\nhttps://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao-arquivos/regulamentos/especificos/regulamento-atividades-complementares-ppc-2024.pdf/view\n\nNão use automaticamente o regulamento das matrizes anteriores, pois categorias e limites podem ser diferentes."
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-bsi-atividades-complementares-de-matrizes-anteriores",
    "message": {
      "title": "BSI — Atividades complementares de matrizes anteriores",
      "response_text": "*Atividades complementares — matrizes anteriores*\n\nA página oficial separa o regulamento aplicável ao PPC vigente do regulamento aplicável aos PPCs anteriores.\n\nSe seu ingresso ocorreu antes de 2024.1 e você não migrou formalmente de matriz, consulte a versão indicada para PPCs anteriores na página do curso:\nhttps://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao",
      "priority": 94,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "atividades-complementares",
        "matriz-antiga"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "qual regulamento de atividades complementares vale para bsi antigo",
          "atividades complementares da matriz 2017 de bsi",
          "horas complementares da matriz antiga de sistemas de informação",
          "entrei antes de 2024 qual regulamento de atividades complementares",
          "Entrei antes de 2024. Qual regulamento de atividades complementares de BSI uso"
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
      },
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-bsi-atividades-curriculares-de-extensao",
    "message": {
      "title": "BSI — Atividades Curriculares de Extensão",
      "response_text": "🌐 *ACEX em BSI*\n\nAs Atividades Curriculares de Extensão fazem parte da formação prevista no PPC e não são automaticamente iguais às atividades complementares.\n\nEnvie *mais detalhes* para receber a explicação completa.",
      "priority": 93,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "bsi",
        "acex",
        "extensao"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "onde encontro o regulamento de acex de bsi",
          "o que é acex em sistemas de informação",
          "atividades curriculares de extensão de bsi",
          "qual regulamento de extensão vale para bsi",
          "ACEX e atividades complementares são a mesma coisa em BSI"
        ],
        "keywords": [],
        "required_words": [],
        "excluded_words": [],
        "exact_phrases": [
          "acex"
        ],
        "require_question_mark": true,
        "regex_pattern": "",
        "regex_flags": "iu",
        "typo_tolerance": 0,
        "synonym_group_ids": [],
        "negative_examples": []
      },
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": "*ACEX em BSI*\n\nO curso possui regulamentação específica para as *Atividades Curriculares de Extensão (ACEX)*.\n\nAcesse a seção “Regulamentações Específicas” na página oficial do curso:\nhttps://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao\n\nACEX e atividades complementares são categorias distintas; consulte o documento correspondente antes de solicitar aproveitamento."
    },
    "legacyGroup": "bsi"
  }
]);

module.exports = { BSI_CURRICULUM_CARDS };
