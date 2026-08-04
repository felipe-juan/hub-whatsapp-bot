const STUDENT_ASSISTANCE_CARDS = Object.freeze([
  {
    "key": "ifba-bsi-v095-paae-o-que-e",
    "message": {
      "title": "PAAE — O que é",
      "response_text": "*PAAE — Programa de Assistência e Apoio ao Estudante*\n\nÉ um programa da Assistência Estudantil voltado à seleção e ao acompanhamento de estudantes em situação de vulnerabilidade socioeconômica, com oferta de bolsas e auxílios conforme avaliação, demanda e vagas disponíveis.",
      "priority": 61,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "paae",
        "assistencia-estudantil"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "o que é o paae",
          "o que significa paae",
          "para que serve o paae",
          "como funciona a assistência estudantil"
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
      "source_url": "https://portal.ifba.edu.br/conquista/ensino/servico-social-1",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-paae-quem-pode-participar",
    "message": {
      "title": "PAAE — Quem pode participar",
      "response_text": "*Quem pode participar do PAAE*\n\nO programa atende estudantes regularmente matriculados que estejam em situação de vulnerabilidade socioeconômica. A participação depende de processo de seleção e avaliação social.",
      "priority": 61,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "paae",
        "inscricao",
        "vulnerabilidade"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "quem pode participar do paae",
          "quem tem direito ao paae",
          "posso me inscrever no paae",
          "quem pode pedir auxílio estudantil"
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
      "source_url": "https://portal.ifba.edu.br/conquista/ensino/servico-social-1",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-paae-bolsas-e-auxilios",
    "message": {
      "title": "PAAE — Guia de Auxílios e Bolsas",
      "response_text": "*PAAE — auxílios e bolsas no IFBA Vitória da Conquista*\n\nO Programa de Assistência e Apoio ao Estudante atende estudantes regularmente matriculados em situação de vulnerabilidade socioeconômica. A seleção considera renda, composição e relações familiares, moradia, saúde, participação em programas sociais e histórico acadêmico.\n\n*Modalidades divulgadas pelo campus*\n\n• *Bolsa Estudo:* apoio financeiro mensal para permanência acadêmica;\n• *Bolsa PINA:* vinculada a Projetos de Incentivo à Aprendizagem;\n• *Auxílio Transporte:* ajuda no deslocamento até o campus;\n• *Auxílio Moradia:* contribuição para aluguel, conforme os critérios do edital;\n• *Auxílio para Aquisições/Almoxarifado Social:* materiais escolares, fardamento ou outros itens acadêmicos;\n• *Auxílio Alimentação:* uma refeição diária, quando ofertada;\n• *Auxílio Cópia e Impressão:* apoio para materiais didáticos.\n\n*Como solicitar*\n\n1. Acompanhe a publicação do edital do PAAE;\n2. Faça ou atualize a caracterização socioeconômica no SUAP;\n3. Inscreva-se no edital e envie toda a documentação exigida;\n4. Acompanhe homologação, resultado preliminar, recursos e resultado final pelo SUAP.\n\nA inscrição não garante o auxílio. A modalidade e o valor dependem da avaliação social, da demanda, das vagas e do orçamento disponível.\n\n*Onde acompanhar*\nhttps://portal.ifba.edu.br/conquista/ensino/servico-social-1\nhttps://suap.ifba.edu.br/",
      "priority": 72,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": ["paae", "auxilios", "bolsas", "assistencia-estudantil"],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como recebo os auxílios",
          "como recebo os auxilios",
          "como conseguir auxílio estudantil",
          "como conseguir auxilio estudantil",
          "como pedir auxílio no ifba",
          "como solicitar auxílio no ifba",
          "como se inscrever no paae",
          "como funciona o paae",
          "como funciona a assistência estudantil",
          "tenho direito a auxílio estudantil",
          "quem tem direito aos auxílios",
          "quais auxílios existem no ifba",
          "quais bolsas e auxílios o paae oferece",
          "onde vejo os auxílios do ifba",
          "me explica o paae"
        ],
        "keywords": [],
        "required_words": [],
        "excluded_words": [],
        "exact_phrases": [
          "paae",
          "auxílio",
          "auxilio",
          "auxílios",
          "auxilios",
          "assistência estudantil",
          "assistencia estudantil",
          "bolsas e auxílios",
          "bolsas e auxilios"
        ],
        "require_question_mark": true,
        "regex_pattern": "",
        "regex_flags": "iu",
        "typo_tolerance": 0,
        "synonym_group_ids": [],
        "negative_examples": [
          "auxílio doença do inss",
          "auxílio brasil",
          "auxílio emergencial do governo",
          "bolsa família"
        ]
      },
      "source_url": "https://portal.ifba.edu.br/conquista/ensino/servico-social-1",
      "source_title": "Serviço Social do IFBA Vitória da Conquista",
      "verified_at": "2026-08-04",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v0157-paae-valores-cronograma",
    "message": {
      "title": "PAAE — Valores e Cronograma Recente",
      "response_text": "*PAAE — valores e datas recentes em Vitória da Conquista*\n\n*Último edital com valores detalhados publicados pelo campus — 2025*\n\n• *Bolsa Estudo:* R$ 759,00 por mês;\n• *Auxílio Transporte:* R$ 240,00 por mês para residentes em Vitória da Conquista e R$ 300,00 para residentes em outros municípios, distritos ou zona rural do município;\n• *Auxílio Moradia:* R$ 450,00 por mês;\n• *Auxílio Cópia e Impressão:* R$ 80,00 por mês;\n• *Auxílio Alimentação:* uma refeição diária no refeitório;\n• *Auxílio para Aquisições:* valor definido conforme a necessidade analisada e a comprovação dos gastos.\n\nEsses foram os valores divulgados em 2025. *Não considere que serão automaticamente os mesmos em outro edital.* O valor efetivamente concedido aparece no resultado individual do SUAP.\n\n*Como foi o processo recente*\n\n• *2025 — novos cadastros:* inscrições de 17 de março a 3 de abril; resultado final divulgado em 8 de agosto de 2025.\n• *2026:* o resultado preliminar foi divulgado em 11 de junho de 2026; os recursos puderam ser enviados de 12 a 15 de junho pelo SUAP.\n\n*Quando costuma abrir?*\nNos dois processos recentes, as inscrições ou atualizações começaram entre fevereiro e março. Isso é apenas uma referência histórica: o edital pode sair em outro período.\n\n*Quando sai o resultado?*\nO prazo varia bastante conforme o número de inscritos e a análise documental. Em 2025, o resultado final dos editais foi publicado em agosto; em 2026, o preliminar saiu em junho.\n\n*Quando começa o pagamento?*\nO campus não publica uma data anual fixa. O pagamento depende do resultado final, da concordância com os termos, do cadastro de conta bancária em nome do estudante e do processamento administrativo. Pode levar algumas semanas; confirme a previsão no SUAP ou com o Serviço Social.\n\n*Consulta individual*\nhttps://suap.ifba.edu.br/\n\n*Fontes oficiais*\nValores e inscrições de 2025: https://portal.ifba.edu.br/conquista/ifba-abre-inscricoes-para-programa-de-assistencia-estudantil-em-2025\nResultado final de 2025: https://portal.ifba.edu.br/conquista/noticias-periodo-de-eleicoes/divulgado-resultado-final-dos-editais-01-e-05-de-2025-para-recebimento-de-auxilios-de-bolsas-do-paae\nResultado preliminar de 2026: https://portal.ifba.edu.br/conquista/paae-2026",
      "priority": 76,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": ["paae", "valores", "cronograma", "pagamento", "resultado"],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "quanto é o auxílio",
          "quanto e o auxilio",
          "qual o valor do auxílio",
          "qual o valor dos auxílios",
          "quanto paga o paae",
          "qual o valor do paae",
          "quando abre o paae",
          "quando começam as inscrições do paae",
          "quando sai o edital do paae",
          "quando sai o resultado do paae",
          "quando sai o resultado dos auxílios",
          "quando começa o pagamento do paae",
          "quando o auxílio começa a pagar",
          "que dia paga o auxílio",
          "como foi o último paae",
          "como foi o ultimo paae",
          "quais foram os valores do último paae"
        ],
        "keywords": [],
        "required_words": [],
        "excluded_words": [],
        "exact_phrases": ["valor do paae", "pagamento do paae", "resultado do paae"],
        "require_question_mark": true,
        "regex_pattern": "",
        "regex_flags": "iu",
        "typo_tolerance": 0,
        "synonym_group_ids": [],
        "negative_examples": []
      },
      "source_url": "https://portal.ifba.edu.br/conquista/ensino/servico-social-1",
      "source_title": "Serviço Social e publicações oficiais do IFBA Vitória da Conquista",
      "verified_at": "2026-08-04",
      "details_text": ""
    },
    "legacyGroup": "v0157"
  },
  {
    "key": "ifba-bsi-v095-paae-editais-atuais",
    "message": {
      "title": "PAAE — Editais atuais",
      "response_text": "*Editais do PAAE*\n\nA página do Serviço Social reúne os editais do PAAE, incluindo o edital de 2026. Consulte sempre essa página para usar a versão vigente e verificar eventuais retificações.\n\n📚 https://portal.ifba.edu.br/conquista/ensino/servico-social-1",
      "priority": 62,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "paae",
        "edital",
        "assistencia-estudantil"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "onde encontro os editais do paae",
          "qual é o edital atual do paae",
          "onde vejo inscrição do paae",
          "edital de auxílio estudantil"
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
      "source_url": "https://portal.ifba.edu.br/conquista/ensino/servico-social-1",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-paae-consultar-resultado",
    "message": {
      "title": "PAAE — Consultar resultado",
      "response_text": "*Resultado do PAAE*\n\nOs resultados individuais e os motivos de eventual indeferimento são consultados no SUAP com as credenciais do estudante. Quando houver período de recurso, o próprio comunicado ou edital informa o procedimento e o prazo.\n\n🔐 https://suap.ifba.edu.br/accounts/login/",
      "priority": 65,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "paae",
        "resultado",
        "suap"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "onde vejo o resultado do paae",
          "como acompanhar resultado do auxílio",
          "fui aprovado no paae",
          "minha solicitação do paae foi indeferida",
          "onde vejo o motivo do indeferimento do paae"
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
      "source_url": "https://portal.ifba.edu.br/conquista/paae-2026",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-capne-publico-atendido",
    "message": {
      "title": "CAPNE — Público atendido",
      "response_text": "*Público atendido pela CAPNE*\n\nA página oficial inclui estudantes com deficiência auditiva, visual, múltipla ou intelectual; transtorno do espectro autista; transtornos de aprendizagem; TDAH; e altas habilidades ou superdotação.",
      "priority": 61,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "capne",
        "publico",
        "inclusao"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "quem pode procurar a capne",
          "quem é atendido pela capne",
          "a capne atende estudantes com deficiência",
          "qual o público da capne"
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
      "source_url": "https://portal.ifba.edu.br/conquista/ensino/napnee",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-capne-tdah-e-dislexia",
    "message": {
      "title": "CAPNE — TDAH e dislexia",
      "response_text": "*CAPNE — TDAH e transtornos de aprendizagem*\n\nSim. A página oficial inclui TDAH e transtornos de aprendizagem, como dislexia, disgrafia, disortografia e discalculia, entre os públicos atendidos pela CAPNE.\n\n📧 capne.vdc@ifba.edu.br",
      "priority": 65,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "capne",
        "tdah",
        "dislexia"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "a capne atende estudantes com tdah",
          "a capne atende tdah",
          "a capne atende estudantes com dislexia",
          "tenho dislexia quem pode me ajudar",
          "tenho tdah quem pode me ajudar no ifba"
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
      "source_url": "https://portal.ifba.edu.br/conquista/ensino/napnee",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-capne-solicitar-apoio-ou-adaptacao",
    "message": {
      "title": "CAPNE — Solicitar apoio ou adaptação",
      "response_text": "*Solicitação de apoio ou adaptação*\n\nA página oficial do campus não publica um formulário ou passo a passo específico. Para evitar orientar um procedimento incorreto, entre diretamente em contato com a CAPNE:\n\n📧 capne.vdc@ifba.edu.br",
      "priority": 64,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "capne",
        "adaptacao",
        "acessibilidade"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como solicitar apoio da capne",
          "como solicitar adaptação acadêmica",
          "como pedir acessibilidade no ifba",
          "preciso de adaptação para estudar",
          "como informar uma necessidade específica"
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
      "source_url": "https://portal.ifba.edu.br/conquista/ensino/napnee",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v098-psicologia",
    "message": {
      "title": "Serviço de Psicologia — Apoio ao estudante",
      "response_text": "🧠 *Serviço de Psicologia do campus*\n\nO setor desenvolve ações educacionais ligadas ao bem-estar, à formação integral e à organização dos estudos.\n\n📧 psicologia.vdc@ifba.edu.br\n\nEm situação urgente de saúde ou risco, procure atendimento emergencial adequado; o bot não realiza atendimento psicológico.",
      "details_text": "",
      "source_url": "https://portal.ifba.edu.br/conquista/setor-de-psicologia",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "priority": 64,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "psicologia",
        "apoio-estudantil",
        "bsi"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como falar com a psicologia do ifba",
          "estou com dificuldade de organizar os estudos",
          "estou pensando em abandonar o curso de bsi",
          "estou sobrecarregado com as disciplinas",
          "existe apoio psicológico no campus"
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
    "key": "ifba-bsi-v098-refeitorio",
    "message": {
      "title": "Refeitório e alimentação — Orientação atual",
      "response_text": "🍽️ *Refeitório e alimentação*\n\nAs regras de atendimento podem mudar durante o semestre. A nota oficial de 1º de junho de 2026 informou que, naquele momento, não seria possível incluir novos estudantes no Refeitório Institucional.\n\nConsulte os avisos atuais e o Serviço Social antes de considerar essa informação válida para hoje.",
      "details_text": "",
      "source_url": "https://portal.ifba.edu.br/conquista/nota-informativa-sobre-o-atendimento-do-refeitorio-institucional",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "priority": 64,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "refeitorio",
        "alimentacao",
        "assistencia-estudantil"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como conseguir alimentação no ifba",
          "estudante de bsi pode usar o refeitório",
          "como pedir auxílio alimentação",
          "onde vejo avisos do refeitório",
          "como falar com a nutrição do ifba"
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
module.exports = { STUDENT_ASSISTANCE_CARDS };
