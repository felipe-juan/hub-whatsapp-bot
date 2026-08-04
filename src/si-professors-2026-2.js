// Quadro oficial de horários de Sistemas de Informação — 2026.2.
// Versão 2, publicada em 28/07/2026. Cada aula inclui a sala informada no quadro.

const SI_SCHEDULE_SOURCE_2026_2 = Object.freeze({
  file: '2026-07-09 - Horários Docentes 2026 (1).csv',
  version: 'Versão 2',
  published_at: '2026-07-28',
  sha256: 'ec6000abd72154f3675147a20b74f0ef02eda5fb7bcea59da8b00fa2fad10f16',
  professor_cards: 28,
  class_professor_records: 60
});

const SI_PROFESSORS_2026_2 = Object.freeze([
  {
    "name": "Alexandro dos Santos Silva",
    "email": "alexandrossilva@ifba.edu.br",
    "identifier": "alexandro",
    "semesters": [
      "3º semestre",
      "5º semestre"
    ],
    "classes": [
      [
        "Linguagem de Programação II",
        "3º semestre",
        "segunda-feira",
        "18h30–20h10 e 20h20–22h",
        "H108"
      ],
      [
        "Programação Web II",
        "5º semestre",
        "terça-feira",
        "18h30–20h10 e 20h20–22h",
        "H205"
      ]
    ]
  },
  {
    "name": "Allan de Sousa Soares",
    "email": "allansoares@ifba.edu.br",
    "identifier": "allan",
    "semesters": [
      "1º semestre",
      "2º semestre"
    ],
    "classes": [
      [
        "Matemática Discreta I",
        "1º semestre",
        "quinta-feira",
        "18h30–20h10 e 20h20–22h",
        "H204"
      ],
      [
        "Matemática Discreta II",
        "2º semestre",
        "sexta-feira",
        "18h30–20h10 e 20h20–22h",
        "H008"
      ]
    ]
  },
  {
    "name": "Amanda Ferraz de Oliveira Passos",
    "email": "amandaferraz@ifba.edu.br",
    "identifier": "amanda",
    "semesters": [
      "6º semestre",
      "7º semestre",
      "8º semestre"
    ],
    "classes": [
      [
        "Gestão de Projetos",
        "6º semestre",
        "quarta-feira",
        "18h30–20h10 e 20h20–22h",
        "H213"
      ],
      [
        "Gestão e Governança de TI",
        "7º semestre",
        "segunda-feira",
        "18h30–20h10 e 20h20–22h",
        "H105"
      ],
      [
        "Gestão de Projetos",
        "7º semestre",
        "quarta-feira",
        "18h30–20h10 e 20h20–22h",
        "H202"
      ],
      [
        "Sistemas de Apoio à Decisão",
        "8º semestre",
        "terça-feira",
        "18h30–20h10 e 20h20–22h",
        "H107"
      ]
    ]
  },
  {
    "name": "Andrique Figueirêdo Amorim",
    "email": "andrique.amorim@ifba.edu.br",
    "identifier": "andrique",
    "semesters": [
      "4º semestre",
      "5º semestre",
      "6º semestre"
    ],
    "classes": [
      [
        "Atividades Curriculares de Extensão I",
        "4º semestre",
        "quinta-feira e sexta-feira",
        "16h40–18h20",
        "H205"
      ],
      [
        "Programação Web",
        "5º semestre",
        "sexta-feira",
        "18h30–20h10 e 20h20–22h",
        "H205"
      ],
      [
        "Comércio Eletrônico",
        "6º semestre",
        "quinta-feira",
        "18h30–20h10 e 20h20–22h",
        "H214"
      ]
    ]
  },
  {
    "name": "Bruno Silvério Costa",
    "email": "brunosilverio@ifba.edu.br",
    "identifier": "bruno",
    "semesters": [
      "4º semestre",
      "6º semestre",
      "7º semestre"
    ],
    "classes": [
      [
        "Programação Web I",
        "4º semestre",
        "segunda-feira",
        "18h30–20h10 e 20h20–22h",
        "H205"
      ],
      [
        "Inteligência Artificial",
        "6º semestre",
        "sexta-feira",
        "18h30–20h10 e 20h20–22h",
        "H212"
      ],
      [
        "Interface Homem Máquina",
        "7º semestre",
        "quinta-feira",
        "18h30–20h10 e 20h20–22h",
        "H212"
      ]
    ]
  },
  {
    "name": "Camilo Alves Carvalho",
    "email": "camilocarvalho@ifba.edu.br",
    "identifier": "camilo",
    "semesters": [
      "1º semestre",
      "3º semestre",
      "6º semestre"
    ],
    "classes": [
      [
        "Introdução à Ciência da Computação",
        "1º semestre",
        "segunda-feira",
        "18h30–20h10 e 20h20–22h",
        "H204"
      ],
      [
        "Sistemas Operacionais",
        "3º semestre",
        "sábado",
        "13h50–16h20 e 16h40–17h30",
        "H211"
      ],
      [
        "Atividades Curriculares de Extensão III",
        "6º semestre",
        "segunda-feira e terça-feira",
        "16h40–18h20",
        "H106"
      ]
    ]
  },
  {
    "name": "Carlos André Pereira de Jesus Silva",
    "email": "carlos.pereira@ifba.edu.br",
    "identifier": "carlos",
    "semesters": [
      "3º semestre"
    ],
    "classes": [
      [
        "Probabilidade e Estatística",
        "3º semestre",
        "quarta-feira",
        "18h30–20h10 e 20h20–22h",
        "H108"
      ],
      [
        "Probabilidade e Estatística",
        "3º semestre",
        "segunda-feira",
        "18h30–20h10 e 20h20–22h",
        "H214"
      ]
    ]
  },
  {
    "name": "Cláudio Rodolfo Sousa de Oliveira",
    "email": "claudiorodolfo@ifba.edu.br",
    "identifier": "claudio",
    "semesters": [
      "2º semestre",
      "3º semestre",
      "5º semestre"
    ],
    "classes": [
      [
        "Linguagem de Programação I",
        "2º semestre",
        "segunda-feira",
        "18h30–20h10 e 20h20–22h",
        "H008"
      ],
      [
        "Estruturas de Dados",
        "3º semestre",
        "quinta-feira",
        "18h30–20h10 e 20h20–22h",
        "H108"
      ],
      [
        "Atividades Curriculares de Extensão II",
        "5º semestre",
        "segunda-feira e quinta-feira",
        "16h40–18h20",
        "H214"
      ]
    ]
  },
  {
    "name": "Crescêncio Rodrigues Lima Neto",
    "email": "crescencio@ifba.edu.br",
    "identifier": "crescencio",
    "semesters": [
      "6º semestre",
      "7º semestre",
      "8º semestre"
    ],
    "classes": [
      [
        "Engenharia de Software",
        "6º semestre",
        "terça-feira",
        "18h30–20h10 e 20h20–22h",
        "H213"
      ],
      [
        "Qualidade de Software",
        "7º semestre",
        "sexta-feira",
        "18h30–20h10 e 20h20–22h",
        "H105"
      ],
      [
        "Arquitetura de Software",
        "8º semestre",
        "segunda-feira",
        "18h30–20h10 e 20h20–22h",
        "H213"
      ]
    ]
  },
  {
    "name": "Crijina Chagas Flores",
    "email": "crijinaflores@ifba.edu.br",
    "identifier": "crijina",
    "semesters": [
      "4º semestre",
      "5º semestre"
    ],
    "classes": [
      [
        "Análise e Modelagem de Sistemas",
        "4º semestre",
        "quinta-feira",
        "18h30–20h10 e 20h20–22h",
        "H205"
      ],
      [
        "Processo de Desenvolvimento de Software",
        "5º semestre",
        "sexta-feira",
        "18h30–20h10 e 20h20–22h",
        "H214"
      ]
    ]
  },
  {
    "name": "Djan Almeida Santos",
    "email": "djan.santos@ifba.edu.br",
    "identifier": "djan",
    "semesters": [
      "7º semestre"
    ],
    "classes": [
      [
        "Trabalho de Conclusão de Curso I",
        "7º semestre",
        "quarta-feira",
        "16h40–18h20",
        "H106"
      ]
    ]
  },
  {
    "name": "Eliomar Luz Santos",
    "email": "eliomarsantos@ifba.edu.br",
    "identifier": "eliomar",
    "semesters": [
      "2º semestre"
    ],
    "classes": [
      [
        "Computador, Ética e Sociedade",
        "2º semestre",
        "quinta-feira",
        "18h30–20h10 e 20h20–22h",
        "H008"
      ]
    ]
  },
  {
    "name": "Igor Luiz Oliveira de Souza",
    "email": "igorluiz@ifba.edu.br",
    "identifier": "igor",
    "semesters": [
      "4º semestre",
      "5º semestre",
      "6º semestre"
    ],
    "classes": [
      [
        "Redes de Computadores",
        "4º semestre",
        "sexta-feira",
        "18h30–20h10 e 20h20–22h",
        "H202"
      ],
      [
        "Projeto e Administração de Redes",
        "5º semestre",
        "quinta-feira",
        "18h30–20h10 e 20h20–22h",
        "H202"
      ],
      [
        "Segurança e Auditoria de Sistemas",
        "6º semestre",
        "quarta-feira",
        "18h30–20h10 e 20h20–22h",
        "H106"
      ]
    ]
  },
  {
    "name": "João Rodrigues Pinto",
    "email": "joao_pinto@ifba.edu.br",
    "identifier": "joao",
    "semesters": [
      "1º semestre"
    ],
    "classes": [
      [
        "Leitura e Produção de Gêneros Acadêmicos",
        "1º semestre",
        "sábado",
        "13h50–16h20 e 16h40–17h30",
        "H204"
      ]
    ]
  },
  {
    "name": "Leonardo Barreto Campos",
    "email": "leonardobcampos@ifba.edu.br",
    "identifier": "leonardo",
    "excluded": [
      "thiago"
    ],
    "semesters": [
      "2º semestre",
      "6º semestre",
      "7º semestre"
    ],
    "classes": [
      [
        "Organização e Arquitetura de Computadores",
        "2º semestre",
        "sábado",
        "13h50–16h20 e 16h40–17h30",
        "H008"
      ],
      [
        "Sistemas Distribuídos",
        "6º semestre",
        "segunda-feira",
        "18h30–20h10 e 20h20–22h",
        "H212"
      ],
      [
        "Segurança de Redes de Computadores",
        "7º semestre",
        "terça-feira",
        "18h30–20h10 e 20h20–22h",
        "H105"
      ]
    ]
  },
  {
    "name": "Liojes de Oliveira Carneiro",
    "email": "liojes@ifba.edu.br",
    "identifier": "liojes",
    "semesters": [
      "1º semestre",
      "8º semestre"
    ],
    "classes": [
      [
        "Algoritmo e Programação",
        "1º semestre",
        "quarta-feira",
        "18h30–20h10 e 20h20–22h",
        "H204"
      ],
      [
        "Trabalho de Conclusão de Curso II",
        "8º semestre",
        "segunda-feira",
        "16h40–18h20",
        "H206"
      ]
    ]
  },
  {
    "name": "Luana Lima Bittencourt Silva",
    "email": "luanabittencourt@ifba.edu.br",
    "identifier": "luana",
    "semesters": [
      "2º semestre",
      "3º semestre"
    ],
    "classes": [
      [
        "Administração",
        "2º semestre",
        "quarta-feira",
        "18h30–20h10 e 20h20–22h",
        "H008"
      ],
      [
        "Organização, Sistemas e Métodos",
        "3º semestre",
        "sexta-feira",
        "18h30–20h10 e 20h20–22h",
        "H211"
      ]
    ]
  },
  {
    "name": "Luís Paulo da Silva Carvalho",
    "email": "luiscarvalho@ifba.edu.br",
    "identifier": "luis paulo",
    "semesters": [
      "5º semestre",
      "6º semestre"
    ],
    "classes": [
      [
        "Complexidade de Algoritmos",
        "5º semestre",
        "quarta-feira",
        "18h30–20h10 e 20h20–22h",
        "H205"
      ],
      [
        "Programação para Dispositivos Móveis",
        "6º semestre",
        "sábado",
        "13h50–16h20 e 16h40–17h30",
        "H212"
      ]
    ]
  },
  {
    "name": "Marcelo Meira Alves",
    "email": "marcelo.meira@ifba.edu.br",
    "identifier": "marcelo",
    "semesters": [
      "7º semestre"
    ],
    "classes": [
      [
        "Linguagem Brasileira de Sinais - Libras",
        "7º semestre",
        "sábado",
        "14h40–16h20 e 16h40–18h20",
        "H214"
      ]
    ]
  },
  {
    "name": "Ney Máximus Correia Silva Freitas",
    "email": "neyyen@ifba.edu.br",
    "identifier": "ney",
    "semesters": [
      "3º semestre"
    ],
    "classes": [
      [
        "Direito Cibernético",
        "3º semestre",
        "terça-feira",
        "18h30–20h10 e 20h20–22h",
        "H214"
      ]
    ]
  },
  {
    "name": "Pablo Freire Matos",
    "email": "pablofmatos@ifba.edu.br",
    "identifier": "pablo",
    "semesters": [
      "4º semestre",
      "5º semestre",
      "7º semestre"
    ],
    "classes": [
      [
        "Banco de Dados I",
        "4º semestre",
        "quarta-feira",
        "18h30–20h10 e 20h20–22h",
        "H211"
      ],
      [
        "Banco de Dados II",
        "5º semestre",
        "segunda-feira",
        "18h30–20h10 e 20h20–22h",
        "H202"
      ],
      [
        "Atividades Curriculares de Extensão IV",
        "7º semestre",
        "segunda-feira e quarta-feira",
        "16h40–18h20",
        "H101"
      ]
    ]
  },
  {
    "name": "Paulo Espinheira Menezes de Melo",
    "email": "paulomelo@ifba.edu.br",
    "identifier": "paulo",
    "excluded": [
      "luis"
    ],
    "semesters": [
      "2º semestre"
    ],
    "classes": [
      [
        "Cálculo Diferencial Aplicado à Computação",
        "2º semestre",
        "terça-feira",
        "18h30–20h10 e 20h20–22h",
        "H008"
      ]
    ]
  },
  {
    "name": "Polliana Freire dos Anjos de Oliveira",
    "email": "polliana.oliveira@ifba.edu.br",
    "identifier": "polliana",
    "semesters": [
      "1º semestre"
    ],
    "classes": [
      [
        "Inglês Aplicado à Computação",
        "1º semestre",
        "sexta-feira",
        "18h30–20h10 e 20h20–22h",
        "H204"
      ]
    ]
  },
  {
    "name": "Stênio Longo Araújo",
    "email": "stenio@ifba.edu.br",
    "identifier": "stenio",
    "semesters": [
      "4º semestre",
      "6º semestre",
      "7º semestre"
    ],
    "classes": [
      [
        "Paradigmas de Linguagens de Programação",
        "4º semestre",
        "terça-feira",
        "18h30–20h10 e 20h20–22h",
        "H106"
      ],
      [
        "Segurança da Informação",
        "6º semestre",
        "quinta-feira",
        "18h30–20h10 e 20h20–22h",
        "H106"
      ],
      [
        "Estágio Supervisionado",
        "7º semestre",
        "quinta-feira",
        "16h40–18h20",
        "H106"
      ]
    ]
  },
  {
    "name": "Thiago Leonardo Bastos da Silva",
    "email": "thiago.silva@ifba.edu.br",
    "identifier": "thiago",
    "semesters": [
      "2º semestre"
    ],
    "classes": [
      [
        "Cálculo Diferencial Aplicado à Computação",
        "2º semestre",
        "terça-feira",
        "18h30–20h10 e 20h20–22h",
        "H202"
      ]
    ]
  },
  {
    "name": "Ualace Roberto de Jesus Oliveira",
    "email": "ualacejesus@ifba.edu.br",
    "identifier": "ualace",
    "semesters": [
      "5º semestre",
      "6º semestre"
    ],
    "classes": [
      [
        "Economia",
        "5º semestre",
        "sábado",
        "13h50–16h20 e 16h40–17h30",
        "H202"
      ],
      [
        "Contabilidade Geral e Custos",
        "6º semestre",
        "sexta-feira",
        "18h30–20h10 e 20h20–22h",
        "H106"
      ]
    ]
  },
  {
    "name": "Valéria Melo Ferraz",
    "email": "valeriamelo@ifba.edu.br",
    "identifier": "valeria",
    "semesters": [
      "4º semestre"
    ],
    "classes": [
      [
        "Empreendedorismo",
        "4º semestre",
        "terça-feira",
        "18h30–20h10 e 20h20–22h",
        "H212"
      ]
    ]
  },
  {
    "name": "Viviane Maria Lélis Carvalho",
    "email": "vivianelelis@ifba.edu.br",
    "identifier": "viviane",
    "semesters": [
      "1º semestre",
      "4º semestre",
      "8º semestre"
    ],
    "classes": [
      [
        "Fundamentos de Sistemas de Informação",
        "1º semestre",
        "terça-feira",
        "18h30–20h10 e 20h20–22h",
        "H204"
      ],
      [
        "Metodologia da Pesquisa Científica",
        "4º semestre",
        "sábado",
        "13h50–16h20 e 16h40–17h30",
        "H205"
      ],
      [
        "Inteligência do Negócio",
        "8º semestre",
        "quarta-feira",
        "18h30–20h10 e 20h20–22h",
        "H214"
      ]
    ]
  }
]);

const SI_PENDING_2026_2 = Object.freeze({
  "name": "Docente de Meio Ambiente — identificação pendente",
  "identifier": "meio ambiente",
  "semesters": [
    "8º semestre"
  ],
  "classes": [
    [
      "Meio Ambiente",
      "8º semestre",
      "sexta-feira",
      "18h30–20h10 e 20h20–22h",
      "H101"
    ]
  ],
  "pending": true
});

const SI_DISCIPLINE_CODES_2026_2 = Object.freeze({
  'Administração': 'ADM',
  'Algoritmo e Programação': 'AP',
  'Análise e Modelagem de Sistemas': 'AMS',
  'Arquitetura de Software': 'AS',
  'Atividades Curriculares de Extensão I': 'ACEX I',
  'Atividades Curriculares de Extensão II': 'ACEX II',
  'Atividades Curriculares de Extensão III': 'ACEX III',
  'Atividades Curriculares de Extensão IV': 'ACEX IV',
  'Banco de Dados I': 'BDI',
  'Banco de Dados II': 'BDII',
  'Complexidade de Algoritmos': 'CA',
  'Computador, Ética e Sociedade': 'CES',
  'Comércio Eletrônico': 'CE',
  'Contabilidade Geral e Custos': 'CGC',
  'Cálculo Diferencial Aplicado à Computação': 'CDAC',
  'Direito Cibernético': 'DC',
  'Economia': 'ECO',
  'Empreendedorismo': 'EMP',
  'Engenharia de Software': 'ES',
  'Estruturas de Dados': 'ED',
  'Estágio Supervisionado': 'EST',
  'Fundamentos de Sistemas de Informação': 'FSI',
  'Gestão de Projetos': 'GP',
  'Gestão e Governança de TI': 'GGTI',
  'Inglês Aplicado à Computação': 'IAC',
  'Inteligência Artificial': 'IA',
  'Inteligência do Negócio': 'BI',
  'Interface Homem Máquina': 'IHM',
  'Introdução à Ciência da Computação': 'ICC',
  'Leitura e Produção de Gêneros Acadêmicos': 'LPGA',
  'Linguagem Brasileira de Sinais - Libras': 'LIBRAS',
  'Linguagem de Programação I': 'LPI',
  'Linguagem de Programação II': 'LPII',
  'Matemática Discreta I': 'MDI',
  'Matemática Discreta II': 'MDII',
  'Meio Ambiente': 'MA',
  'Metodologia da Pesquisa Científica': 'MPC',
  'Organização e Arquitetura de Computadores': 'OAC',
  'Organização, Sistemas e Métodos': 'OSM',
  'Paradigmas de Linguagens de Programação': 'PLP',
  'Probabilidade e Estatística': 'PE',
  'Processo de Desenvolvimento de Software': 'PDS',
  'Programação Web': 'PW',
  'Programação Web I': 'PWI',
  'Programação Web II': 'PWII',
  'Programação para Dispositivos Móveis': 'PDM',
  'Projeto e Administração de Redes': 'PAR',
  'Qualidade de Software': 'QS',
  'Redes de Computadores': 'RC',
  'Segurança da Informação': 'SI',
  'Segurança de Redes de Computadores': 'SRC',
  'Segurança e Auditoria de Sistemas': 'SAS',
  'Sistemas Distribuídos': 'SD',
  'Sistemas Operacionais': 'SO',
  'Sistemas de Apoio à Decisão': 'SAD',
  'Trabalho de Conclusão de Curso I': 'TCCI',
  'Trabalho de Conclusão de Curso II': 'TCCII'
});

function formatDisciplineLabel(discipline) {
  const fullName = String(discipline || '').trim();
  const code = SI_DISCIPLINE_CODES_2026_2[fullName];
  return code ? `${code} - ${fullName}` : fullName;
}

function formatDisciplineNamesInText(value) {
  const text = String(value || '');
  const names = Object.keys(SI_DISCIPLINE_CODES_2026_2).sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const escape = input => String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nameAlternatives = names.map(escape).join('|');
  const codes = [...new Set([
    ...Object.values(SI_DISCIPLINE_CODES_2026_2),
    'ACE I', 'ACE II', 'ACE III', 'ACE IV'
  ])].sort((a, b) => b.length - a.length);
  const codeAlternatives = codes.map(escape).join('|');
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:(?:(?:${codeAlternatives})\\s*-\\s*)*)(${nameAlternatives})(?![\\p{L}\\p{N}])`, 'gu');
  return text.replace(pattern, (_match, fullName) => `${SI_DISCIPLINE_CODES_2026_2[fullName]} - ${fullName}`);
}

const SI_PROFESSOR_TRIGGER_ALIASES_2026_2 = Object.freeze({
  "Alexandro dos Santos Silva": ["alexandro"],
  "Allan de Sousa Soares": ["allan"],
  "Amanda Ferraz de Oliveira Passos": ["amanda"],
  "Andrique Figueirêdo Amorim": ["andrique"],
  "Bruno Silvério Costa": ["bruno", "silvério"],
  "Camilo Alves Carvalho": ["camilo"],
  "Carlos André Pereira de Jesus Silva": ["carlos andré", "carlos"],
  "Cláudio Rodolfo Sousa de Oliveira": ["cláudio", "rodolfo"],
  "Crescêncio Rodrigues Lima Neto": ["crescêncio"],
  "Crijina Chagas Flores": ["crijina"],
  "Djan Almeida Santos": ["djan"],
  "Eliomar Luz Santos": ["eliomar"],
  "Igor Luiz Oliveira de Souza": ["igor"],
  "João Rodrigues Pinto": ["joão rodrigues", "rodrigues", "joão"],
  "Leonardo Barreto Campos": ["leonardo barreto", "barreto", "leonardo"],
  "Liojes de Oliveira Carneiro": ["liojes"],
  "Luana Lima Bittencourt Silva": ["luana"],
  "Luís Paulo da Silva Carvalho": ["luís paulo", "luís"],
  "Marcelo Meira Alves": ["marcelo meira", "meira", "marcelo"],
  "Ney Máximus Correia Silva Freitas": ["ney máximus", "máximus", "ney"],
  "Pablo Freire Matos": ["pablo"],
  "Paulo Espinheira Menezes de Melo": ["paulo espinheira", "espinheira"],
  "Polliana Freire dos Anjos de Oliveira": ["polliana"],
  "Stênio Longo Araújo": ["stênio"],
  "Thiago Leonardo Bastos da Silva": ["thiago bastos", "bastos", "thiago"],
  "Ualace Roberto de Jesus Oliveira": ["ualace"],
  "Valéria Melo Ferraz": ["valéria"],
  "Viviane Maria Lélis Carvalho": ["viviane", "lélis"],
  "Docente de Meio Ambiente — identificação pendente": ["meio ambiente", "substituto ambiental", "engenharia ambiental"]
});

// Siglas e abreviações usadas pelos estudantes. Elas nunca funcionam sozinhas:
// sempre aparecem dentro de sentenças como “professor de MDI”, “quem ensina ADM”
// ou “horário de IA”, reduzindo o risco de correspondências fora de contexto.
const SI_DISCIPLINE_ALIASES_2026_2 = Object.freeze({
  'Administração': ['ADM'],
  'Algoritmo e Programação': ['AP', 'algoritmos e programação'],
  'Análise e Modelagem de Sistemas': ['AMS'],
  'Arquitetura de Software': ['arquitetura software', 'arq software'],
  'Atividades Curriculares de Extensão I': ['ACEX I', 'ACEX1', 'ACEX 1', 'ACE I', 'ACE1', 'ACE 1'],
  'Atividades Curriculares de Extensão II': ['ACEX II', 'ACEX2', 'ACEX 2', 'ACE II', 'ACE2', 'ACE 2'],
  'Atividades Curriculares de Extensão III': ['ACEX III', 'ACEX3', 'ACEX 3', 'ACE III', 'ACE3', 'ACE 3'],
  'Atividades Curriculares de Extensão IV': ['ACEX IV', 'ACEX4', 'ACEX 4', 'ACE IV', 'ACE4', 'ACE 4'],
  'Banco de Dados I': ['BD I', 'BDI', 'BD1', 'BD 1'],
  'Banco de Dados II': ['BD II', 'BDII', 'BD2', 'BD 2'],
  'Complexidade de Algoritmos': ['complexidade', 'comp algoritmos'],
  'Computador, Ética e Sociedade': ['CES'],
  'Comércio Eletrônico': ['e-commerce', 'ecommerce'],
  'Contabilidade Geral e Custos': ['CGC', 'contabilidade e custos'],
  'Cálculo Diferencial Aplicado à Computação': ['CDAC', 'cálculo aplicado', 'calculo aplicado', 'cálculo', 'calculo'],
  'Direito Cibernético': ['DC'],
  'Economia': ['ECO'],
  'Empreendedorismo': ['EMP'],
  'Engenharia de Software': ['eng software', 'eng de software'],
  'Estruturas de Dados': ['ED'],
  'Estágio Supervisionado': ['estágio', 'estagio'],
  'Fundamentos de Sistemas de Informação': ['FSI'],
  'Gestão de Projetos': ['GP'],
  'Gestão e Governança de TI': ['GGTI', 'governança de TI', 'governanca de TI'],
  'Inglês Aplicado à Computação': ['IAC', 'inglês aplicado', 'ingles aplicado'],
  'Inteligência Artificial': ['IA'],
  'Inteligência do Negócio': ['BI', 'business intelligence'],
  'Interface Homem Máquina': ['IHM', 'IHC'],
  'Introdução à Ciência da Computação': ['ICC'],
  'Leitura e Produção de Gêneros Acadêmicos': ['LPGA', 'leitura e produção'],
  'Linguagem Brasileira de Sinais - Libras': ['LIBRAS'],
  'Linguagem de Programação I': ['LP I', 'LPI', 'LP1', 'LP 1'],
  'Linguagem de Programação II': ['LP II', 'LPII', 'LP2', 'LP 2'],
  'Matemática Discreta I': ['MD I', 'MDI', 'MD1', 'MD 1'],
  'Matemática Discreta II': ['MD II', 'MDII', 'MD2', 'MD 2'],
  'Meio Ambiente': ['meio ambiente'],
  'Metodologia da Pesquisa Científica': ['MPC'],
  'Organização e Arquitetura de Computadores': ['OAC'],
  'Organização, Sistemas e Métodos': ['OSM'],
  'Paradigmas de Linguagens de Programação': ['PLP'],
  'Probabilidade e Estatística': ['probabilidade e estatística', 'prob e estatística', 'estatística'],
  'Processo de Desenvolvimento de Software': ['PDS'],
  'Programação Web': ['PW'],
  'Programação Web I': ['PW I', 'PWI', 'PW1', 'PW 1'],
  'Programação Web II': ['PW II', 'PWII', 'PW2', 'PW 2'],
  'Programação para Dispositivos Móveis': ['PDM', 'programação mobile', 'programacao mobile'],
  'Projeto e Administração de Redes': ['PAR'],
  'Qualidade de Software': ['QS'],
  'Redes de Computadores': ['RC'],
  'Segurança da Informação': ['segurança da info', 'seguranca da info', 'seg info'],
  'Segurança de Redes de Computadores': ['SRC', 'segurança de redes', 'seguranca de redes'],
  'Segurança e Auditoria de Sistemas': ['SAS'],
  'Sistemas Distribuídos': ['SD'],
  'Sistemas Operacionais': ['SO'],
  'Sistemas de Apoio à Decisão': ['SAD'],
  'Trabalho de Conclusão de Curso I': ['TCC I', 'TCCI', 'TCC1', 'TCC 1'],
  'Trabalho de Conclusão de Curso II': ['TCC II', 'TCCII', 'TCC2', 'TCC 2']
});

// Disciplinas ministradas por mais de um docente ganham um cartão próprio.
// Assim, perguntas pela disciplina retornam todos os docentes envolvidos,
// enquanto perguntas pelo nome continuam abrindo o cartão individual.
const SI_SHARED_DISCIPLINES_2026_2 = Object.freeze({
  'Cálculo Diferencial Aplicado à Computação': Object.freeze({
    title: 'Disciplina Compartilhada — Cálculo Diferencial Aplicado à Computação',
    professorNames: Object.freeze([
      'Paulo Espinheira Menezes de Melo',
      'Thiago Leonardo Bastos da Silva'
    ]),
    semester: '2º semestre',
    days: 'terça-feira',
    hours: '18h30–20h10 e 20h20–22h',
    roomsByProfessor: Object.freeze({
      'Paulo Espinheira Menezes de Melo': 'H008',
      'Thiago Leonardo Bastos da Silva': 'H202'
    })
  })
});

function unique(values) { return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))]; }

function buildSiProfessorExactNamePhrases(item) {
  if (!item || item.pending) return [];
  const aliases = SI_PROFESSOR_TRIGGER_ALIASES_2026_2[item.name] || [];
  const firstName = String(item.name || '').trim().split(/\s+/u)[0] || '';
  // Nomes isolados são frases exatas. Isso permite “Crijina” ou “Crescêncio”
  // sem fazer o nome capturar qualquer conversa longa em que ele seja apenas citado.
  return unique([item.name, item.identifier, firstName, ...aliases]);
}

function buildSiProfessorNameTriggerSentences(item) {
  const aliases = SI_PROFESSOR_TRIGGER_ALIASES_2026_2[item.name] || [item.identifier].filter(Boolean);
  const templates = [
    'contato {nome}', 'contato de {nome}', 'contato do {nome}', 'contato da {nome}',
    'contato do professor {nome}', 'contato da professora {nome}',
    '{nome} contato',
    'ctt {nome}', 'ctt de {nome}', 'ctt do {nome}', 'ctt da {nome}', '{nome} ctt',
    'email {nome}', 'email de {nome}', 'email do {nome}', 'email da {nome}',
    'email do professor {nome}', 'email da professora {nome}', '{nome} email',
    'e-mail {nome}', 'e-mail de {nome}', 'e-mail do {nome}', 'e-mail da {nome}',
    'e-mail do professor {nome}', 'e-mail da professora {nome}', '{nome} e-mail',
    'dia {nome}', 'dia do {nome}', 'dia da {nome}', '{nome} dia',
    'dias {nome}', 'dias do {nome}', 'dias da {nome}', '{nome} dias',
    'qual dia {nome}', 'qual dia o {nome}', 'qual dia a {nome}',
    'que dia {nome}', 'que dia o {nome}', 'que dia a {nome}',
    'quais dias {nome}', 'quais dias o {nome}', 'quais dias a {nome}',
    'quando {nome}', 'quando o {nome}', 'quando a {nome}', '{nome} quando',
    'horário {nome}', 'horário do {nome}', 'horário da {nome}', '{nome} horário',
    'horários {nome}', 'horários do {nome}', 'horários da {nome}', '{nome} horários',
    'horario {nome}', 'horario do {nome}', 'horario da {nome}', '{nome} horario',
    'horarios {nome}', 'horarios do {nome}', 'horarios da {nome}', '{nome} horarios',
    'quais os dias de aula de {nome}', 'quais os dias de aula do professor {nome}',
    'quais os dias de aula da professora {nome}', 'quais os dias de aula da prof {nome}',
    'quais dias de aula de {nome}', 'quais dias de aula do professor {nome}',
    'quais dias de aula da professora {nome}', 'quais dias de aula da prof {nome}',
    'em quais dias {nome} da aula', 'em quais dias {nome} dá aula',
    '{nome} da aula em quais dias', '{nome} dá aula em quais dias',
    'professor {nome} da aula em quais dias', 'professor {nome} dá aula em quais dias',
    'professora {nome} da aula em quais dias', 'professora {nome} dá aula em quais dias',
    'prof {nome} da aula em quais dias', 'prof {nome} dá aula em quais dias',
    'quais materias {nome} ensina', 'quais matérias {nome} ensina',
    'quais disciplinas {nome} ensina', 'quais disciplinas {nome} ministra',
    'quais materias o professor {nome} da', 'quais matérias o professor {nome} dá',
    'quais materias a professora {nome} da', 'quais matérias a professora {nome} dá',
    'professor {nome} da aula em quais dias e para quais materias',
    'professora {nome} da aula em quais dias e para quais materias',
    'prof {nome} da aula em quais dias e para quais materias',
    'sala {nome}', 'sala de {nome}', 'sala do professor {nome}', 'sala da professora {nome}',
    'sala da aula do professor {nome}', 'sala da aula da professora {nome}',
    'sala da turma do professor {nome}', 'sala da turma da professora {nome}',
    'qual sala {nome}', 'qual a sala de {nome}', 'em qual sala {nome}',
    'qual é a sala da aula do professor {nome}', 'qual e a sala da aula do professor {nome}',
    'qual é a sala da aula da professora {nome}', 'qual e a sala da aula da professora {nome}',
    'em qual sala é a aula do professor {nome}', 'em qual sala e a aula do professor {nome}',
    'em qual sala é a aula da professora {nome}', 'em qual sala e a aula da professora {nome}',
    'em qual sala é a turma do professor {nome}', 'em qual sala e a turma do professor {nome}',
    'em qual sala é a turma da professora {nome}', 'em qual sala e a turma da professora {nome}',
    'onde {nome}', 'onde fica {nome}', 'onde é a aula de {nome}', 'onde e a aula de {nome}',
    'laboratório {nome}', 'laboratorio {nome}', 'lab {nome}',
    'laboratório do professor {nome}', 'laboratorio do professor {nome}', 'lab do professor {nome}',
    '{nome} no ifba', '{nome} está no ifba', '{nome} esta no ifba',
    '{nome} vai ao ifba', '{nome} vai pro ifba', '{nome} vai para o ifba'
  ];
  return unique(aliases.flatMap(alias => templates.map(template => template.replace('{nome}', alias))));
}

const SI_DISCIPLINE_FULL_NAME_TEMPLATES = Object.freeze([
  'contato professor de {disciplina}', 'contato do professor de {disciplina}',
  'contato professora de {disciplina}', 'contato da professora de {disciplina}',
  'contato docente de {disciplina}', 'qual contato professor de {disciplina}',
  'qual o contato do professor de {disciplina}', 'qual o contato da professora de {disciplina}',
  'ctt professor de {disciplina}', 'ctt do professor de {disciplina}',
  'email professor de {disciplina}', 'email do professor de {disciplina}',
  'email professora de {disciplina}', 'email da professora de {disciplina}',
  'e-mail professor de {disciplina}', 'e-mail do professor de {disciplina}',
  'e-mail professora de {disciplina}', 'e-mail da professora de {disciplina}',
  'quem é o professor de {disciplina}', 'quem e o professor de {disciplina}',
  'quem é a professora de {disciplina}', 'quem e a professora de {disciplina}',
  'quem ensina {disciplina}', 'quem dá {disciplina}', 'quem da {disciplina}',
  'que dia professor de {disciplina}', 'que dia o professor de {disciplina}',
  'qual dia professor de {disciplina}', 'qual dia o professor de {disciplina}',
  'quando professor de {disciplina}', 'quando o professor de {disciplina}',
  'horário professor de {disciplina}', 'horário do professor de {disciplina}',
  'horario professor de {disciplina}', 'horario do professor de {disciplina}',
  'que dia tem {disciplina}', 'quando tem {disciplina}',
  'horário de {disciplina}', 'horario de {disciplina}',
  'sala de {disciplina}', 'qual a sala de {disciplina}', 'em qual sala tem {disciplina}',
  'onde tem {disciplina}', 'onde é {disciplina}', 'onde e {disciplina}',
  'laboratório de {disciplina}', 'laboratorio de {disciplina}', 'lab de {disciplina}'
]);

const SI_DISCIPLINE_ABBREVIATION_TEMPLATES = Object.freeze([
  'professor de {disciplina}', 'professora de {disciplina}',
  'contato de {disciplina}', 'contato professor de {disciplina}',
  'qual o contato de {disciplina}', 'ctt de {disciplina}',
  'email de {disciplina}', 'email professor de {disciplina}',
  'e-mail de {disciplina}', 'e-mail professor de {disciplina}',
  'quem ensina {disciplina}', 'quem dá {disciplina}', 'quem da {disciplina}',
  'que dia tem {disciplina}', 'quando tem {disciplina}',
  'horário de {disciplina}', 'horario de {disciplina}',
  'sala de {disciplina}', 'qual a sala de {disciplina}', 'em qual sala tem {disciplina}',
  'onde tem {disciplina}', 'onde é {disciplina}', 'onde e {disciplina}',
  'laboratório de {disciplina}', 'laboratorio de {disciplina}', 'lab de {disciplina}'
]);

function buildDisciplineTriggerSentences(discipline) {
  const aliases = unique(SI_DISCIPLINE_ALIASES_2026_2[discipline] || []);
  return unique([
    ...SI_DISCIPLINE_FULL_NAME_TEMPLATES.map(template => template.replace('{disciplina}', discipline)),
    ...aliases.flatMap(alias => SI_DISCIPLINE_ABBREVIATION_TEMPLATES.map(template => template.replace('{disciplina}', alias)))
  ]);
}

function buildSiProfessorDisciplineTriggerSentences(item) {
  const disciplines = unique((item.classes || []).map(entry => entry[0]))
    .filter(discipline => !SI_SHARED_DISCIPLINES_2026_2[discipline]);
  return unique(disciplines.flatMap(buildDisciplineTriggerSentences));
}

function buildSharedDisciplineCards2026_2() {
  const professorByName = new Map(SI_PROFESSORS_2026_2.map(item => [item.name, item]));
  return Object.entries(SI_SHARED_DISCIPLINES_2026_2).map(([discipline, config]) => {
    const professors = config.professorNames.map(name => professorByName.get(name)).filter(Boolean);
    const responseLines = [
      `*${formatDisciplineLabel(discipline)}*`, '',
      '📧 *Docentes e contatos*',
      ...professors.map(item => `• *${item.name}* — ${item.email}`), '',
      `📚 *Semestre*\n${config.semester}`, '',
      '🗓️ *Horário e salas — 2026.2*',
      ...professors.map(item => `• *${item.name}*\n  ${config.days}, ${config.hours}\n  Sala: *${config.roomsByProfessor?.[item.name] || 'não informada'}*`), '',
      '_Fonte: quadro de horários versão 2, publicado em 28/07/2026._'
    ];
    return {
      title: config.title,
      discipline,
      response_text: responseLines.join('\n'),
      sentences: buildDisciplineTriggerSentences(discipline),
      tags: []
    };
  });
}
function buildSiProfessorTriggerSentences(item) {
  // Disciplinas são reconhecidas pelo diretório estruturado, por sigla e nome
  // completo. Os cards docentes guardam somente os identificadores do docente,
  // reduzindo milhares de sentenças duplicadas no Aho-Corasick.
  return buildSiProfessorNameTriggerSentences(item);
}

function buildSiProfessorResponse(item, emailOverride = '') {
  const joinHuman = values => {
    const clean = unique(values);
    if (clean.length <= 1) return clean[0] || '';
    return `${clean.slice(0, -1).join(', ')} e ${clean.at(-1)}`;
  };
  const email = item.pending
    ? '[IDENTIFICAR DOCENTE E ADICIONAR E-MAIL]'
    : (emailOverride || item.email || '[ADICIONAR NO PAINEL]');
  const classLines = (item.classes || []).flatMap(([discipline, semester, classDays, hours, room]) => [
    `*${formatDisciplineLabel(discipline)}* — ${semester}`,
    `${classDays}, ${hours}`,
    `Sala: *${room || 'não informada'}*`,
    ''
  ]);
  return [
    `*${item.name}*`, '',
    '📧 *Contato*', email, '',
    '📚 *Semestres*', joinHuman(item.semesters || []), '',
    '🗓️ *Horários e salas — 2026.2*', '',
    ...classLines,
    '_Fonte: quadro de horários versão 2, publicado em 28/07/2026._',
    ...(item.pending ? ['', '*Observação:* no quadro, o docente aparece apenas como “PROF. SUBSTITUTO DE ENG. AMBIENTAL 1”.'] : [])
  ].join('\n').replace(/\n{3,}/g, '\n\n');
}

module.exports = {
  SI_SCHEDULE_SOURCE_2026_2,
  SI_PROFESSORS_2026_2,
  SI_PENDING_2026_2,
  SI_PROFESSOR_TRIGGER_ALIASES_2026_2,
  SI_DISCIPLINE_CODES_2026_2,
  SI_DISCIPLINE_ALIASES_2026_2,
  SI_SHARED_DISCIPLINES_2026_2,
  formatDisciplineLabel,
  formatDisciplineNamesInText,
  buildDisciplineTriggerSentences,
  buildSharedDisciplineCards2026_2,
  buildSiProfessorExactNamePhrases,
  buildSiProfessorNameTriggerSentences,
  buildSiProfessorDisciplineTriggerSentences,
  buildSiProfessorTriggerSentences,
  buildSiProfessorResponse
};
