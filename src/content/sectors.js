const SECTOR_CARDS = Object.freeze([
  {
    "key": "si-support-servico-protocolo",
    "message": {
      "title": "Serviço — Protocolo",
      "response_text": "*Protocolo*\n\n🔗 *Formulário:*\nhttps://docs.google.com/forms/d/e/1FAIpQLSfLEx2SPGF76TRT7I31dQ8ZR3N8k038rKTqti36rOpWCVjynQ/viewform?pli=1",
      "priority": 44,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "servico",
        "protocolo",
        "formulario"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "abrir protocolo",
          "abrir um protocolo",
          "fazer protocolo",
          "fazer um protocolo",
          "enviar protocolo",
          "enviar um protocolo",
          "onde faço protocolo",
          "onde fazer protocolo",
          "como abrir protocolo",
          "formulário de protocolo",
          "formulario de protocolo",
          "formulário do protocolo",
          "formulario do protocolo",
          "link do protocolo",
          "protocolo do ifba",
          "protocolo acadêmico",
          "protocolo academico"
        ],
        "keywords": [],
        "required_words": [],
        "require_question_mark": true,
        "typo_tolerance": 1,
        "excluded_words": [],
        "exact_phrases": ["protocolo"],
        "synonym_group_ids": [],
        "negative_examples": [],
        "regex_pattern": "",
        "regex_flags": "iu"
      },
      "source_url": "",
      "source_title": "",
      "verified_at": "",
      "details_text": ""
    },
    "legacyGroup": "support"
  },
  {
    "key": "ifba-bsi-v095-cores-historico-e-dados-academicos",
    "message": {
      "title": "CORES — Histórico e dados acadêmicos",
      "response_text": "*Histórico e dados acadêmicos*\n\nPrimeiro, consulte sua área de estudante no SUAP. Se o documento não estiver disponível ou houver erro nos dados acadêmicos, procure a CORES.\n\n📧 coresvc@ifba.edu.br\n📱 https://wa.me/5577999299331\n🔐 SUAP: https://suap.ifba.edu.br/accounts/login/",
      "priority": 68,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "cores",
        "historico",
        "documentos",
        "suap"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "onde solicito meu histórico",
          "como pego meu histórico escolar",
          "preciso do histórico escolar",
          "meu histórico não aparece no suap",
          "meus dados acadêmicos estão errados",
          "onde resolvo problema no histórico",
          "onde resolvo problema com documento acadêmico"
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
      "source_url": "https://portal.ifba.edu.br/conquista/ifba-abre-periodo-de-renovacao-de-matricula-para-cursos-tecnicos",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-cgti-suporte-tecnico-e-contas",
    "message": {
      "title": "CGTI — Suporte técnico e contas",
      "response_text": "*CGTI — Coordenação de Gestão de Tecnologia da Informação*\n\nA CGTI presta suporte a sistemas, contas institucionais, computadores e rede do campus.\n\n📧 E-mail: cgti.conquista@ifba.edu.br\n☎️ Telefone: 3426-4210, ramais 2506 e 2505.",
      "priority": 66,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "cgti",
        "suporte",
        "senha",
        "tecnologia"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "onde resolvo problema de senha",
          "onde peço suporte de informática",
          "qual é o contato da cgti",
          "qual o email da cgti",
          "meu acesso não funciona",
          "problema técnico no suap",
          "problema com conta institucional"
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
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-administrativo/cgti-coordenacao-e-gestao-de-ecnologia-da-informacao",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-biblioteca-consultar-o-acervo",
    "message": {
      "title": "Biblioteca — Consultar o acervo",
      "response_text": "*Consulta ao acervo da Biblioteca*\n\nO catálogo do acervo é consultado pelo Sistema Pergamum. A página oficial da Biblioteca oferece o acesso ao catálogo e ao “Meu Pergamum”.\n\n📚 https://portal.ifba.edu.br/conquista/ensino/biblioteca",
      "priority": 61,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "biblioteca",
        "acervo",
        "pergamum"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como consultar o acervo da biblioteca",
          "onde pesquiso um livro da biblioteca",
          "como saber se a biblioteca tem um livro",
          "catálogo da biblioteca",
          "como acessar o pergamum"
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
      "source_url": "https://portal.ifba.edu.br/conquista/ensino/biblioteca",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-biblioteca-renovar-emprestimo",
    "message": {
      "title": "Biblioteca — Renovar empréstimo",
      "response_text": "*Renovação de empréstimo*\n\nA renovação pode ser feita on-line pelo “Meu Pergamum” por até cinco vezes, desde que:\n• o empréstimo ainda esteja dentro do prazo;\n• a obra não esteja reservada para outra pessoa;\n• o usuário não tenha materiais pendentes.\n\nDepois de cinco renovações on-line, a renovação deve ser feita presencialmente.",
      "priority": 64,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "biblioteca",
        "renovacao",
        "pergamum"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como renovar um livro",
          "como renovar livro da biblioteca",
          "posso renovar o empréstimo do livro",
          "renovação no meu pergamum",
          "quantas vezes posso renovar um livro"
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
      "source_url": "https://portal.ifba.edu.br/prodin/biblioteca-online/guia-do-usuario",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-biblioteca-reservar-livro",
    "message": {
      "title": "Biblioteca — Reservar livro",
      "response_text": "*Reserva de livro*\n\nA reserva pode ser feita quando todos os exemplares do título estiverem emprestados. As reservas seguem a ordem em que foram registradas no Pergamum.\n\nQuando o material fica disponível, ele permanece reservado por 48 horas. Se não for retirado nesse prazo, passa ao próximo usuário ou retorna à estante.",
      "priority": 64,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "biblioteca",
        "reserva",
        "pergamum"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como reservar um livro",
          "como faço reserva de livro",
          "posso reservar um livro emprestado",
          "reserva no meu pergamum",
          "quanto tempo o livro reservado fica disponível"
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
      "source_url": "https://portal.ifba.edu.br/prodin/biblioteca-online/guia-do-usuario",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-biblioteca-emitir-nada-consta",
    "message": {
      "title": "Biblioteca — Emitir Nada Consta",
      "response_text": "*Declaração de Nada Consta*\n\nNo “Meu Pergamum”:\n1. acesse o Sistema Pergamum;\n2. informe matrícula e senha;\n3. selecione “Empréstimo/Declaração de Nada Consta”;\n4. confirme a preparação e a impressão.\n\n⚠️ A página oficial informa que, após a emissão, o usuário fica suspenso dos serviços da Biblioteca.",
      "priority": 66,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "biblioteca",
        "nada-consta",
        "pergamum"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como emitir o nada consta",
          "onde pego o nada consta da biblioteca",
          "declaração de nada consta",
          "como imprimir o nada consta no pergamum"
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
      "source_url": "https://portal.ifba.edu.br/conquista/central-de-conteudos/declaracao-de-nada-consta",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-biblioteca-acessar-normas-abnt",
    "message": {
      "title": "Biblioteca — Acessar normas ABNT",
      "response_text": "*Normas ABNT*\n\nA página oficial da Biblioteca disponibiliza tutoriais específicos para estudantes e servidores acessarem as normas ABNT.\n\nAbra a página da Biblioteca e procure a seção “Tutoriais”.\n📚 https://portal.ifba.edu.br/conquista/ensino/biblioteca",
      "priority": 58,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "biblioteca",
        "abnt",
        "normas"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como acessar as normas da abnt",
          "onde encontro normas abnt",
          "o ifba dá acesso às normas da abnt",
          "tutorial normas abnt biblioteca"
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
      "source_url": "https://portal.ifba.edu.br/conquista/ensino/biblioteca",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-biblioteca-portal-de-periodicos-capes",
    "message": {
      "title": "Biblioteca — Portal de Periódicos CAPES",
      "response_text": "*Portal de Periódicos da CAPES*\n\nA página oficial da Biblioteca disponibiliza o acesso ao Portal CAPES e um tutorial de utilização.\n\nAbra a página da Biblioteca e procure “Portal Capes” ou “Tutorial para utilização do Portal Capes”.\n📚 https://portal.ifba.edu.br/conquista/ensino/biblioteca",
      "priority": 58,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "biblioteca",
        "capes",
        "periodicos"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como acessar o portal de periódicos da capes",
          "como acessar o portal capes",
          "tutorial portal capes",
          "onde encontro artigos na capes"
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
      "source_url": "https://portal.ifba.edu.br/conquista/ensino/biblioteca",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-biblioteca-livro-perdido-ou-danificado",
    "message": {
      "title": "Biblioteca — Livro perdido ou danificado",
      "response_text": "*Livro perdido, extraviado ou danificado*\n\nO Guia do Usuário do Sistema de Bibliotecas informa que a perda, o extravio ou o dano não elimina a obrigação do usuário de regularizar a devolução do bem.\n\nEntre em contato com a Biblioteca para receber a orientação de reposição aplicável ao caso:\n📧 biblioteca.vdc@ifba.edu.br",
      "priority": 62,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "biblioteca",
        "livro-perdido",
        "dano"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "perdi um livro da biblioteca",
          "danifiquei um livro da biblioteca",
          "o que fazer se perder um livro",
          "o que fazer se estragar um livro",
          "livro emprestado foi danificado"
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
      "source_url": "https://portal.ifba.edu.br/prodin/biblioteca-online/guia-do-usuario",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-biblioteca-doacao-de-livros",
    "message": {
      "title": "Biblioteca — Doação de livros",
      "response_text": "*Doação de material para a Biblioteca*\n\nA página oficial disponibiliza um “Termo de doação de material didático”, mas não publica um passo a passo completo para o campus.\n\nAntes de levar o material, confirme a aceitação e o procedimento com a Biblioteca:\n📧 biblioteca.vdc@ifba.edu.br",
      "priority": 55,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "biblioteca",
        "doacao",
        "livros"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "como fazer doação de livros",
          "quero doar livros para a biblioteca",
          "a biblioteca recebe doações",
          "termo de doação da biblioteca"
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
      "source_url": "https://portal.ifba.edu.br/conquista/ensino/biblioteca",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "ifba-bsi-v095-biblioteca-servicos-oferecidos",
    "message": {
      "title": "Biblioteca — Serviços oferecidos",
      "response_text": "*Serviços publicados pela Biblioteca*\n\n• consulta em computadores e consulta local;\n• empréstimo;\n• declaração de Nada Consta;\n• espaços para estudo;\n• ficha catalográfica;\n• normalização;\n• visita guiada.",
      "priority": 54,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "biblioteca",
        "servicos"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "quais serviços a biblioteca oferece",
          "o que a biblioteca oferece",
          "serviços da biblioteca do ifba",
          "a biblioteca faz ficha catalográfica",
          "a biblioteca ajuda com normalização"
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
      "source_url": "https://portal.ifba.edu.br/conquista/ensino/biblioteca",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "details_text": ""
    },
    "legacyGroup": "bsi"
  },
  {
    "key": "institutional-v098-sector-directory",
    "message": {
      "title": "Consulta estruturada — setores do IFBA",
      "response_text": "🏢 *Setores do IFBA*\n\nInforme o setor e o que deseja: contato, e-mail, WhatsApp, telefone, localização ou serviços.\n\nExemplos: `contato da CAENS` ou `onde fica a Coordenação de BSI?`",
      "details_text": "",
      "source_url": "https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao",
      "source_title": "Página oficial do IFBA",
      "verified_at": "2026-08-01",
      "priority": 64,
      "active": true,
      "archived": false,
      "scope": "both",
      "tags": [
        "setores",
        "contato",
        "localizacao"
      ],
      "trigger": {
        "match_mode": "all",
        "sentences": [
          "contato de setor do ifba",
          "onde encontro um setor do ifba",
          "setores do ifba"
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
module.exports = { SECTOR_CARDS };
