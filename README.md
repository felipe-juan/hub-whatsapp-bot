# HUB WhatsApp Bot v0.14.2

Bot comunitário autohospedado para grupos e conversas privadas ligados ao HUB Arquivos IFBA. Cada automação reúne **gatilhos editáveis** e a **resposta completa** que será enviada.

> [!IMPORTANT]
> ### Todo o código deste repositório foi criado por IA generativa, em especial ChatGPT/OpenAI, a partir de instruções, ideias, testes e revisões humanas.
>
> O mantenedor humano atuou principalmente como **idealizador, testador, revisor, curador de conteúdo e validador visual/funcional** do projeto.

> [!WARNING]
> O projeto usa Baileys, uma integração não oficial com o WhatsApp. Use um número separado, responda apenas a solicitações reais, evite mensagens em massa e não apresente o bot como serviço oficial do IFBA. Respostas simultâneas são organizadas por conversa, mas nenhuma integração não oficial garante que a conta nunca será restringida.


## Respostas seletivas, repositório e referências do HUB — v0.14.2

- perguntas sobre docentes e disciplinas retornam somente os campos solicitados, como sala, horário, dia, professor, contato ou semestre;
- consultas com mais de um campo combinam apenas as informações pedidas, sem anexar automaticamente contato, outras disciplinas ou o card completo;
- o termo `repositório` passa a acionar o card existente de links do Google Drive, inclusive em bancos já configurados;
- cards documentais relacionados passam a incluir, quando cabível, o endereço público do HUB Arquivos IFBA: `https://felipe-juan.github.io/hub-arquivos-ifba/`;
- perguntas como `Crescêncio dá aula hoje?` e `Crescêncio tem aula hoje?` são reconhecidas como confirmação de presença ou realização da aula e não acionam o card docente;
- novas regressões automatizadas protegem esses comportamentos durante futuras atualizações.


## Proteção contra confirmação docente sem data — v0.14.1

- perguntas de confirmação como `Crescéncio vai dar aula né?`, `Crescêncio vai dar aula?` e `vai ter aula com Crescêncio?` não ativam mais o card docente;
- esse padrão é tratado como pergunta sobre presença ou realização efetiva da aula, informação que o bot não consegue confirmar;
- a proteção funciona mesmo quando a frase não contém `hoje`, `amanhã` ou um dia da semana;
- consultas objetivas continuam funcionando, como `quais dias Crescêncio dá aula?`, `qual sala de Crescêncio?` e `Crescêncio dá aula de qual matéria?`.


## Precisão, disciplinas e desempenho — v0.14.0

- a escolha de semestre mostra apenas exemplos numéricos (`3`, `5` ou `8`), embora continue aceitando ordinais e formas por extenso;
- o card de Felipe Juan aceita também `felipe` e inclui o projeto `felipe-juan.github.io/hub-arquivos-ifba/`;
- todos os títulos dos cards seguem capitalização portuguesa; a calculadora passa a se chamar **Calculadora de Prova Final**;
- consultas por disciplina aceitam sigla ou nome completo, incluindo `sala e dia de aula de LPII`, `horários de Linguagem de Programação II` e múltiplas disciplinas;
- no privado, consultas múltiplas enviam um card por professor/disciplina; em grupos, os vários resultados são enviados no privado do participante;
- cada mensagem é normalizada e classificada uma única vez, usando um snapshot único de configurações, cards, docentes, setores e catálogo de disciplinas;
- o quadro semanal é consultado somente pelo dia e semestre necessários, enquanto um catálogo compacto reconhece disciplinas novas importadas;
- a classificação central diferencia consulta ao quadro, narrativa, confirmação de aula normal e confirmação de presença docente;
- o painel possui casos permanentes de regressão, executados também antes de uma atualização;
- os gatilhos docentes deixaram de duplicar milhares de frases de disciplinas: o índice caiu de cerca de 10,6 mil para 5,7 mil padrões.


## Confirmações sobre aula normal — v0.13.3

- mensagens como `vai ter aula hoje normal`, `hoje vai ter aula normal?` e `as aulas de sexta serão normais?` não abrem mais a escolha de semestre;
- esse tipo de pergunta é tratado como confirmação sobre o funcionamento real das aulas, informação que o bot não consegue verificar;
- no privado, a exceção também suprime o fallback genérico, deixando a mensagem sem resposta;
- se havia um pedido de semestre pendente, a confirmação não consome o contexto: a pessoa ainda pode informar o semestre na mensagem seguinte;
- perguntas abertas e objetivas, como `qual é o horário normal das aulas de hoje no 3º semestre?`, continuam funcionando.


## Continuação garantida do semestre — v0.13.2

- quando o bot pergunta `Qual semestre você quer consultar?`, a próxima mensagem da mesma pessoa é analisada prioritariamente, inclusive em grupos e sem reply;
- respostas como `5 semestre`, `5º semestre`, `quinto semestre` e apenas `5` são equivalentes;
- replies usam também o ID exato da mensagem do bot, evitando perda de contexto quando o WhatsApp alterna o participante entre identificadores PN e LID;
- o contexto é armazenado com todos os aliases conhecidos da pessoa, sem misturar usuários diferentes do mesmo grupo;
- uma resposta inválida recebe uma orientação específica com exemplos e não aciona o fallback genérico do privado.




## Gestão da Oracle, integridade e manutenção — v0.13.0

- contexto curto sem reply em conversas privadas para continuações como `e sexta?`, mantendo reply obrigatório em grupos;
- relatório de consistência para e-mails, siglas, salas, choques de horário, anexos e exceções acadêmicas;
- fila persistente de saída visível no painel, com retomada após reinícios, tentativas e deduplicação;
- nova área **Sistema e manutenção** com memória, swap, disco, logs, teste de envio, verificação e reinício do serviço;
- atualização da Oracle pelo painel a partir do GitHub, com backup completo, integridade SHA-256, testes, health check e rollback automático;
- backup externo criptografado, com retenções diária, semanal e pré-atualização e suporte a diretório montado ou `rclone`;
- editor estruturado de professor, disciplina, sigla, semestre, dia, horário e sala, preservando os cards personalizados;
- histórico e reversão de alterações em docentes, horários, calendário e configurações;
- gatilhos corrigidos para contato da Coordenação de BSI e consultas de sala de aula por professor;
- desambiguação mais conservadora, sem confundir nomes claramente diferentes como Pablo e Paulo.

### Ativação dos controles da Oracle

Depois de instalar a versão na VM, execute uma única vez:

```bash
sudo bash scripts/install-oracle-management.sh
```

Esse comando instala um auxiliar restrito para consultar registros, reiniciar o serviço e aplicar pacotes já validados pelo próprio bot. O painel não recebe acesso geral a `sudo`.

Para backups externos criptografados, defina no `.env` da VM uma frase secreta com pelo menos 12 caracteres:

```env
HUB_BACKUP_PASSPHRASE=troque-por-uma-frase-longa-e-unica
```

Depois, em **Sistema e manutenção**, informe um destino `file:/caminho/montado` ou um remoto do `rclone`. A frase secreta não é exibida nem armazenada no banco.

## Atualização segura, contexto e confiabilidade — v0.12.0

- importação do quadro docente com prévia granular e aplicação seletiva de mudanças;
- preservação de e-mails, anexos, gatilhos, escopo e personalizações dos cards;
- continuação contextual por reply para dia, semestre, sala e professor;
- aprendizado assistido de mensagens não reconhecidas, sempre sujeito à aprovação no painel;
- detecção mais segura entre perguntas e comentários sobre aulas;
- exceções acadêmicas em intervalos, recorrências semanais e importação por CSV;
- deduplicação persistente de mensagens recebidas, inclusive após reinicializações;
- correções de integridade na sincronização estruturada de professores e no reconhecimento de intenção.

## Quadro estruturado, calendário e tolerância contextual — v0.11.0

- o quadro 2026.2 passa a ser armazenado em campos próprios: professor, e-mail, disciplina, sigla, semestre, dia, início, fim, sala, período e fonte;
- consultas como `aulas de amanhã do 3º semestre` usam esses registros estruturados e começam com dia, data e semestre;
- o painel possui **Calendário e exceções**, onde podem ser cadastrados feriados, recessos, suspensões, sábados letivos, reposições e mudanças temporárias de sala;
- exceções alteram somente a resposta da data correspondente e preservam o quadro semanal original;
- nomes docentes aceitam erro moderado; siglas institucionais aceitam um erro curto; palavras genéricas como `aula`, `contato` e `sala` não recebem aproximação;
- trocas adjacentes como `Amnada` e `COERS` são tratadas como um único erro de digitação;
- o backup JSON v11 preserva também o quadro estruturado e as exceções acadêmicas criadas no painel.

## Consultas docentes e reações privadas — v0.10.9

- perguntas como `quais os dias de aula da prof Amanda` e `professora Amanda dá aula em quais dias e para quais matérias` abrem o card completo da docente;
- perguntas desse tipo funcionam mesmo sem `?` quando a estrutura interrogativa aparece depois do nome do professor;
- no privado, `vlw`, `obrigado`, elogios ou ofensas geram somente a reação correspondente mesmo sem reply ou menção;
- em grupos, reações continuam limitadas a reply, menção real por `@` ou identificação explícita do bot.

## Correção da coordenação de BSI — v0.10.8

- Atualiza o coordenador atual de BSI para **Pablo Freire Matos**.
- Corrige tanto o card de coordenador quanto o card de contato da coordenação.
- Aplica a correção automaticamente em instalações existentes, preservando demais personalizações dos cards.

## Coordenação e consultas de aula mais claras — v0.10.7

- adiciona um card oficial com coordenador, e-mail, telefone, ramal e sala da Coordenação de BSI;
- toda consulta dinâmica começa com um título como `Aula de Segunda-Feira - 3º Semestre`;
- aceita `2 semestre`, `2º semestre`, `2° semestre`, `2o semestre`, `segundo semestre` e `semestre 2`;
- quando falta o semestre, a pergunta mostra o dia consultado e exemplos de como responder;
- a continuação aceita também respostas curtas como `2`, `2º` ou `segundo`;
- consultas podem usar aula, matéria, disciplina, cadeira, componente, horário ou apenas dia + semestre.
- frases narrativas sobre “aula normal” ou dias sem aula não abrem a pergunta de semestre por engano.

## Aulas por semestre, contato privado e ACEX — v0.10.6

- consultas por **dia + semestre** retornam somente disciplina, sala e professor;
- reconhece `hoje`, `amanhã`, `depois de amanhã`, dias da semana e formas curtas como `amanhã terceiro semestre`;
- quando a pessoa informa o dia, mas não o semestre, o bot pergunta qual semestre deseja e aceita uma resposta curta em seguida;
- usa a data real da mensagem do WhatsApp e o fuso `America/Bahia` para interpretar expressões relativas;
- corrige a sigla das Atividades Curriculares de Extensão para **ACEX**, mantendo `ACE` apenas como alias de compatibilidade;
- amplia elogios, agradecimentos, ofensas e xingamentos reconhecidos nas reações contextuais;
- o telefone privado de Felipe Juan fica em `private-content.json`, preservado nas atualizações e ignorado pelo Git, sem entrar no pacote público do GitHub.

## Calculadora, reações e siglas — v0.10.5

- `!final` mostra somente a situação e a nota mínima necessária, sem exibir a MF;
- a faixa da média aparece com 🟢, 🔵, 🟡, 🟠 ou 🔴, seguindo a tabela da final;
- agradecimentos e elogios dirigidos ao bot recebem ❤️; ofensas dirigidas ao bot recebem 😔;
- a reação ocorre ao responder uma mensagem do bot, mencioná-lo por `@` ou citar explicitamente `bot`, `Escravo do Juan` e variantes;
- o card de Felipe Juan aceita `juan`, consultas de contato e perguntas sobre quem criou o bot;
- os cards docentes exibem `SIGLA - Nome completo` para todas as disciplinas.

## Final, salas e novos cards — v0.10.4

- mantém somente o comando `!final`; comandos antigos de média, frequência, horas e média ponderada foram removidos;
- `!final 6,9` trata o único valor como a média das unidades e informa a nota mínima da prova final;
- `!final 5,0 6,0 7,0` calcula primeiro a média das unidades e depois informa a situação e a nota mínima;
- atualiza os 28 cards de docentes e a pendência de Meio Ambiente com as salas do quadro 2026.2, versão 2, de 28/07/2026;
- reorganiza os cards docentes em contato, semestres e horários/salas, com um emoji por tópico;
- reconhece consultas por `sala`, `onde`, `laboratório`, `laboratorio` e `lab`;
- acrescenta o card oficial de trancamento da graduação, o contato de Felipe Juan e o Bar do Benjamin;
- a palavra “bot” não é mais tratada como menção em grupos: a ajuda por menção exige um `@` real do WhatsApp.


## Preservação e recuperação de anexos — v0.10.3

A v0.10.3 corrige uma regressão específica da atualização anterior: anexos personalizados do card **Como passar em Cálculo?** não podem mais ser confundidos com conteúdo oficial do pacote. Quando a v0.10.2 removeu esse anexo durante a atualização, a v0.10.3 recupera automaticamente os metadados a partir do histórico do próprio card, mantendo o arquivo armazenado em `data/attachments`. Atualizações futuras de cards do pacote também preservam anexos adicionados pelo administrador.

## Perguntas completas sem ponto de interrogação — v0.10.2

- perguntas completas funcionam mesmo sem `?` final quando possuem ao menos três termos e começam com uma estrutura interrogativa clara;
- são reconhecidos inícios como **como**, **onde**, **qual**, **quem**, **quando**, **posso**, **preciso**, **você sabe** e **gostaria de saber**;
- saudações e cortesias antes da pergunta são ignoradas na análise;
- a regra vale para cards automáticos, setores, contatos, horários e localização docente;
- frases incompletas, menções casuais e discurso relatado continuam bloqueados;
- o card **Como passar em Cálculo?** passa a responder com ou sem `?`, preservando resposta e anexo personalizados na atualização.

## Simplificação do painel e resposta privada — v0.10.1

- inclui o card de humor **Como passar em Cálculo?** com gatilhos específicos e sem conflito com TCC ou consultas sobre docentes da disciplina;
- remove etiquetas da interface, dos filtros, das ações em lote e do modelo CSV atual;
- remove o campo visível **Mais detalhes** do editor, sem quebrar continuações contextuais incorporadas aos cards institucionais;
- coloca as variáveis dentro de **Configurações avançadas**;
- usa o nome interno como título editável da própria janela de edição;
- responde no privado com uma mensagem de ajuda sempre que nenhum comando ou card for reconhecido.

## Preparação para a v1.0 — melhorias da v0.10.0

- perguntas longas passam por uma verificação semântica adicional, que bloqueia menções indiretas como “o professor comentou sobre o calendário acadêmico?”;
- intenções envolvendo TCC são separadas entre docente, roteiro, horário e pré-requisito;
- o menu `ajuda` é hierárquico e aceita escolhas numéricas por conversa;
- continuações contextuais ambíguas pedem confirmação em vez de forçar uma interpretação;
- cards acadêmicos podem oferecer resposta progressiva e submenu de ações;
- o editor calcula resposta, fonte e total da legenda, alerta acima de 900 caracteres e bloqueia anexos acima do limite técnico;
- banco, conteúdo e JavaScript do painel foram divididos em módulos menores;
- o pacote conserva somente os assets atuais e os da versão anterior;
- o instalador gera e valida `package-lock.json` quando ele ainda não existir, usa `npm ci` com scripts de ciclo de vida desativados e pode reutilizar uma árvore anterior com versões exatas quando o registro npm estiver indisponível.

## Instalação no Fedora GNOME

1. Extraia o ZIP.
2. Abra um terminal na pasta extraída.
3. Execute:

```bash
bash INSTALL.sh
```

O instalador copia o programa para `~/.local/share/hub-whatsapp-bot`, instala as dependências, configura o serviço em segundo plano, adiciona o AppIndicator e abre o painel.

Guarde a senha exibida. No painel, vincule o número por QR code:

```text
WhatsApp → Configurações → Dispositivos conectados → Conectar um dispositivo
```

A pasta extraída pode ser apagada depois da instalação.

## Painel

Áreas principais:

- 🏠 **Visão geral**;
- 💬 **Mensagens automáticas**;
- 🔎 **Diagnóstico em tempo real**;
- 🧮 **Calculadoras**;
- 👥 **Grupos**;
- 📈 **Estatísticas**;
- ⚙️ **Configurações**;
- 🧾 **Registros**.

Professores, links, FAQs e outros conteúdos são administrados como mensagens automáticas comuns.








## Respostas institucionais, contexto e anexos — v0.9.8

A v0.9.8 consolida os cards institucionais em `src/institutional-cards.js`, substitui os cards duplicados de setores por um cadastro estruturado e mantém os arquivos antigos apenas como adaptadores de compatibilidade. O painel permite editar nome, sigla, aliases, e-mail, WhatsApp, telefone, localização, serviços, fonte e data de confirmação de cada setor.

As respostas dos cards têm três partes independentes:

- resposta curta, enviada por padrão;
- detalhes opcionais, recuperados com `mais detalhes`;
- fonte e data de verificação, armazenadas separadamente e incluídas automaticamente na própria resposta.

O comando `qual a fonte?` continua disponível para repetir a referência do último card. Quando o link oficial já aparece no corpo da resposta, o bot não o repete no bloco de fonte. Perguntas como `Onde encontro os editais do PAAE?` são encaminhadas ao card de editais, sem serem confundidas com localização física do Serviço Social.

O contexto fica restrito à mesma conversa e expira em poucos minutos. Por exemplo, após `contato da CAENS`, a mensagem `e onde fica?` consulta a localização da CAENS sem afetar outras conversas. Fluxos guiados organizam dúvidas sobre estágio, TCC, atividades complementares, SUAP e auxílios.

Quando um card possui texto e anexo, o adaptador envia ambos no mesmo balão do WhatsApp por meio de legenda. Áudios acompanhados de texto e GIFs são enviados como documento com legenda, pois mensagens de áudio não aceitam legenda. O envio separado do texto ocorre somente como recuperação caso a mídia falhe.

## Consulta estruturada de localização docente — v0.9.7

O card **Onde está o professor — salas do IFBA** não depende mais de frases genéricas nem de uma resposta fixa. O motor reconhece uma intenção de localização, identifica o nome ou alias do docente e consulta o cadastro estruturado de professores.

Exemplos diretos aceitos sem `?`:

```text
sala do professor Allan
onde fica o professor Allan
qual é a sala do professor Allan
```

Desde a v0.10.2, mensagens maiores com estrutura interrogativa clara também funcionam sem `?`. Frases como `falei com Allan sobre a sala` continuam sem ativar o bot. Perguntas sobre coordenação, laboratórios, miniauditório, Biblioteca, CORES, CAENS, CAPNE e COTEP ficam fora desse card.

Quando o nome não é informado, o bot pergunta qual professor o estudante procura. Quando há mais de um docente com o mesmo nome, apresenta uma escolha por sobrenome. Desde a v0.10.4, perguntas sobre a sala da aula de um docente reconhecido de BSI abrem o card individual, que mostra as salas de cada disciplina conforme o quadro 2026.2. A orientação genérica sobre sala de atendimento permanece apenas quando não há um card docente específico disponível.

A sala só é enviada quando o cadastro contém simultaneamente:

- sala de atendimento;
- data de confirmação;
- fonte da confirmação.

Sem esses dados, o bot não faz suposições: informa o e-mail do docente, o contato da Coordenação de BSI e o painel geral de salas. Confirmações com mais de 180 dias recebem aviso de possível desatualização.

Em **Mensagens automáticas → Cadastro docente**, o administrador pode editar nome, e-mail, aliases, sala, bloco, fonte, data, disciplinas, horários e período acadêmico. A importação do quadro docente atualiza disciplinas e horários sem apagar uma sala já confirmada. O backup JSON preserva todo o cadastro estruturado.

## Correção dos conflitos de sala — v0.9.6

A v0.9.6 remove do card **Onde está o professor — salas do IFBA** os gatilhos excessivamente genéricos `qual sala`, `em qual sala`, `qual é a sala` e `qual e a sala`. Essas frases podiam se sobrepor aos cards específicos da coordenação, dos laboratórios e do miniauditório de BSI.

A migração corrige também bancos já existentes, inclusive quando o card foi personalizado ou possui rascunho e atualização de pacote pendente. Somente os quatro gatilhos inseguros são retirados; resposta, anexos, frases específicas de professor e demais alterações administrativas são preservados.

Perguntas específicas continuam funcionando, por exemplo `em qual sala está o professor Allan?`, enquanto uma mensagem genérica como `qual é a sala?` deixa de produzir resposta.

## Proteção global de gatilhos e cards de BSI — v0.9.5

A v0.9.5 incorpora diretamente 92 cards institucionais e acadêmicos revisados para estudantes do Bacharelado em Sistemas de Informação do IFBA — Campus Vitória da Conquista. A base inclui informações gerais do campus, CORES, Biblioteca, CAENS, Assistência Estudantil, CAPNE, COTEP, CGTI, SUAP, ingresso e conteúdos específicos de BSI, como coordenação, matrizes, PPC, TCC, estágio, atividades complementares, ACEX, laboratórios, Colegiado, DASI e BTech.

O mecanismo de gatilhos passou a aplicar, naquela versão, uma política global contra ativações acidentais. **A v0.10.2 ampliou essa regra para reconhecer perguntas completas sem `?`, mantendo as proteções descritas abaixo para menções sem intenção interrogativa:**

- mensagens sem `?` só respondem quando correspondem integralmente a uma frase direta cadastrada, como `calendário acadêmico`, `contato caens` ou `contato da caens`;
- mensagens com texto adicional só podem responder quando o último caractere não vazio é `?`;
- um `?` no meio da mensagem não libera o gatilho;
- palavras isoladas e genéricas não recebem a exceção de frase direta;
- a regra vale para cards antigos, cards incorporados nesta versão, cards personalizados existentes e cards criados futuramente pelo painel.

A migração preserva aliases úteis dos cards anteriores, remove gatilhos amplos conhecidos e atualiza os assets do painel para `app.0.9.5.js` e `app.0.9.5.css`.

## Segunda auditoria de estabilidade e segurança — v0.9.4

A v0.9.4 revisa novamente os caminhos de produção alterados na versão anterior. Timeouts de envio agora são tratados como resultado desconhecido, nunca como falha confirmada: o bot aguarda uma conclusão tardia, reconcilia o SQLite quando possível e mostra no painel as entregas que precisam de decisão manual. Cada reserva da fila recebe um token exclusivo, evitando perda ou duplicação quando uma resposta do worker fica incerta.

A exclusividade do núcleo é adquirida antes de abrir o banco ou criar processos auxiliares. Workers encerram ao perder o processo-pai, o socket Unix não pode ser removido por uma instância concorrente e mensagens IPC têm limites de tamanho e contrapressão.

O atualizador e o instalador Fedora passaram a preservar código e dependências funcionais antes de qualquer substituição. Em caso de falha, restauram a versão anterior sem depender da internet. Anexos deduplicados são validados pelo SHA-256 real; links simbólicos são recusados em anexos, backups e downloads. O painel também limita o custo e a memória das tentativas de login e usa assets próprios da v0.9.4 para impedir cache imutável de versões anteriores.

## Correções de estabilidade e segurança — v0.9.3

A v0.9.3 corrige condições de corrida em entregas persistentes e mutações administrativas, fortalece a recuperação do WhatsApp, cria snapshots SQLite consistentes para backups completos e impede gravações concorrentes do verificador de links. O instalador de atualizações também rejeita arquivos não declarados, links simbólicos e pacotes com expansão excessiva.

## Otimizações avançadas — v0.9.2

A v0.9.2 reduz ainda mais o trabalho executado para cada mensagem. Sentenças são localizadas por um índice Aho-Corasick, tokens e regras usam IDs numéricos e bitsets, resultados determinísticos entram em um cache LRU limitado e comandos ou correspondências exatas seguem um caminho rápido. A análise pode ser encerrada antecipadamente quando uma regra máxima e sem ambiguidade já foi encontrada.

Expressões regulares personalizadas passam por validação de tamanho e sintaxe segura e usam RE2JS em produção, evitando padrões conhecidos por retrocesso catastrófico. Regras inválidas são recusadas antes de substituir o snapshot ativo.

As gravações operacionais e administrativas são encaminhadas a um processo exclusivo do SQLite. Esse escritor reutiliza prepared statements, agrupa logs e estatísticas não críticos, executa `PRAGMA optimize`, `ANALYZE`, checkpoint do WAL e `incremental_vacuum` somente em momentos seguros. O Admin Center mantém uma contingência local caso o processo supervisionado esteja reiniciando.

Texto e mídia usam pools independentes: respostas textuais não aguardam PDFs, GIFs ou áudios grandes. Anexos iguais são deduplicados por SHA-256 e compartilham o mesmo arquivo físico. Núcleo, painel e trabalhadores trocam comandos por socket Unix local, e os serviços recebem prioridades diferentes de CPU e disco no systemd para que importações e backups não concorram igualmente com o WhatsApp.

## Otimizações de desempenho — v0.9.1

A v0.9.1 acrescenta uma camada de seleção rápida antes da validação completa dos gatilhos. Um índice invertido associa tokens como `caens`, `allan`, `mdi` e `fluxograma` apenas aos cartões relevantes; as regras candidatas ainda passam por todas as condições de sentença, palavras obrigatórias, exclusões, escopo, prioridade e desambiguação.

O envio usa contrapressão com limite configurável de conversas simultâneas, sem atraso artificial e sem descarte. Um circuit breaker reduz tentativas agressivas quando o WhatsApp apresenta erros repetidos, enquanto cada entrega recebe uma chave idempotente para evitar duplicação depois de timeout, reinício ou perda de confirmação.

O watchdog acompanha atraso do event loop, memória, banco, filas, erros consecutivos e progresso dos envios. A recuperação ocorre em etapas, desde renovar a conexão até reiniciar o serviço pelo systemd. O encerramento é controlado: novas mensagens deixam de entrar, trabalhos em andamento são concluídos dentro do limite, itens restantes voltam à fila persistente e o SQLite faz checkpoint antes de fechar.

As estatísticas são gravadas em lote, consultas frequentes usam prepared statements permanentes e o WAL recebe manutenção automática quando o bot está ocioso. Respostas estáticas ficam pré-renderizadas, texto tem prioridade sobre anexos, e anexos são entregues por caminho/stream sem leitura integral antecipada em memória.

O Admin Center passou a usar paginação no servidor e windowing real: somente a página consultada e os cartões próximos à área visível permanecem renderizados. JavaScript e CSS têm nomes versionados e cache imutável; eventos SSE são agrupados em pequenas janelas para evitar renderizações repetidas. O painel também mostra métricas p50, p95 e p99 de gatilho, processamento e envio, além do atraso do event loop e do estado do WAL.

## Arquitetura de desempenho e estabilidade — v0.9.0

A v0.9.0 reorganiza o núcleo para reduzir o tempo entre o recebimento e a resposta, evitar bloqueios do processo principal e preservar trabalhos em andamento durante reinicializações.

### Regras pré-compiladas e troca atômica

As mensagens ativas são normalizadas, tokenizadas e compiladas uma única vez. Cada mensagem recebida utiliza um snapshot imutável em memória. Ao salvar ou importar regras, o bot monta e valida um novo snapshot em segundo plano e só então troca a referência ativa; se a compilação falhar, a versão anterior continua funcionando.

### SQLite preparado para concorrência e recuperação

O banco utiliza WAL, `synchronous=NORMAL`, `busy_timeout` e índices específicos para mensagens, histórico, tarefas e entregas. Respostas ainda não concluídas são registradas em `outbound_deliveries`; após uma queda ou reinício, itens que estavam em envio retornam para a fila de recuperação, sem depender da memória do processo anterior.

### Núcleo sem operações pesadas de arquivo

O fluxo do WhatsApp usa APIs assíncronas para sessão, anexos e arquivos. Backup, importação, relatório de conflitos, verificação de links, atualização de pacote e outras tarefas administrativas são executados em um processo filho persistente. Assim, uma planilha grande, um ZIP ou uma verificação demorada não bloqueia o event loop responsável pelas respostas.

### Sockets e anexos

Listeners, temporizadores e referências de sockets antigos são removidos antes de reconectar. Anexos são resolvidos somente no momento do envio; a lista do painel recebe apenas metadados leves, sem o nome interno nem leitura do arquivo binário.

### Atualizações do painel em tempo real

O Admin Center recebe alterações por Server-Sent Events. O polling de estado foi reduzido para uma verificação de contingência a cada 60 segundos. Arquivos estáticos permanecem em cache por versão, enquanto dados modificados invalidam somente as áreas necessárias.

## Confiabilidade e administração na v0.8.14

### Fila por conversa

O processamento não usa uma fila global. Mensagens do mesmo grupo ou conversa privada são tratadas na ordem em que chegaram, enquanto conversas diferentes continuam em paralelo. Isso evita respostas fora de ordem sem atrasar outras pessoas.

### Atualização em massa do quadro docente

Na área **Mensagens automáticas**, o botão **📥 Atualizar quadro docente** aceita CSV, TSV ou XLSX com as colunas professor, e-mail, disciplina, semestre, dia, horário e período letivo. O painel mostra uma prévia antes de aplicar. Cartões existentes preservam gatilhos personalizados e recebem uma cópia no histórico; professores novos recebem cartões novos.

### Conteúdo do pacote e conteúdo personalizado

Cada cartão informa sua origem: pacote do HUB, importação docente ou criação no painel. Cartões do pacote também indicam se ainda estão no padrão ou se foram personalizados. Quando uma versão nova do HUB entra em conflito com uma edição local, ela fica pendente para comparação, com as opções **Manter minha versão** e **Usar versão nova**.

### Cards, lista e virtualização

A área de mensagens pode ser mostrada em cards ou lista. No modo cards, a quantidade de colunas pode ser dinâmica ou fixada entre uma e quatro. O carregamento é progressivo e o navegador usa `content-visibility` para não diagramar cartões fora da tela. As preferências ficam salvas no navegador.

## Menção ao bot sem comando reconhecido

Quando uma pessoa menciona o bot por texto (`bot`, `HUB Bot` ou o nome configurado) ou usa a menção `@` do WhatsApp, mas nenhuma mensagem automática, calculadora ou comando é reconhecido, o bot responde com uma orientação curta e três exemplos:

- contato de professor;
- contato de setor;
- informação institucional.

A resposta de orientação não substitui um gatilho válido: quando a mesma mensagem também corresponde a uma automação, a resposta configurada continua tendo prioridade. Mensagens comuns que não mencionam o bot permanecem ignoradas.

## Resposta imediata e painel responsivo na v0.8.8

- remove o intervalo artificial de 1,8 segundo entre respostas;
- processa conversas diferentes em paralelo e preserva a ordem das mensagens dentro de cada grupo ou conversa privada;
- não descarta perguntas por fila cheia ou limites preventivos;
- aplica antirrepetição por pessoa e deixa o valor padrão em zero;
- garante que uma falha de anexo, inclusive GIF, não impeça o envio do texto;
- aceita conectivos naturais em sentenças, como `como passar em cálculo`;
- reduz o custo de reabrir o painel ao reutilizar estatísticas e verificações do banco por curtos períodos;
- evita verificações completas do SQLite a cada atualização de 15 segundos.

## Desempenho e gatilhos institucionais na v0.8.7

A área de mensagens agora abre com um resumo leve dos cartões. O texto completo e a lista integral de gatilhos são carregados apenas quando uma mensagem é editada. A lista é montada progressivamente em blocos de cartões, enquanto o relatório de conflitos é calculado depois que os cartões já estão visíveis.

O relatório de conflitos passou a usar termos únicos, comparação limitada e cache invalidado somente quando as mensagens mudam. Isso evita que centenas de variações dos cartões de professores bloqueiem o painel.

CAPNE, CORES e CAENS reconhecem mais formas naturais de pedir contato, incluindo `telefone`, `número`, `whats`, `ctt` e construções como `como entrar em contato com a CAENS?`. A simples menção ao nome do setor continua sem responder.

## Conteúdo inicial de Sistemas de Informação — 2026.2

A v0.8.7 mantém e atualiza automaticamente, uma única vez, 28 mensagens editáveis para os professores informados do curso e uma mensagem adicional para a pendência da disciplina Meio Ambiente.

Cada cartão contém:

- nome completo;
- e-mail institucional informado, quando disponível;
- e-mail institucional de Luana Lima Bittencourt Silva atualizado para `luanabittencourt@ifba.edu.br`;
- semestres;
- dias no IFBA;
- disciplinas e horários;
- identificação pelo nome do professor, pelas disciplinas, pelos horários e pelo conteúdo da resposta.

Os gatilhos reconhecem pedidos de contato por `contato`, `ctt`, `email` ou `e-mail`, além de perguntas sobre dias e horários. A pessoa pode identificar o professor pelo nome ou pela disciplina, por exemplo `qual o contato do professor de Inteligência Artificial?`. Quando duas pessoas ministram a mesma disciplina, o bot oferece desambiguação. Os cartões são respostas automáticas comuns: podem ser editados, desativados, arquivados ou excluídos pelo painel.

O pacote também inclui mensagens prontas para:

- CAPNE, CORES e CAENS;
- protocolo;
- coordenação de Sistemas de Informação;
- consulta da sala de professores;
- fluxograma e matriz;
- média final e tabela da final;
- calendário acadêmico;
- quadro de horários de Sistemas de Informação 2026.2.


### Gatilhos mais seguros e siglas na v0.8.6

Os textos dos professores usam emojis somente para localizar rapidamente e-mail, disciplinas e calendário. A lista de mensagens automáticas pode ser exibida em cards ou lista. Nos cards, as colunas podem ser dinâmicas ou configuradas de uma a quatro; em telas menores, o layout se adapta automaticamente.

Os cartões reconhecem abreviações e siglas usadas pelos estudantes dentro de perguntas contextuais. Exemplos:

```text
quem ensina MDI?
email do professor de ADM
horário de IA
quem dá IHC?
professor de BDII
```

Siglas não são gatilhos isolados. Elas precisam aparecer em construções como “professor de”, “quem ensina”, “contato de” ou “horário de”. Isso evita que abreviações curtas causem respostas em conversas sem relação com a disciplina.

Os cartões institucionais também evitam palavras genéricas isoladas. Por exemplo, `tabela`, `matriz`, `protocolo`, `calendário` e `nota final` sozinhos não ativam respostas; são necessárias expressões como `tabela da final`, `matriz curricular`, `abrir um protocolo` ou `calendário acadêmico`. O contato da coordenação reconhece ainda `coordenador` e `coordenadora` quando acompanhados de uma intenção de contato.

O cartão de média final também informa os comandos:

```text
!final MP PF
!final help
```

## Ajuda da média final

O comando `!final` calcula a média depois da prova final quando recebe a MP e a PF:

```text
!final 5,75 7,0
```

Quando usado sozinho ou com `help`, apresenta a regra completa e um exemplo:

```text
!final
!final help
```

A ajuda informa:

- `MP ≥ 7`: aprovação por média;
- `2,5 ≤ MP < 7`: realização da prova final;
- `MP < 2,5`: reprovação sem direito à final;
- `MF = (MP×2 + PF) ÷ 3`;
- `PF necessária = 15 − (MP×2)`.

## Novidades da v0.8.0

### Estado permanente de saúde

O topo do painel mostra continuamente conexão, recebimento de mensagens, fila, quantidade de automações ativas e última resposta. O painel também alerta quando a conta está conectada, mas nenhuma mensagem é recebida dentro do tempo configurado.

### Diagnóstico simples e técnico

A área **Diagnóstico** permite alternar entre:

- **Modo simples**, com explicações diretas como “Ignorada: faltou a palavra ?”; 
- **Modo técnico**, com identificador da regra, pontuação, escopo, motivos e bloqueios.

### Editor com prévia e variáveis

O editor mostra a resposta ao lado de uma prévia semelhante ao WhatsApp, incluindo negrito, itálico, tachado, monoespaçado, blocos de código, links, emojis e nome do anexo. O nome interno é editado diretamente no título da janela. Em **Configurações avançadas**, também aceita:

```text
{{data}}
{{hora}}
{{nome_do_grupo}}
{{nome_da_pessoa}}
```

### Validação, ordem e administração em lote

Antes de salvar, o painel alerta sobre gatilhos ausentes, genéricos ou conflitantes. As regras podem ser ordenadas por arrastar; a ordem visual desempata regras equivalentes. A seleção múltipla permite ativar, desativar, arquivar, desarquivar, exportar ou excluir.

### Arquivamento e busca avançada

Mensagens arquivadas deixam a lista principal sem perder histórico. A busca aceita texto comum e filtros como:

```text
contato ativo
privado
anexo:pdf
status:inativo
status:arquivado
```

### Proteção contra ciclos entre bots

Nas configurações, podem ser cadastrados números de outros bots e prefixos como `[BOT]`. Mensagens desses números ou iniciadas por esses marcadores são ignoradas.

### Dashboard configurável e backup completo

Os cartões da visão geral podem ser escolhidos nas configurações. O backup completo em ZIP inclui banco SQLite, exportação JSON, configurações, histórico e anexos. A sessão do WhatsApp é opcional e deve ser tratada como uma senha.

## Mensagens automáticas

Cada item possui:

- nome interno, editável diretamente no título da janela;
- escopo: grupos e privado, somente grupos ou somente privado;
- sentenças ou trechos alternativos;
- palavras-chave cumulativas;
- resposta completa;
- anexo opcional;
- prioridade e condições avançadas.

### Dois canais de gatilho

Os campos **Sentenças ou trechos** e **Palavras-chave obrigatórias** ficam lado a lado e podem ser usados separadamente ou ao mesmo tempo.

A regra responde quando ocorrer uma destas condições:

1. pelo menos uma sentença/trecho estiver presente; **ou**
2. todas as palavras-chave estiverem presentes.

Exemplo:

```text
Sentenças ou trechos:
qual o contato de bruno
email do professor bruno

Palavras-chave obrigatórias:
bruno
contato
?
```

Tanto `Qual o contato de Brúno, por favor?` quanto `BRUNO: você sabe informar o CONTATO?` ativam a automação. A comparação ignora capitalização e acentos; a ordem das palavras-chave não importa; `?` é procurado literalmente.

O **nome interno nunca ativa a resposta**.

### Resposta integral

O bot envia exatamente o conteúdo do campo **Resposta completa do bot**. Nenhum título, e-mail, link, introdução ou rodapé é acrescentado automaticamente.

Ao salvar, a alteração é aplicada imediatamente.

### Anexo dentro do editor

O próprio editor permite associar, substituir ou remover:

- imagem;
- áudio;
- PDF;
- documentos do Word, Excel, PowerPoint ou LibreOffice;
- TXT, CSV ou ZIP.

Limite padrão: 25 MiB. Os arquivos ficam em `data/attachments/`.

### Duplicação e histórico

- **📄 Duplicar** cria uma cópia inativa;
- **🕘 Histórico** mantém até 50 versões anteriores e permite restaurá-las.

### Condições avançadas

Opcionalmente, é possível configurar:

- ponto de interrogação obrigatório;
- termos extras obrigatórios;
- termos que bloqueiam;
- tolerância de zero, um ou dois erros;
- exemplos negativos;
- sinônimos reutilizáveis;
- expressão regular;
- prioridade.

### Importação CSV

Modelo atual:

```csv
title,scope,sentences,keywords,require_question_mark,response_text,priority,active,publish
Contato de Bruno,both,"qual o contato de bruno|email do professor bruno","bruno|contato|?",false,"📧 contato.bruno@example.invalid",50,true,true
```

Colunas antigas de etiquetas ou pastas são ignoradas durante a importação.

## Grupos e conversas privadas

O bot responde em grupos e também no privado. No privado, quando nenhuma regra ou comando é reconhecido, ele envia automaticamente uma ajuda curta com exemplos. As permissões da área **Grupos** afetam somente os grupos.

Os grupos são sincronizados automaticamente após a conexão. Em cada grupo, pode-se liberar ou bloquear:

- ajuda;
- mensagens automáticas;
- calculadoras.

## Proteções contra excesso de automação

A v0.8.0 usa valores conservadores e permite ajustá-los no painel:

- intervalo mínimo entre envios;
- máximo global por minuto;
- máximo global por hora;
- máximo por pessoa por minuto;
- tamanho máximo da fila;
- antirrepetição por automação;
- deduplicação de eventos recebidos;
- mensagens recuperadas após reconexão desativadas por padrão;
- pausa após respostas HTTP 429/403;
- reconexão com espera exponencial;
- canais, status e broadcasts ignorados.

Essas medidas reduzem respostas duplicadas e rajadas. Elas não transformam o Baileys em API oficial nem eliminam o risco de restrição.

## Diagnóstico em tempo real

Mostra:

- mensagem recebida;
- grupo ou privado;
- regras analisadas;
- gatilhos encontrados e ausentes;
- motivo de resposta, bloqueio ou descarte;
- erro de anexo ou envio.

Os eventos ficam somente na memória, limitados aos 500 mais recentes, e desaparecem ao reiniciar o serviço.

## Calculadora da prova final

Existe somente um comando:

```text
!final
!final 6,9
!final 5,0 6,0 7,0
```

Com um valor, o bot considera que ele já é a média das unidades. Com vários valores, calcula a média aritmética das unidades. Em seguida, aplica as regras do IFBA: aprovação por média a partir de 7,0; direito à final entre 2,5 e 6,9; e `MF = (2×MP + PF) ÷ 3`, com aprovação na final a partir de 5,0. As notas não são armazenadas.

## Execução em segundo plano

```bash
systemctl --user status hub-whatsapp-bot.service
systemctl --user restart hub-whatsapp-bot.service
journalctl --user -u hub-whatsapp-bot.service -f
```

O computador precisa permanecer ligado, conectado e sem suspensão.

## Dados locais

```text
~/.local/share/hub-whatsapp-bot/data/hub-bot.sqlite
~/.local/share/hub-whatsapp-bot/data/.baileys_auth/
~/.local/share/hub-whatsapp-bot/data/backups/
~/.local/share/hub-whatsapp-bot/data/attachments/
~/.local/share/hub-whatsapp-bot/.env
```

Não publique esses arquivos. A pasta `.baileys_auth` equivale a uma credencial persistente.

Backups JSON preservam regras, histórico e metadados de anexos, mas não incorporam os binários. O botão **Backup completo ZIP** inclui também `data/attachments/`; a sessão do WhatsApp só é incluída quando você autoriza explicitamente.

## Testes

```bash
npm run syntax
npm test
npm run desktop:check
```

A v0.9.6 inclui a correção automática dos conflitos de sala e mantém a suíte completa de testes automatizados e mantém as melhorias anteriores. Execute também `npm run syntax` e `npm run desktop:check` para verificar a instalação local.

## Desinstalação da integração GNOME

```bash
bash ~/.local/share/hub-whatsapp-bot/uninstall-fedora-gnome.sh
```

Os dados locais são preservados por segurança.

## Licença

Este projeto é disponibilizado sob a licença MIT. Consulte o arquivo `LICENSE`.

## Identificação completa dos setores — v0.8.14

Os cartões de contato exibem a sigla junto ao nome institucional completo, mantendo as siglas curtas nos gatilhos:

- CORES — Coordenação de Registros Escolares;
- CAENS — Coordenação de Apoio ao Ensino;
- CAPNE — Coordenação de Atendimento às Pessoas com Necessidades Educacionais Específicas;
- CSI — Coordenação do Curso de Bacharelado em Sistemas de Informação.

Cartões personalizados não são substituídos silenciosamente: a atualização oficial fica disponível para comparação no painel.
