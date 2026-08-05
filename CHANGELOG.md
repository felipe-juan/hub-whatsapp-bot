# v0.19.0 — 2026-08-04

## Arquitetura

- Divide `bot-engine.js` em oito handlers: acadêmico, cards, contexto, correções, desambiguação, aprendizado, reações e fallback.
- Divide `admin-server.js` em rotas de autenticação, cards, aprendizado, dados acadêmicos, backups e diagnósticos.
- Divide `whatsapp.js` em conexão, mensagens recebidas, entregas, ciclo de vida e sincronização de grupos.
- Divide `database/migrations/legacy.js` em cinco grupos históricos de migração.
- Divide `content/bsi-course.js` em quatro pacotes temáticos, preservando os 50 cards e a ordem original.
- Adiciona teste arquitetural de tamanho, módulos e contratos públicos.

## Compatibilidade

- Nenhuma regra, card, rota, schema ou comportamento de conversa foi alterado intencionalmente.
- Mantidos manifestos de compatibilidade nas fachadas para diagnósticos estáticos e testes históricos.

# v0.18.0 — 2026-08-04

- unifica intenção, entidades, correções, exclusões, confiança, evidências e alternativas em um único modelo de consulta;
- aceita várias intenções na mesma pergunta, como professor + sala ou horário + dia;
- permite corrigir disciplina, professor, intenção, semestre e data dentro da própria frase e após respostas normais;
- separa o catálogo permanente de disciplinas das ofertas acadêmicas por período;
- gera aliases previsíveis, siglas com espaços, números romanos/arábicos, formas faladas e variações sem acento;
- inicia busca guiada quando o usuário lembra apenas semestre, professor ou assunto;
- mantém replies explícitos por uma janela maior que o contexto conversacional comum;
- unifica a identificação de novas solicitações durante diálogos pendentes;
- generaliza exemplos negativos em padrões revisáveis e exige prévia de impacto antes da aprovação;
- agrupa sugestões semelhantes, explica evidências, registra ocorrências, expiração e arquivamento;
- adiciona simulador de conversas completas e conversão de falhas em testes pelo painel;
- amplia o corpus permanente para 270 mensagens e cria 100 conversas executáveis e distintas;
- diferencia disciplina não reconhecida, reconhecida sem oferta e informação ausente na oferta;
- processa negações antes de selecionar cards e usa margem entre candidatos na desambiguação;
- mantém preferências locais temporárias de semestre, disciplina, professor e data;
- combina mensagens fragmentadas em sequência no transporte do WhatsApp;
- adiciona explicações e ações diretamente aos diagnósticos do painel;
- mede resolução, esclarecimento, abandono e campos ausentes por intenção;
- modulariza ativação, contexto, fragmentos, busca guiada, preferências e resposta;
- valida o esquema do estado conversacional antes de persistir;
- isola cada arquivo de teste em processo e banco próprios e gera variações automáticas;
- adiciona assistente de importação, comparação, rascunho e publicação de novo período;
- adiciona validade por registro acadêmico e precedência explícita entre exceções;
- reconhece “que horas”, perguntas “o que o setor faz?” e siglas faladas como “s o”.

# v0.17.0 — 2026-08-04

- corrige a corrupção do estado pendente: uma resposta inválida não substitui mais a pergunta original;
- estrutura o diálogo por intenção, disciplina, professor, semestre e data, permitindo corrigir apenas um campo;
- encerra automaticamente consultas após três respostas inválidas e aceita cancelar, sair, esquecer, nova pergunta, menu, lista de disciplinas e “não sei a matéria”;
- reconhece uma nova solicitação completa durante uma pergunta pendente e abandona silenciosamente a consulta anterior;
- cria um catálogo único de disciplinas com siglas, nomes, aliases, formas faladas, abreviações previsíveis e erros recorrentes;
- protege siglas curtas e ambíguas fora de contexto, mas as aceita quando o bot está aguardando uma disciplina;
- permite revisar e aprovar aliases aprendidos no painel, sem publicação automática;
- usa a mensagem citada do WhatsApp antes da pergunta pendente e do último assunto da conversa;
- aceita reply a qualquer mensagem do bot como ativação em grupos, além de ponto, prefixo `bot` e menção;
- normaliza ponto, prefixo `bot` e menção também no privado, onde continuam opcionais;
- amplia e centraliza elogios, agradecimentos e ofensas dirigidos ao bot, incluindo `obg`, `obrigada`, `bom bot`, `boa garoto`, `corno`, `burro`, `imprestável` e `fudido`;
- evita reações indevidas a frases como “bom dia”, “João é burro” e “essa matéria é fudida”;
- registra a rejeição de uma sugestão como possível exemplo negativo específico do card;
- adiciona ao painel a ação “Adicionar como exemplo negativo?” e só altera o card após aprovação;
- exibe o entendimento atual durante a recuperação e preserva os demais campos em correções explícitas;
- substitui o menu genérico da terceira falha por encaminhamento contextual para matrícula, estágio, biblioteca, auxílio, tecnologia ou TCC quando houver evidência;
- adiciona migração versionada para sugestões negativas, aliases de disciplinas e aliases aprovados;
- adiciona testes de conversa para estado inválido, saída, correção, reply citado, ativação, reações, aprendizado negativo e aliases.
- o atualizador da Oracle resolve o destino SSH por configuração e não presume mais que o alias `hub-oracle` exista;
- o executor de regressões cria automaticamente a pasta do banco em instalações limpas.

# v0.15.13 — 2026-08-04

- aceita `bote` como prefixo equivalente a `bot`;
- reconhece consultas fragmentadas e repetitivas combinando professor, disciplina e dia;
- inclui `econimia` como variação real de transcrição para Economia;
- substitui o nome local do CSV pelo link oficial do quadro no SharePoint.
