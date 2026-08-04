'use strict';

const REPOSITORY_URLS = Object.freeze({
  notion: 'https://app.notion.com/p/felipejuan/Reposit-rio-BSI-2-0-2d71fedecab280bfb1d6e2a466724fb4',
  hub: 'https://felipe-juan.github.io/hub-arquivos-ifba/',
  drive: 'https://drive.google.com/drive/folders/1WC7rQ6et4OiSq_4eZ9rLbKqGNeUm37dA',
  driveCurrent: 'https://drive.google.com/drive/folders/1d7RuJsK8dhAFFu1z45nC6nYTscY8aqSl',
  driveLegacy: 'https://drive.google.com/drive/folders/1WC7rQ6et4OiSq_4eZ9rLbKqGNeUm37dA',
  survivalManual: 'https://enchanting-jackfruit-c87.notion.site/Manual-de-sobreviv-ncia-universit-ria-do-DASI-1ae70489ece280a88192e254a978fad7'
});

const RESOURCE_CARDS = Object.freeze([
  {
    key: 'hub-bsi-repositorios-arquivos-v0151',
    message: {
      title: 'BSI — Repositórios, arquivos e materiais',
      response_text: [
        '*Repositórios, arquivos e materiais de BSI*',
        '',
        '*Repositório BSI 2.0 — Notion*',
        'Em desenvolvimento. Reúne dicas pessoais e, no 1º semestre, provas de duas turmas.',
        REPOSITORY_URLS.notion,
        '',
        '*HUB Arquivos IFBA*',
        'Repositório de documentos institucionais, com recursos como calendário acadêmico, fluxogramas, barema e outros aplicativos úteis.',
        REPOSITORY_URLS.hub,
        '',
        '*Google Drive da turma 2025.2 — mais atual*',
        'Reúne materiais da turma que ingressou em 2025.2. Atualmente contém o 1º semestre e o 2º semestre, ainda em desenvolvimento.',
        REPOSITORY_URLS.driveCurrent,
        '',
        '*Google Drive de veteranos — todos os semestres*',
        'Possui um acervo mais amplo, organizado do I ao VI semestre e com documentos úteis. Parte do conteúdo pode estar desatualizada, especialmente por mudanças de professores e disciplinas.',
        REPOSITORY_URLS.driveLegacy,
        '',
        '*Manual de sobrevivência universitária do DASI*',
        'Guia produzido por veteranos com informações gerais sobre o IFBA e o curso de Sistemas de Informação.',
        REPOSITORY_URLS.survivalManual,
      ].join('\n'),
      priority: 97,
      active: true,
      archived: false,
      scope: 'both',
      tags: [],
      trigger: {
        match_mode: 'all',
        sentences: [
          'qual é o repositório de bsi', 'qual o repositório de bsi', 'qual repositório de bsi',
          'qual é o repositório', 'qual o repositório', 'que repositório tem os arquivos de bsi',
          'qual é o repositório do curso', 'qual o repositório do curso',
          'o que tem no repositório de bsi', 'o que tem no repositório do curso',
          'o que tem no repositório', 'o que tem no drive de bsi', 'o que tem nos arquivos de bsi',
          'que arquivos existem de bsi', 'que arquivos tem de bsi', 'que materiais existem de bsi',
          'onde estão os arquivos de bsi', 'onde ficam os arquivos de bsi', 'onde encontro os arquivos de bsi',
          'onde encontro materiais de bsi', 'onde encontro materiais do curso', 'onde encontro material das disciplinas',
          'onde encontro arquivos do curso', 'onde acho arquivos de bsi', 'onde acho materiais de bsi',
          'onde encontro provas antigas de bsi', 'onde encontro provas de bsi', 'onde estão as provas antigas',
          'qual é o drive de bsi', 'qual o drive de bsi', 'que drive tem os materiais de bsi',
          'qual é o drive mais atual de bsi', 'qual o drive mais atualizado de bsi',
          'qual é o drive da turma 2025.2', 'qual o drive da turma 2025.2',
          'qual é o drive dos veteranos', 'qual o drive dos veteranos',
          'qual drive tem todos os semestres', 'onde está o drive mais atual de bsi',
          'que drive tem as provas', 'onde está o drive de bsi', 'onde fica o drive de bsi',
          'quais são os links do drive', 'quais os links do drive', 'onde encontro os links do drive',
          'qual é o link do drive', 'qual o link do drive', 'que link tem os arquivos de bsi',
          'quais são os repositórios de bsi', 'quais repositórios de bsi',
          'me passa o repositório de bsi', 'manda o repositório de bsi', 'me passa o drive de bsi',
          'me passa os arquivos de bsi', 'manda os links de bsi', 'quais são os links úteis de bsi',
          'manda o drive de bsi', 'tem arquivos das matérias de bsi', 'tem material das matérias de bsi',
          'onde encontro o manual de sobrevivência do dasi', 'qual é o manual de sobrevivência do dasi',
          'qual é o hub arquivos', 'qual o hub arquivos', 'o que tem no hub arquivos', 'onde encontro o hub arquivos',
          'onde encontro dicas para calouros de bsi', 'tem provas do primeiro semestre de bsi'
        ],
        keywords: [],
        required_words: [],
        excluded_words: [],
        exact_phrases: [
          'repositório', 'repositorio', 'repositórios', 'repositorios', 'arquivos', 'drive', 'links do drive',
          'acervo', 'acervo bsi', 'links úteis bsi', 'links uteis bsi', 'hub arquivos', 'hub arquivos ifba',
          'repositório bsi', 'repositorio bsi', 'repositório de bsi', 'repositorio de bsi',
          'arquivos bsi', 'arquivos de bsi', 'drive bsi', 'drive de bsi',
          'drive mais atual', 'drive atualizado', 'drive 2025.2', 'drive da turma 2025.2',
          'drive dos veteranos', 'drive de veteranos', 'drive todos os semestres',
          'materiais', 'materiais bsi', 'materiais de bsi', 'materiais do curso', 'arquivos do curso',
          'provas antigas', 'provas de bsi', 'repositórios de bsi', 'repositorios de bsi',
          'manual de sobrevivência', 'manual de sobrevivencia'
        ],
        require_question_mark: true,
        regex_pattern: '',
        regex_flags: 'iu',
        typo_tolerance: 1,
        synonym_group_ids: [],
        negative_examples: [
          'repositório institucional do ifba', 'repositorio institucional do ifba',
          'repositório de tcc', 'repositorio de tcc', 'meu google drive',
          'o drive está cheio', 'arquivos do sistema operacional'
        ]
      },
      source_url: REPOSITORY_URLS.hub,
      source_title: 'Repositórios e materiais de BSI',
      verified_at: '2026-08-04',
      details_text: ''
    },
    legacyGroup: 'bsi'
  },
  {
    key: 'hub-bsi-quebra-pre-requisito-v0151',
    message: {
      title: 'BSI — Quebra de pré-requisito',
      response_text: [
        '*Como funciona a quebra de pré-requisito?*',
        '',
        'A solicitação é feita por meio de *protocolo*. Nele, explique de forma objetiva por que precisa cursar a disciplina sem ter cumprido o pré-requisito.',
        '',
        '*Justificativas que podem ser consideradas:*',
        '• atraso acadêmico causado por problema institucional;',
        '• necessidade da disciplina para concluir o curso no semestre atual;',
        '• necessidade de cursar uma disciplina ofertada esporadicamente.',
        '',
        'O pedido é analisado em reunião do *Colegiado do Curso*. Professores e representantes discentes avaliam a justificativa e votam pela aprovação ou rejeição.',
        '',
        '*A aprovação não é automática:* depende da justificativa apresentada e da decisão do Colegiado.'
      ].join('\n'),
      priority: 96,
      active: true,
      archived: false,
      scope: 'both',
      tags: [],
      trigger: {
        match_mode: 'all',
        sentences: [
          'como funciona a quebra de pré requisito', 'como funciona a quebra de prerequisito',
          'como pedir quebra de pré requisito', 'como solicitar quebra de pré requisito',
          'onde pedir quebra de pré requisito', 'onde solicitar quebra de pré requisito',
          'o que preciso para quebrar um pré requisito', 'o que precisa para quebra de pré requisito',
          'qual é o processo para quebra de pré requisito', 'qual o processo para quebra de pré requisito',
          'qual justificativa usar na quebra de pré requisito', 'como justificar quebra de pré requisito',
          'quem aprova a quebra de pré requisito', 'quem avalia a quebra de pré requisito',
          'o colegiado aprova quebra de pré requisito', 'precisa de protocolo para quebra de pré requisito',
          'posso cursar uma disciplina sem o pré requisito', 'como cursar disciplina sem pré requisito',
          'quero cursar uma matéria sem pré requisito', 'quero quebrar o pré requisito de uma disciplina',
          'como quebrar requisito de disciplina', 'como funciona a dispensa de pré requisito'
        ],
        keywords: [],
        required_words: [],
        excluded_words: [],
        exact_phrases: [
          'quebra de pré-requisito', 'quebra de pre-requisito', 'quebra de pré requisito',
          'quebra de pre requisito', 'quebra de prerequisito', 'quebra de requisito',
          'quebrar pré-requisito', 'quebrar pre-requisito', 'quebrar pré requisito',
          'quebrar pre requisito', 'dispensa de pré-requisito', 'dispensa de pre-requisito'
        ],
        require_question_mark: true,
        regex_pattern: '',
        regex_flags: 'iu',
        typo_tolerance: 1,
        synonym_group_ids: [],
        negative_examples: []
      },
      source_url: '',
      source_title: '',
      verified_at: '2026-08-04',
      details_text: ''
    },
    legacyGroup: 'bsi'
  },
  {
    key: 'hub-bsi-numeracao-salas-predios-v0151',
    message: {
      title: 'Campus — Como identificar prédio, andar e sala',
      response_text: [
        '*Como identificar o prédio e o andar pela sala*',
        '',
        'O código da sala indica a localização:',
        '',
        '• *A letra representa o bloco ou prédio.*',
        '  `B12` → *Bloco B*',
        '  `H008` → *Bloco H*',
        '',
        '• *O primeiro número após a letra representa o andar.*',
        '  `H008` → térreo do Bloco H',
        '  `H408` → 4º andar do Bloco H',
        '',
        '• Os números restantes identificam a sala dentro daquele andar.',
        '',
        '*No curso de BSI*',
        'As aulas ocorrem no *Bloco H*. As salas `H40x`, onde ficam os laboratórios do curso, estão no *4º andar*.'
      ].join('\n'),
      priority: 94,
      active: true,
      archived: false,
      scope: 'both',
      tags: [],
      trigger: {
        match_mode: 'all',
        sentences: [
          'qual prédio será ministrada a aula', 'qual predio será ministrada a aula',
          'em qual prédio a aula será ministrada', 'em qual predio a aula sera ministrada',
          'em qual prédio será a aula', 'em qual predio será a aula',
          'em qual prédio fica a sala', 'em qual predio fica a sala',
          'qual é o prédio da aula', 'qual o prédio da aula', 'qual é o predio da aula',
          'qual bloco será a aula', 'em qual bloco será a aula', 'qual bloco fica a sala',
          'como saber o prédio pela sala', 'como saber o predio pela sala',
          'como saber o bloco pela sala', 'como identificar o prédio pela sala', 'como identificar o predio pela sala',
          'como funciona a numeração das salas',
          'como funciona a numeracao das salas', 'o que significa a letra da sala',
          'o que significa h008', 'o que significa h408', 'o que significa o h da sala',
          'que prédio é h008', 'que predio é h008', 'em que prédio fica h008', 'em que predio fica h008',
          'h008 fica em qual prédio', 'h008 fica em qual predio',
          'qual andar fica h408', 'em qual andar ficam os laboratórios de bsi',
          'em qual andar ficam os laboratorios de bsi', 'onde ficam as salas h40x',
          'onde fica o bloco h', 'qual andar é a sala h408', 'como saber o andar da sala',
          'as aulas de bsi são em qual bloco',
          'as aulas de bsi sao em qual bloco', 'qual é o prédio de bsi', 'qual o predio de bsi'
        ],
        keywords: [],
        required_words: [],
        excluded_words: [],
        exact_phrases: [
          'prédio da aula', 'predio da aula', 'bloco da aula', 'numeração das salas',
          'numeracao das salas', 'andar da sala', 'bloco h', 'prédio de bsi',
          'predio de bsi', 'bloco de bsi', 'salas h40x'
        ],
        require_question_mark: true,
        regex_pattern: '',
        regex_flags: 'iu',
        typo_tolerance: 1,
        synonym_group_ids: [],
        negative_examples: [
          'qual sala é a aula', 'qual é a sala de lpi', 'onde o professor está agora'
        ]
      },
      source_url: '',
      source_title: '',
      verified_at: '2026-08-04',
      details_text: ''
    },
    legacyGroup: 'bsi'
  }
]);

module.exports = { RESOURCE_CARDS, REPOSITORY_URLS };
