const FUN_CARDS_V0101 = Object.freeze([
  {
    key: 'hub-fun-como-passar-em-calculo',
    message: {
      title: 'Como passar em Cálculo?',
      response_text: 'Depende da sua religião:\n- Se católico, apele para todos os santos;\n- Se evangélico, faça jejum e campanha de oração;\n- Se for umbanda/candomblé, faça despacho pras entidades e pros orixás;\n- Se for ateu, apenas lamento.',
      priority: 70,
      active: true,
      archived: false,
      scope: 'both',
      trigger: {
        match_mode: 'all',
        sentences: ['como passar cálculo', 'como passar em cálculo', 'dicas para passar em cálculo'],
        keywords: [],
        required_words: [],
        require_question_mark: true,
        typo_tolerance: 0,
        excluded_words: ['tcc'],
        exact_phrases: [],
        synonym_group_ids: [],
        negative_examples: [],
        regex_pattern: '(?:(?:como|dicas?|jeito|forma|segredo|o que|qual)[^?\n]{0,120}(?:passar|passo|ser aprovad[oa])[^?\n]{0,100}(?:c[aá]lculo|calculo)|(?:c[aá]lculo|calculo)[^?\n]{0,100}(?:como|dicas?|jeito|forma|segredo|o que|qual)[^?\n]{0,120}(?:passar|passo|ser aprovad[oa]))[^?\n]*(?:\\?\\s*)?$',
        regex_flags: 'iu'
      }
    }
  }
]);

module.exports = { FUN_CARDS_V0101 };
