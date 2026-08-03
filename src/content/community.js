const COMMUNITY_CARDS = Object.freeze([
  {
    key: 'hub-easter-egg-felipe-juan-v0104',
    message: {
      title: 'Contato — Felipe Juan',
      response_text: [
        '👤 *Felipe Juan*', '',
        'Diretor-geral do Diretório Acadêmico de Sistemas de Informação — *DASI*.', '',
        '🎮 *Para conhecer meus hobbies*',
        'https://linktr.ee/felipojuano', '',
        '💼 *Profissionalmente*',
        'https://www.linkedin.com/in/felipe-juan/'
      ].join('\n'),
      priority: 74,
      active: true,
      archived: false,
      scope: 'both',
      trigger: {
        match_mode: 'all',
        sentences: [
          'juan', 'felipe juan', 'felipo juano',
          'contato juan', 'contato do juan', 'qual contato do juan', 'qual o contato do juan',
          'contato felipe juan', 'contato do felipe juan', 'qual contato do felipe juan',
          'quem é juan', 'quem e juan', 'quem é felipe juan', 'quem e felipe juan',
          'diretor do dasi', 'diretor geral do dasi', 'diretor-geral do dasi',
          'presidente do dasi', 'linktree juan', 'linktree felipe juan',
          'linkedin juan', 'linkedin felipe juan',
          'quem é o seu criador', 'quem e o seu criador', 'quem é seu criador', 'quem e seu criador',
          'quem te criou', 'quem criou você', 'quem criou voce', 'quem criou vc',
          'quem criou o bot', 'quem é o criador do bot', 'quem e o criador do bot',
          'quem criou o escravo do juan', 'criador do escravo do juan'
        ],
        keywords: [], required_words: [], excluded_words: [], exact_phrases: ['juan'],
        require_question_mark: true, typo_tolerance: 1, synonym_group_ids: [],
        negative_examples: [], regex_pattern: '', regex_flags: 'iu'
      }
    }
  },
  {
    key: 'hub-comunidade-bar-benjamin-v0104',
    message: {
      title: 'Bar perto do IFBA — Bar do Benjamin',
      response_text: [
        '🍻 *Bar do Benjamin*', '',
        'Um dos lugares de resenha perto do IFBA.', '',
        '📍 *Endereço*',
        'R. H, 2297–2407 — Zabelê, Vitória da Conquista — BA, 45077-064', '',
        '🧭 *Como chegar saindo do IFBA*',
        'Suba pela rua à esquerda do IFBA e continue até encontrar o bar em uma esquina.', '',
        '_No Google Maps, o estabelecimento pode aparecer como “Bar de Beijamim”._'
      ].join('\n'),
      priority: 66,
      active: true,
      archived: false,
      scope: 'both',
      trigger: {
        match_mode: 'all',
        sentences: [
          'bar perto do ifba', 'bar próximo do ifba', 'bar proximo do ifba',
          'qual bar perto do ifba', 'onde beber perto do ifba', 'onde tomar uma perto do ifba',
          'lugar de resenha perto do ifba', 'onde resenhar perto do ifba',
          'resenha perto do ifba', 'bar do benjamin', 'bar de beijamim',
          'bar do benjamim', 'onde fica o bar do benjamin'
        ],
        keywords: [], required_words: [], excluded_words: [], exact_phrases: [],
        require_question_mark: true, typo_tolerance: 1, synonym_group_ids: [],
        negative_examples: [], regex_pattern: '', regex_flags: 'iu'
      }
    }
  }
]);

module.exports = { COMMUNITY_CARDS };
