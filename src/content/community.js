const { injectFelipeJuanPhone } = require('../private-content');

const COMMUNITY_CARDS = Object.freeze([
  {
    key: 'hub-easter-egg-felipe-juan-v0104',
    message: {
      title: 'Contato — Felipe Juan',
      response_text: injectFelipeJuanPhone([
        '👤 *Felipe Juan*', '',
        'Diretor-geral do Diretório Acadêmico de Sistemas de Informação — *DASI*.', '',
        '🌐 *Projeto para o Curso*',
        'https://felipe-juan.github.io/hub-arquivos-ifba/', '',
        '🎮 *Para Conhecer Meus Hobbies*',
        'https://linktr.ee/felipojuano', '',
        '💼 *Profissionalmente*',
        'https://www.linkedin.com/in/felipe-juan/'
      ].join('\n')),
      priority: 74,
      active: true,
      archived: false,
      scope: 'both',
      trigger: {
        match_mode: 'all',
        sentences: [
          'contato juan', 'contato do juan', 'qual contato do juan', 'qual o contato do juan',
          'contato felipe', 'contato do felipe', 'qual contato do felipe', 'qual o contato do felipe',
          'felipe contato', 'felipe ctt', 'email do felipe', 'e-mail do felipe',
          'contato felipe juan', 'contato do felipe juan', 'qual contato do felipe juan',
          'felipe juan contato', 'juan contato',
          'quem é juan', 'quem e juan', 'quem é o juan', 'quem e o juan',
          'quem é felipe', 'quem e felipe', 'quem é o felipe', 'quem e o felipe',
          'quem é felipe juan', 'quem e felipe juan',
          'felipe do dasi', 'juan do dasi', 'felipe juan do dasi',
          'quem é o diretor do dasi', 'quem e o diretor do dasi',
          'contato do diretor do dasi', 'diretor do dasi', 'diretor geral do dasi', 'diretor-geral do dasi',
          'presidente do dasi',
          'link do felipe', 'links do felipe', 'site do felipe', 'projeto do felipe', 'hub do felipe',
          'linktree juan', 'linktree felipe', 'linktree felipe juan',
          'linkedin juan', 'linkedin felipe', 'linkedin felipe juan',
          'quem é o seu criador', 'quem e o seu criador', 'quem é seu criador', 'quem e seu criador',
          'quem te criou', 'quem criou você', 'quem criou voce', 'quem criou vc',
          'quem criou o bot', 'quem fez o bot', 'quem desenvolveu o bot', 'quem programou o bot',
          'quem é o criador do bot', 'quem e o criador do bot', 'criador do bot',
          'responsável pelo bot', 'responsavel pelo bot', 'desenvolvedor do bot',
          'quem criou o hub', 'quem fez o hub', 'quem desenvolveu o hub', 'quem criou o hub arquivos',
          'criador do hub', 'criador do hub arquivos', 'responsável pelo hub', 'responsavel pelo hub',
          'quem criou o escravo do juan', 'criador do escravo do juan'
        ],
        keywords: [], required_words: [], excluded_words: [], exact_phrases: ['juan', 'felipe', 'felipe juan', 'felipo juano'],
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
