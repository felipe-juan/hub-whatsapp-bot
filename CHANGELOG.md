# Histórico de versões

## 0.15.5 — 2026-08-04

- torna `quebra` e `requisito(s)` os termos centrais do card de quebra de pré-requisito;
- reconhece variações com `pré`, hífen, plural e palavras intermediárias, como `como faz a quebra de pré requisito?`;
- mantém frases diretas cadastradas e adiciona regressões específicas para as novas formas;
- exclui contextos de engenharia de software, como requisitos funcionais e levantamento de requisitos, para reduzir falsos positivos.

## 0.15.4 — 2026-08-04

- amplia os gatilhos naturais do card de quebra de pré-requisito, incluindo perguntas sem a palavra “pré”;
- bloqueia pedidos de número pessoal, telefone, celular, WhatsApp ou zap de professores;
- orienta o estudante a usar o e-mail institucional ou procurar a Coordenação de BSI;
- mantém disponíveis os telefones institucionais dos setores.

## 0.15.3 — 2026-08-04

- corrige o endereço do Google Drive mais atual da turma 2025.2;
- identifica esse Drive como acervo do 1º e 2º semestres, com o segundo ainda em desenvolvimento;
- mantém separado o Drive de veteranos, com acervo atualmente organizado do I ao VI semestre e possibilidade de conteúdo desatualizado;
- remove a observação antiga de que os dois Drives usavam o mesmo endereço;
- adiciona gatilhos específicos para o Drive atual e para o acervo de veteranos;
- adiciona migração versionada e testes para atualizar o card canônico sem sobrescrever personalizações.

## 0.15.2 — 2026-08-04

- corrige o verificador de release, que recusava a pasta `data/` mesmo quando ela estava vazia;
- mantém bloqueado qualquer conteúdo real, banco, link simbólico ou arquivo privado dentro de `data/`;
- remove a pasta vazia dos ZIPs gerados;
- seleciona explicitamente Node.js 22.13+ da família 22.x no atualizador local e na Oracle;
- adiciona suporte a `HUB_NODE_BIN` para instalações com mais de uma versão do Node;
- reutiliza dependências da instalação anterior, após validação, quando `npm ci` não puder acessar o registro;
- melhora as mensagens de erro e preserva o rollback da instalação anterior.

## 0.15.1 — 2026-08-04

- cria o card **BSI — Repositórios, Arquivos e Materiais** com Notion BSI 2.0, HUB Arquivos IFBA, Google Drives e Manual de Sobrevivência do DASI;
- adiciona gatilhos curtos exatos como `repositório`, `arquivos`, `drive`, `links do drive`, `acervo`, `materiais` e formas contextuais em perguntas;
- cria o card **BSI — Quebra de Pré-requisito** com orientação direta sobre protocolo, justificativas e votação no Colegiado;
- cria o card **Campus — Como Identificar Prédio, Andar e Sala**, explicando letra do bloco, primeiro número do andar, Bloco H e laboratórios `H40x`;
- evita falsos conflitos entre atalhos exatos e cards da Biblioteca ou do criador do HUB;
- migra o card genérico antigo de Drive sem apagar respostas personalizadas;
- adiciona testes de regressão para os três novos cards, links, gatilhos e migração.

## 0.15.0 — 2026-08-04

- transforma o quadro estruturado na fonte de verdade para respostas acadêmicas;
- adiciona renderizadores estruturados para professor, disciplina e semestre;
- cria migrações versionadas, transacionais e verificadas por checksum;
- centraliza políticas de gatilho e adiciona modo de observação;
- persiste contextos curtos no SQLite e registra possíveis falsos positivos;
- adiciona validade acadêmica, corpus permanente e grupos de testes;
- divide responsabilidades em módulos de motor e WhatsApp;
- inclui lockfile, proveniência, Node 22.x fixado e implantação simplificada;
- reorganiza a documentação e remove dados privados dos releases principais.

# Changelog

## 0.14.4 — 2026-08-03

- amplia os gatilhos dos oito cards semanais com formas numéricas, ordinais e por extenso, incluindo `semestre 1`, `1o semestre`, `segundo semestre`, `horários semestre 2` e `horários e salas do 3º semestre`;
- adiciona um fluxo guiado para `horários e salas do semestre`, solicitando apenas o número do semestre e reutilizando o contexto na resposta seguinte;
- permite que o nome isolado de qualquer docente abra o card completo, sem ativar o bot quando o mesmo nome aparece em uma conversa maior;
- corrige e amplia os gatilhos do card de Felipe Juan, com `felipe`, `juan`, nome completo e frases específicas sobre contato, projetos, HUB Arquivos e DASI;
- libera atalhos exatos e seguros para cards institucionais e acadêmicos, como `CAENS`, `final`, `calendário`, `SUAP`, `PPC`, `ACEX`, `DASI` e `protocolo`;
- reorganiza respostas seletivas em tópicos com rótulos explícitos de dia, horário, sala, professor, contato e semestre;
- destaca salas em negrito e preserva contexto acadêmico útil para leitura rápida;
- corrige a análise de conflitos para que uma frase exata curta não seja tratada como sobreposição com uma sentença maior;
- adiciona migração para bancos existentes e testes de regressão para atalhos, nomes isolados, cards completos, semestres e formatação;
- conclui 355 testes automatizados sem falhas.

## 0.14.3 — 2026-08-03

- adiciona oito cards completos de aulas e horários, um para cada semestre de BSI, com dados da planilha oficial de 28/07/2026;
- mantém contexto útil nas respostas seletivas: sala inclui disciplina, dia e horário, sem retornar contato ou outras disciplinas desnecessárias;
- reconhece `em quais dias Amanda dá aula?` como consulta objetiva e limita o bloqueio a confirmações pontuais de presença ou realização real da aula;
- permite continuações privadas como `e o horário?` sem repetir professor ou disciplina;
- faz consultas por professor e disciplina terem prioridade sobre a pergunta genérica de semestre;
- identifica e destaca a aula em andamento ou a próxima aula em pedidos como `onde Allan dá aula hoje?`;
- torna seletivas também as respostas dos setores institucionais e preserva a fonte para consulta contextual posterior;
- informa explicitamente quando sala, horário ou semestre não estão cadastrados;
- exibe a intenção classificada no diagnóstico simples e técnico;
- reduz emojis decorativos nas respostas e nos metadados de fonte;
- adiciona regressões para os oito cards, contexto conversacional, intenção, dados ausentes e prioridade temporal.

## 0.14.2 — 2026-08-03

- passa a responder consultas docentes e por disciplina somente com os campos pedidos: sala, horário, dia, professor, contato, semestre ou combinações desses dados;
- evita que perguntas como `qual sala de LPI?` enviem contato, outras disciplinas e todos os horários do professor;
- preserva o envio privado separado quando uma consulta seletiva encontra vários professores ou disciplinas;
- adiciona `repositório` e `repositorio` ao card existente de links do Google Drive por meio de migração que preserva personalizações;
- acrescenta `https://felipe-juan.github.io/hub-arquivos-ifba/` aos cards documentais relacionados em que essa referência é pertinente;
- amplia a proteção contra confirmações de presença ou realização da aula, incluindo `Crescêncio dá aula hoje?` e `Crescêncio tem aula hoje?`;
- adiciona testes de regressão para respostas seletivas, migração do repositório, referência do HUB e confirmação docente.

## 0.14.1 — 2026-08-03

- impede que confirmações sem data, como `Crescéncio vai dar aula né?`, `Crescêncio vai dar aula?` e `vai ter aula com Crescêncio?`, ativem o card docente;
- amplia a classificação de presença docente para perguntas de confirmação sem `hoje`, `amanhã` ou dia da semana;
- mantém funcionando consultas objetivas como `quais dias Crescêncio dá aula?`, `qual sala de Crescêncio?` e `Crescêncio dá aula de qual matéria?`;
- suprime também o fallback privado nessas confirmações, deixando a mensagem sem resposta;
- adiciona regressões automatizadas para a frase relatada e variantes equivalentes.

## 0.14.0 — 2026-08-03

- simplifica a pergunta de semestre para exemplos numéricos (`3`, `5` e `8`), preservando todas as formas antigas de resposta;
- adiciona `felipe` aos gatilhos do card de Felipe Juan e inclui o endereço público do HUB Arquivos IFBA;
- padroniza todos os títulos em capitalização portuguesa e renomeia a calculadora para **Calculadora de Prova Final**;
- reconhece consultas docentes por sigla ou nome completo da disciplina, incluindo sala, dia, horário/horários e múltiplas disciplinas;
- envia múltiplos resultados no privado e, quando a consulta parte de um grupo, entrega os cards no privado do participante;
- prepara e normaliza cada mensagem uma única vez, centralizando tokens, data, semestre, intenção, docentes, disciplinas, reply e menção;
- reutiliza um snapshot único dos dados do banco durante o processamento;
- consulta o quadro somente pelo dia e semestre necessários e usa um catálogo compacto para reconhecer disciplinas novas;
- centraliza a classificação de consulta, narrativa, aula normal e presença docente;
- adiciona casos permanentes de regressão no painel e os executa antes de atualizações;
- reduz os gatilhos gerados dos cards docentes, diminuindo o índice Aho-Corasick de aproximadamente 10,6 mil para 5,7 mil padrões;
- pré-compila expressões estáticas e mantém a limpeza de contextos em tarefa periódica;
- corrige colisão de siglas curtas na consulta SQL, em que `RC` também podia localizar `Comércio Eletrônico`;
- preserva o card combinado de disciplinas compartilhadas e reconhece disciplinas novas importadas sem regenerar milhares de frases.

## 0.13.3 — 2026-08-03

- impede que confirmações como `vai ter aula hoje normal`, `hoje vai ter aula normal?` e variantes abram a pergunta de semestre;
- diferencia confirmação sobre o funcionamento real das aulas de perguntas abertas sobre horário, matéria, sala ou professor;
- no privado, suprime também a ajuda automática para esse caso específico;
- preserva um pedido de semestre pendente quando a pessoa envia uma confirmação sobre aula normal no meio do fluxo;
- adiciona testes de regressão para diferentes posições de `hoje`, `amanhã`, dia da semana, singular e plural de `normal`;
- conclui nova revisão de precisão e desempenho, com 324 testes automatizados e medições do caminho de reconhecimento;
- remove versões fixas dos testes de cache do painel, evitando falhas artificiais a cada novo release.

## 0.13.2 — 2026-08-03

- garante que a resposta ao pedido de semestre seja processada antes de qualquer outro gatilho ou fallback;
- aceita `5 semestre`, `5º semestre`, `quinto semestre` e apenas `5`, tanto por reply quanto como a próxima mensagem da mesma pessoa;
- permite essa continuação também em grupos sem reply, mas somente no contexto da pessoa que iniciou a consulta;
- associa replies ao identificador exato da mensagem enviada pelo bot, evitando perda de contexto quando o WhatsApp alterna entre identificadores PN e LID;
- passa a guardar todos os aliases disponíveis do participante para manter o contexto entre mensagens do mesmo usuário;
- quando a resposta não contém um semestre reconhecível, explica os formatos aceitos em vez de cair no menu genérico;
- adiciona testes de regressão para reply, ausência de reply, troca de identificador do participante e resposta inválida.

## 0.13.1 — 2026-08-03

- evita que perguntas de confirmação como `hoje tem aula de Pablo?`, `Amanda vai dar aula hoje?` e `vai ter aula com Alexandro amanhã?` ativem o quadro de horários ou o card docente;
- trata essas mensagens como confirmação de presença, cancelamento ou realização efetiva da aula, informação que o bot não consegue verificar;
- mantém funcionando perguntas objetivas sobre o quadro, como `quais dias Pablo dá aula?`, `qual sala de Pablo?` e `quais aulas hoje no 3º semestre?`;
- no privado, impede também que esse caso específico receba a ajuda automática de mensagem não reconhecida;
- adiciona testes de regressão para grupos, conversas privadas e consultas válidas ao quadro.

## 0.13.0 — 2026-08-03

- mantém por alguns minutos o contexto das consultas de aulas em conversas privadas mesmo sem reply, preservando a exigência de reply em grupos;
- adiciona relatório automático de inconsistências para docentes, siglas, salas, choques de horário, anexos ausentes e exceções inválidas;
- consolida a fila persistente de saída no painel, com retomada após reinício, tentativas, deduplicação e estados de falha ou resultado incerto;
- adiciona a área **Sistema e manutenção**, com saúde da Oracle, memória, swap, disco, fila, logs, verificação e teste de envio;
- permite verificar e instalar novas versões do GitHub pelo painel, criando backup completo, validando o pacote, executando testes e restaurando a versão anterior em caso de falha;
- adiciona backup externo automático criptografado por AES-256-GCM, com destinos locais montados ou rclone e retenção diária, semanal e pré-atualização;
- adiciona editor estruturado do quadro docente, sincronizando cards, consultas e referências de exceções sem substituir gatilhos ou anexos;
- registra histórico de alterações de docentes, horários, calendário e configurações, com reversão pelo painel;
- amplia os gatilhos do contato da Coordenação de BSI, incluindo `contato coordenador`, `contato coordenação` e variantes;
- faz `qual sala de <professor>` abrir o card docente com as salas das aulas, em vez da sala de atendimento;
- corrige a desambiguação de nomes para não confundir nomes claramente diferentes, como Pablo e Paulo, mantendo confirmação apenas para nomes realmente iguais ou foneticamente próximos;
- adiciona integração segura com o serviço systemd da Oracle para atualização, reinício e download de logs pelo painel.

## 0.12.0 — 2026-08-03

- Adiciona comparação granular e aplicação seletiva ao importar o quadro de horários.
- Preserva e-mail, anexo, gatilhos, escopo e demais personalizações dos cards docentes.
- Permite continuações por reply nas consultas de aulas.
- Adiciona aprendizado assistido com aprovação ou rejeição no painel.
- Adiciona intervalos, recorrência semanal e importação CSV às exceções acadêmicas.
- Persiste IDs de mensagens recebidas para bloquear respostas duplicadas após reconexão ou reinício.
- Corrige reconhecimento de perguntas do tipo “será que tem aula hoje?”.
- Corrige limpeza de registros estruturados quando o nome ou e-mail de um professor é atualizado.

## 0.11.0 — 2026-08-03

- transforma o quadro docente em dados estruturados por professor, e-mail, disciplina, sigla, semestre, dia, início, fim, sala, período letivo e fonte;
- faz a consulta dinâmica de aulas usar o quadro estruturado e exibir a data explícita no título;
- adiciona um calendário de exceções editável no painel para feriados, recessos, suspensões totais ou parciais, sábados letivos, reposições e mudanças temporárias de sala;
- aplica automaticamente exceções ativas à resposta de aulas, sem alterar o quadro semanal original;
- inclui eventos oficiais já verificados e mantém pontos facultativos como aviso quando ainda dependem de confirmação do campus;
- diferencia a tolerância a digitação: moderada em nomes docentes, pequena em siglas institucionais e desativada para palavras genéricas como aula, contato e sala;
- reconhece transposição de letras adjacentes como um único erro, por exemplo Amanda/Amnada e CORES/COERS;
- adiciona APIs e gestão visual do calendário e do quadro estruturado no Admin Center;
- preserva o quadro estruturado e as exceções acadêmicas personalizadas no backup JSON v11;
- exibe disciplina, semestre, dia, horário e sala de modo estruturado também no editor do cadastro docente.

## 0.10.9 — 2026-08-03

- amplia os gatilhos dos cards docentes para perguntas sobre dias de aula, matérias e disciplinas, incluindo construções como `quais os dias de aula da prof Amanda` e `professora Amanda dá aula em quais dias e para quais matérias`;
- reconhece perguntas docentes cuja palavra interrogativa aparece depois do nome do professor, mesmo sem `?` no final;
- em conversas privadas, reage com ❤️ ou 😔 a agradecimentos, elogios e ofensas mesmo sem reply, menção por `@` ou referência textual ao bot;
- em grupos, mantém a regra segura: a reação exige reply à mensagem do bot, menção real ou identificação explícita do bot;
- migra os gatilhos dos cards docentes já existentes, preservando respostas, contatos, salas, anexos e demais personalizações.

## 0.10.8 — 2026-08-03

- Corrige o coordenador atual do Bacharelado em Sistemas de Informação para **Pablo Freire Matos**.
- Atualiza os cards “BSI — Coordenador atual” e “BSI — Contato da coordenação”.
- Inclui migração específica para corrigir bancos já existentes sem apagar anexos, gatilhos ou outras personalizações.

## 0.10.7 — 2026-08-03

- cria o card oficial **BSI — Contato da coordenação**, com coordenador, e-mail, telefone, ramal e sala;
- faz toda resposta dinâmica de aulas começar pelo título `Aula de <Dia da Semana> - <Semestre>`;
- aceita formas equivalentes como `2 semestre`, `2º semestre`, `2° semestre`, `2o semestre`, `segundo semestre` e `semestre 2`;
- permite respostas curtas de continuação como `2`, `2º`, `segundo` ou `2 semestre`;
- melhora a pergunta de semestre ausente, informando o dia consultado e mostrando exemplos de resposta;
- amplia a intenção de consulta para matéria, cadeira e componente curricular, além de aula, horário e disciplina;
- reconhece expressões como `segunda que vem` sem confundir o semestre informado;
- evita falsos positivos em comentários como `aula normal hoje né?`, `só quinta que não teremos` e `a semana toda é aula normal`;
- preserva banco, sessão do WhatsApp, anexos, configurações, conteúdo privado e personalizações durante a atualização.

## 0.10.6 — 2026-08-03

- adiciona consulta dinâmica de aulas por semestre e dia, usando a data real da mensagem e o fuso `America/Bahia`;
- reconhece `hoje`, `amanhã`, `depois de amanhã`, dias da semana e pedidos curtos formados apenas por data e semestre;
- pergunta qual semestre deve ser consultado quando o pedido informa o dia, mas omite o semestre, aceitando a resposta curta no mesmo contexto;
- limita a resposta da consulta a disciplina, sala e professor, com dados do quadro de horários 2026.2;
- corrige a sigla exibida de Atividades Curriculares de Extensão de `ACE` para `ACEX`, mantendo `ACE` como alias legado de busca;
- amplia as variações de elogios, agradecimentos, ofensas e xingamentos reconhecidas pelas reações contextuais;
- adiciona o contato telefônico privado de Felipe Juan por meio de `private-content.json`, preservado em atualizações e ignorado pelo Git;
- garante que o pacote público do GitHub não contenha o arquivo privado nem o telefone;
- preserva banco, sessão do WhatsApp, anexos, configurações e dados privados durante a atualização.

## 0.10.5 — 2026-08-03

- simplifica a resposta de `!final`, removendo a exibição da MF e deixando somente situação e nota mínima necessária;
- renomeia a mensagem para **Calculadora da prova final** e identifica a faixa da média com as bolinhas 🟢, 🔵, 🟡, 🟠 e 🔴 da tabela;
- amplia o easter egg de Felipe Juan para `juan`, consultas de contato e perguntas sobre quem criou o bot;
- reage com ❤️ a agradecimentos e elogios dirigidos ao bot e com 😔 a ofensas dirigidas ao bot;
- reconhece esse contexto quando a pessoa responde a uma mensagem do bot, menciona-o por `@` ou cita `bot`, `Escravo do Juan` e variantes;
- padroniza disciplinas nos cards docentes e compartilhados como `SIGLA - Nome completo`, por exemplo `LPI - Linguagem de Programação I`;
- preserva banco, sessão do WhatsApp, anexos, configurações e personalizações durante a atualização.

## 0.10.4 — 2026-08-03

- mantém somente a calculadora `!final` e remove os comandos antigos;
- aceita uma média parcial já calculada ou várias notas de unidades e informa a nota mínima necessária na prova final;
- aplica os limites acadêmicos do IFBA: aprovação por média a partir de 7,0, direito à final a partir de 2,5 e média final mínima 5,0;
- atualiza 28 cards docentes e a pendência de Meio Ambiente com as salas do quadro 2026.2, versão 2, de 28/07/2026;
- reorganiza as respostas docentes por contato, semestres e horários/salas, evitando emoji em cada linha;
- acrescenta gatilhos de localização por `sala`, `onde`, `laboratório`, `laboratorio` e `lab`;
- atualiza o card oficial de trancamento da graduação com limites, CORES e calendário acadêmico;
- adiciona os cards de contato de Felipe Juan e do Bar do Benjamin;
- remove a palavra `bot` como forma de menção em grupos, mantendo somente menções reais por `@`;
- preserva anexos personalizados, banco, sessão e configurações durante a atualização;
- adiciona regressões para calculadora única, novos cards, menção real e cobertura de todas as salas.

## 0.10.3 — 2026-08-02

- corrige a regressão que podia remover a imagem personalizada do card **Como passar em Cálculo?** ao atualizar da v0.10.1 para a v0.10.2;
- recupera automaticamente o anexo a partir da versão `package-update` armazenada no histórico do card;
- preserva anexos administrativos quando cards oficiais do pacote recebem novas versões;
- normaliza snapshots antigos que haviam incorporado anexos do usuário como se fossem parte oficial do pacote;
- mantém banco, sessão, anexos e configurações durante a atualização da Oracle, da instalação local e do GitHub;
- adiciona testes de regressão para recuperação automática e preservação em atualizações futuras.

## 0.10.2 — 2026-08-02

- reconhece perguntas completas sem `?` final quando há ao menos três termos e uma estrutura interrogativa ou de pedido clara;
- aceita saudações e cortesias antes de inícios como `como`, `onde`, `qual`, `quem`, `quando`, `posso`, `preciso`, `você sabe` e `gostaria de saber`;
- aplica a regra aos cards automáticos, diretório de setores, contatos docentes, horários e localização de professores;
- mantém a proteção contra frases incompletas, menções casuais e discurso relatado;
- corrige o card **Como passar em Cálculo?** para funcionar com e sem o ponto de interrogação;
- migra o gatilho oficial do card sem substituir resposta, anexo ou escopo personalizados;
- amplia a suíte para 258 testes automatizados aprovados.

## 0.10.1 — 2026-08-02

- adiciona o card de humor **Como passar em Cálculo?** com a resposta fornecida e um gatilho por padrão de pergunta que não conflita com TCC nem com consultas da disciplina;
- migra um card antigo com o mesmo título para a versão de pacote, preservando eventual anexo e evitando duplicação;
- remove completamente as etiquetas da interface, busca, importação CSV, ações em lote e novos salvamentos; valores antigos são descartados com segurança durante a atualização;
- remove do editor o campo visível **Mais detalhes**, preservando apenas continuações contextuais já usadas pelo conteúdo institucional;
- move as variáveis `{{data}}`, `{{hora}}`, `{{nome_do_grupo}}` e `{{nome_da_pessoa}}` para **Configurações avançadas**;
- transforma o nome interno no próprio título editável da janela de edição;
- faz toda mensagem privada não reconhecida receber a ajuda automática, inclusive quando o antirrepetição está ativo;
- atualiza testes, documentação, assets versionados e manifesto de atualização para a v0.10.1.

## 0.10.0 — 2026-08-01

- adiciona uma camada semântica para mensagens longas, exigindo intenção interrogativa compatível e cobertura relevante do gatilho;
- bloqueia padrões comuns de menção indireta e discurso relatado sem impedir frases diretas legítimas;
- permite exemplos negativos por card e inclui testes de regressão para falsos positivos semânticos;
- separa TCC I por intenção: docente, roteiro acadêmico, horário e pré-requisito;
- cria menu de ajuda hierárquico com categorias e submenus numéricos por conversa;
- torna o contexto de cinco minutos explícito no diagnóstico e pede confirmação quando uma continuação pode se referir a mais de um tema;
- adiciona respostas progressivas para TCC e outros fluxos acadêmicos;
- mede resposta, fonte e total da legenda no editor, alerta acima de 900 caracteres e bloqueia publicação com anexo acima de 1024;
- divide `database.js` em conexão, migrações e repositórios de cards, diretórios, entregas e backups;
- divide a base institucional em módulos de campus, setores, BSI, TCC, estágio, assistência estudantil e horários;
- divide o JavaScript do painel em módulos de cards, professores, setores, diagnóstico e atualizações;
- remove assets históricos anteriores à v0.9.9, mantendo somente a versão atual e a anterior;
- adiciona geração e validação SHA-256 do `package-lock.json`, passa a instalar com `npm ci` e reutiliza lockfile/dependências anteriores verificadas quando o registro npm estiver indisponível;
- atualiza os testes históricos para validar a arquitetura modular sem reintroduzir assets obsoletos.

## 0.9.9 — 2026-08-01

- volta a incluir automaticamente a fonte oficial e a data de verificação na mesma resposta do card ou setor;
- mantém `source_url`, `source_title` e `verified_at` como campos separados e editáveis no painel;
- evita repetir o mesmo link quando ele já aparece no corpo da resposta;
- mantém `qual a fonte?` como continuação contextual sem duplicar o bloco automático;
- corrige `Onde encontro os editais do PAAE?`, que agora abre o card de editais em vez de interpretar a pergunta como localização do Serviço Social;
- faz o cadastro estruturado de setores ceder prioridade a cards quando a pergunta procura editais, documentos, formulários, resultados, regulamentos, páginas, links, calendários, horários ou comunicados;
- preserva perguntas físicas como `Onde fica o Serviço Social?`;
- adiciona testes de regressão para fontes automáticas, deduplicação do link e roteamento do PAAE.

## 0.9.8 — 2026-08-01

- volta a enviar texto e anexo no mesmo balão do WhatsApp, usando legenda para imagens e documentos;
- envia áudio acompanhado de texto e GIF como documento com legenda, preservando o texto no mesmo envio;
- mantém um fallback explícito para enviar apenas o texto quando a mídia falha;
- consolida 108 cards institucionais e acadêmicos em `src/institutional-cards.js`;
- transforma os arquivos de cards legados em adaptadores derivados da base canônica, eliminando definições concorrentes e dados antigos;
- cria cadastro estruturado de 11 setores com nome, sigla, aliases, contatos, localização, serviços, fonte, verificação e estado;
- cria consulta dinâmica por intenção para contato, e-mail, WhatsApp, telefone, localização, serviços e fonte dos setores;
- separa resposta curta, detalhes, URL, título da fonte e data de verificação;
- adiciona continuações contextuais por conversa, com expiração curta, para comandos como `mais detalhes`, `qual a fonte?` e `e onde fica?`;
- adiciona fluxos guiados para estágio, TCC, atividades complementares, SUAP e auxílios;
- adiciona cards seguros para TCC, estágio, ACEX, aproveitamento de estudos e conhecimentos prévios, procedimentos acadêmicos, ENADE, editais, Psicologia e alimentação;
- inclui setores e novos metadados nos backups JSON, importações, histórico e verificador de links;
- invalida os caches do núcleo imediatamente após alterações de setores pelo painel;
- impede que a migração atribua falsamente verificação oficial a cards personalizados do administrador;
- atualiza os assets imutáveis do painel para `app.0.9.8.js` e `app.0.9.8.css`;
- adiciona testes de regressão para contexto, fluxos, fontes, setores, backup e envio combinado de mídia.

## 0.9.7 — 2026-08-01

- transforma o card **Onde está o professor — salas do IFBA** em uma consulta estruturada ao cadastro docente;
- exige intenção explícita de localização e nome reconhecido do professor, preservando frases diretas seguras sem `?`;
- pergunta qual professor o estudante procura quando o nome não foi informado;
- separa sala de atendimento do docente e sala da aula, encaminhando esta última ao quadro atualizado;
- adiciona exclusões para coordenação, laboratórios, miniauditório, Biblioteca, CORES, CAENS, CAPNE e COTEP;
- adiciona desambiguação por sobrenome quando mais de um docente compartilha o mesmo nome ou alias;
- nunca informa uma sala sem data e fonte de confirmação; quando o dado não existe, mostra o e-mail e encaminha à Coordenação de BSI;
- avisa quando a confirmação da sala possui mais de 180 dias;
- cria cadastro docente no painel com nome, e-mail, aliases, sala, bloco, fonte, data, disciplinas, horários e período acadêmico;
- sincroniza o cadastro estruturado ao importar o quadro docente sem apagar localização confirmada;
- inclui o cadastro docente nos backups JSON e restaura todos os campos;
- atualiza os assets imutáveis do painel para `app.0.9.7.js` e `app.0.9.7.css`;
- adiciona testes de regressão para frases diretas, perguntas longas, falsos positivos, sala da aula, desambiguação, confirmação, backup e importação docente.

## 0.9.6 — 2026-08-01

- remove os gatilhos genéricos `qual sala`, `em qual sala`, `qual é a sala` e `qual e a sala` do card de localização de professores;
- corrige automaticamente bancos já atualizados, inclusive quando o card foi personalizado ou possui atualização pendente;
- preserva resposta, anexos, demais gatilhos e alterações administrativas do card;
- elimina os sete conflitos detectados com coordenação, laboratórios e miniauditório de BSI;
- impede que instalações novas voltem a semear os gatilhos genéricos removidos.

## 0.9.5 — 2026-08-01

- incorpora 92 cards oficiais e revisados do IFBA Campus Vitória da Conquista, com foco no Bacharelado em Sistemas de Informação;
- aplica a todos os cards a proteção global: mensagens com texto adicional somente disparam quando terminam em `?`;
- mantém a exceção segura para frases diretas integrais sem `?`, como `calendário acadêmico`, `contato caens` e `contato da caens`;
- deixa de considerar `?` no meio da mensagem como indicação suficiente de pergunta;
- força a proteção em cards antigos, rascunhos, snapshots de pacote, personalizações existentes e novos cards salvos pelo painel;
- preserva aliases úteis dos cards anteriores e remove gatilhos amplos de localização de professores;
- reúne num único card as versões da matriz curricular e separa a orientação sobre migração entre PPCs, eliminando conflito entre respostas;
- atualiza os assets imutáveis do painel para `app.0.9.5.js` e `app.0.9.5.css`;
- adiciona testes de regressão para frases diretas, mensagens longas, ponto de interrogação final e todos os cards incorporados.

## 0.9.4 — 2026-08-01

- trata timeout de envio ao WhatsApp como resultado desconhecido, impedindo reenvio automático e duplicatas;
- reconcilia confirmações tardias e falhas transitórias ao registrar uma mensagem já aceita pelo WhatsApp;
- adiciona estado `uncertain`, aviso no painel e reenvio manual autenticado para entregas que exigem decisão humana;
- identifica cada reserva da fila persistente por token único, evitando perda quando a resposta do worker SQLite se perde;
- adquire o bloqueio de instância única antes de abrir o SQLite, executar migrações ou iniciar qualquer worker;
- impede que uma segunda instância remova o socket Unix pertencente ao núcleo ativo;
- encerra workers automaticamente quando o processo-pai perde o canal IPC;
- limita quadros IPC, contrapressão e respostas excessivas para evitar consumo de memória sem controle;
- corrige rollback do atualizador em falhas anteriores ao backup e dentro de funções shell;
- preserva `node_modules` durante atualizações e restaura dependências antigas sem depender novamente da internet;
- torna o instalador Fedora transacional, restaurando código, `.env`, dependências e arquivos do systemd se qualquer validação falhar;
- verifica o SHA-256 real de anexos deduplicados e repara cópias corrompidas mesmo quando o tamanho é idêntico;
- impede que links simbólicos entrem em anexos, backups e downloads do painel;
- corrige tratamento de `Host` malformado, corridas durante downloads e falhas após cabeçalhos HTTP já enviados;
- limita tamanho de senha, verificações scrypt simultâneas e quantidade de clientes rastreados no login;
- atualiza os assets imutáveis para `app.0.9.4.js` e `app.0.9.4.css`, evitando cache permanente de código antigo;
- adiciona testes de regressão para concorrência, crash recovery, rollback, IPC, anexos, login e instalador;
- 201 testes automatizados aprovados, além das verificações de sintaxe, scripts Fedora e AppIndicator.

## 0.9.3 — 2026-08-01

- torna atômica a reserva de entregas persistentes e impede envios duplicados sob concorrência;
- impede que falhas tardias rebaixem entregas já marcadas como enviadas;
- não repete mutações administrativas quando o resultado do processo escritor é desconhecido;
- corrige a recuperação profunda do watchdog para executar um reinício completo do WhatsApp;
- cria backups completos por snapshot online do SQLite, incluindo transações ainda presentes no WAL;
- serializa em lote as gravações do verificador de links pelo processo exclusivo do banco;
- endurece o atualizador contra arquivos não declarados, links simbólicos, arquivos especiais e expansão excessiva;
- limita quadros e clientes lentos no socket Unix para evitar consumo de memória sem controle;
- melhora o tratamento de cookies inválidos, corpos HTTP excessivos e falhas de IPC dos workers;
- adiciona dez testes de regressão; 181 testes automatizados aprovados no total.

## 0.9.2 — 2026-08-01

- adiciona Aho-Corasick tokenizado para localizar todas as sentenças candidatas em uma única passagem;
- atribui IDs numéricos às regras e usa bitsets para combinar candidatos com menos alocações;
- adiciona cache LRU limitado por tamanho e tempo, automaticamente invalidado a cada nova geração de regras;
- cria caminho rápido para comandos, frases exatas e gatilhos altamente específicos;
- interrompe antecipadamente a avaliação quando uma regra máxima e sem ambiguidade já venceu;
- adiciona validação de regex e RE2JS em produção para evitar retrocesso catastrófico e ReDoS;
- encaminha gravações operacionais e administrativas a um processo exclusivo do SQLite, com fallback supervisionado;
- executa `PRAGMA optimize`, `ANALYZE`, checkpoint do WAL e `incremental_vacuum` em períodos seguros;
- agrupa logs e estatísticas não críticos em lotes, com limites de memória, idade e quantidade;
- separa pools de envio de texto e mídia para impedir que arquivos grandes atrasem respostas simples;
- deduplica anexos por SHA-256 e permite que vários cartões compartilhem o mesmo arquivo físico;
- adiciona RPC e eventos locais por socket Unix entre núcleo, painel e processos auxiliares;
- configura prioridades diferentes de CPU, disco e nice no systemd e nos workers administrativos;
- mantém o envio efêmero compatível quando um adaptador leve não fornece persistência;
- 171 testes automatizados aprovados, além das verificações de sintaxe, scripts do Fedora e AppIndicator.

## 0.9.1 — 2026-08-01

- adiciona índice invertido de tokens para selecionar somente regras candidatas, preservando a validação completa;
- limita a concorrência entre conversas com contrapressão, sem atraso artificial nem descarte;
- adiciona circuit breaker com estados fechado, aberto e meia-abertura;
- usa chaves idempotentes para evitar reenvios duplicados após timeout, queda ou reinício;
- adiciona watchdog de funcionamento real com recuperação gradual em cinco níveis;
- implementa encerramento controlado de filas, socket, estatísticas e SQLite;
- limita diagnóstico, mensagens recentes, metadados de grupos, caches, tarefas e conversas inativas;
- grava estatísticas em lotes e mantém dados críticos de entrega com persistência imediata;
- prepara permanentemente as consultas SQLite mais frequentes;
- monitora e executa checkpoint automático do WAL em períodos seguros, com ação manual no painel;
- pré-renderiza respostas estáticas no snapshot de regras;
- prioriza texto antes de anexos e mantém anexos em uma faixa de prioridade menor;
- envia anexos por caminho/stream e mantém apenas metadados leves em memória;
- inicia por snapshot validado em disco quando a revisão do banco não mudou;
- adiciona paginação integral das mensagens no servidor com cursor, filtros e limite;
- substitui o carregamento progressivo por windowing verdadeiro dos cartões visíveis;
- versiona JavaScript e CSS e usa cache imutável para arquivos estáticos;
- agrupa eventos SSE em uma janela curta, reduzindo atualizações repetidas do navegador;
- mede latências p50, p95 e p99, event-loop lag, memória, WAL, filas, erros e recuperações;
- adiciona manutenção manual do WAL no painel;
- corrige o encerramento da fila para permitir que tarefas já aceitas terminem em ordem;
- 161 testes automatizados aprovados.

## 0.9.0 — 2026-08-01

- pré-compila normalização, tokens, sinônimos e expressões regulares das mensagens ativas;
- usa snapshots imutáveis e troca atômica das regras somente após compilação e validação completas;
- mantém o snapshot anterior em funcionamento quando uma nova regra contém erro;
- remove operações síncronas de arquivo do núcleo do WhatsApp, do gerenciador de anexos e do catálogo de backups;
- executa importações, backups, relatório de conflitos, verificação de links e preparação de atualizações em processo administrativo separado;
- configura SQLite com WAL, `synchronous=NORMAL`, `busy_timeout` e novos índices de mensagens, histórico, tarefas e entregas;
- adiciona persistência de envios pendentes com recuperação após reinício, timeout e novas tentativas controladas;
- limpa listeners, temporizadores, WebSocket e referências de sockets substituídos durante reinicializações e reconexões;
- adiciona Server-Sent Events para estado do WhatsApp, alterações de dados e progresso das tarefas administrativas;
- reduz o polling do painel para uma contingência de 60 segundos;
- envia apenas metadados leves de anexos na lista e resolve o arquivo somente ao editar, visualizar ou responder;
- torna gravação, leitura, limpeza e catálogo de anexos/backups assíncronos;
- separa o agendamento de backups e verificações de links da execução pesada realizada pelo processo auxiliar;
- limita a concorrência dos testes automatizados para evitar picos artificiais de recursos;
- 149 testes automatizados aprovados, além de sintaxe, scripts do Fedora, AppIndicator e teste real do processo administrativo.

## 0.8.14 — 2026-08-01

- Os cartões de contato institucionais agora exibem a sigla e o nome completo do setor.
- CORES: Coordenação de Registros Escolares.
- CAENS: Coordenação de Apoio ao Ensino.
- CAPNE: Coordenação de Atendimento às Pessoas com Necessidades Educacionais Específicas.
- CSI: Coordenação do Curso de Bacharelado em Sistemas de Informação.
- Atualizações oficiais respeitam cartões personalizados: alterações locais são preservadas e a nova versão fica disponível para comparação.

## 0.8.13 — 2026-07-31

- substitui o processamento global por filas independentes por conversa;
- preserva a ordem das mensagens dentro do mesmo grupo ou privado e mantém conversas diferentes em paralelo;
- mostra no painel quantas conversas estão ativas e quantas mensagens aguardam em suas próprias filas;
- adiciona importação em massa do quadro docente por CSV, TSV ou XLSX;
- valida e mostra uma prévia antes da importação, agrupando várias disciplinas do mesmo professor;
- atualiza cartões existentes sem remover gatilhos personalizados e guarda a versão anterior no histórico;
- cria cartões para docentes novos e disponibiliza um modelo CSV;
- identifica a origem dos cartões como pacote do HUB, importação docente ou criação no painel;
- marca cartões do pacote como padrão ou personalizados;
- impede que atualizações do pacote substituam silenciosamente conteúdo personalizado;
- permite comparar a versão local com a nova, manter a edição local ou aplicar a versão do HUB;
- preserva os metadados de origem e personalização nos backups;
- adiciona visualização em cards ou lista, com colunas dinâmicas ou escolha de uma a quatro colunas;
- combina carregamento progressivo, `IntersectionObserver` e `content-visibility` para reduzir o custo de listas longas;
- salva as preferências de visualização no navegador.
- 139 testes automatizados aprovados.


## 0.8.12 — 2026-07-31

- adiciona uma mensagem automática editável para o quadro de horários de Sistemas de Informação 2026.2;
- usa o link institucional do SharePoint fornecido;
- reconhece expressões específicas como `quadro de horários`, `horário das turmas`, `planilha de horários`, `grade de aulas` e `horário de SI`;
- evita o gatilho genérico `horário`, para não disputar com perguntas sobre horários de professores ou disciplinas;
- cria o cartão somente uma vez e não o recria após uma exclusão deliberada;
- adiciona testes de gatilho, falso positivo, ausência de conflitos e prevenção de duplicatas;
- 133 testes automatizados aprovados.

## 0.8.9 — 2026-07-31

- responde quando o bot é mencionado, mas nenhuma automação, calculadora ou comando é reconhecido;
- reconhece menções textuais por `bot`, `HUB Bot`, `hubbot` e pelo nome configurado no painel;
- reconhece também a menção real `@` ao número do bot em grupos;
- mostra exatamente três exemplos: contato de professor, contato de setor e informação institucional;
- mantém prioridade para gatilhos válidos e ignora mensagens comuns que não mencionem o bot;
- registra o fallback no diagnóstico e nos registros como ajuda por menção;
- adiciona testes de menção textual, menção `@`, prioridade de automações e ausência de falso positivo.


## 0.8.8 — 2026-07-31

- Corrige demora ao retornar ao painel após a aba ficar inativa.
- Remove o intervalo artificial entre respostas e permite envios concorrentes.
- Processa várias mensagens recebidas no mesmo evento em paralelo.
- Corrige o antirrepetição para distinguir participantes do mesmo grupo e define o padrão como zero.
- Não descarta perguntas por fila cheia ou limites preventivos.
- Faz fallback para a resposta textual quando um anexo falha; GIFs são enviados como documento.
- Reconhece conectivos opcionais em sentenças cadastradas, como “como passar em cálculo”.
- Reduz clonagens do cache ativo e reutiliza estatísticas/saúde do SQLite no painel.

## 0.8.7 — 2026-07-31

- substitui a carga completa dos cartões por resumos leves na área de mensagens;
- carrega o conteúdo integral e todos os gatilhos somente ao abrir o editor;
- renderiza os cartões progressivamente em blocos de 20;
- mostra uma estrutura de carregamento imediatamente, evitando a impressão de tela travada;
- adia a análise de conflitos até a lista estar visível;
- reescreve a análise de conflitos com termos únicos, limite de comparações e cache;
- reduz o tempo medido do primeiro relatório de conflitos de aproximadamente 25 segundos para menos de 0,1 segundo no conteúdo incluído;
- reduz em cerca de 80% o volume inicial da lista enviado ao navegador;
- amplia CAPNE, CORES e CAENS para pedidos com contato, ctt, e-mail, WhatsApp, whats, zap, telefone, número, falar e atendimento;
- reconhece a intenção antes ou depois do nome do setor e variações com artigos “da” e “do”;
- mantém a simples menção ao setor sem resposta automática;
- preserva respostas e edições existentes durante a migração dos gatilhos;
- adiciona cache do relatório de conflitos, invalidado quando as automações mudam;
- 113 testes automatizados aprovados.

## 0.8.6 — 2026-07-30

- adiciona `coordenador` e `coordenadora` aos pedidos de contato da coordenação, sempre combinados com termos como contato, e-mail ou ctt;
- remove gatilhos institucionais excessivamente amplos, incluindo `tabela`, `matriz`, `protocolo`, `calendário` e `nota final` quando aparecem isoladamente;
- substitui esses termos por expressões com intenção clara, como `tabela da final`, `matriz curricular`, `abrir um protocolo`, `calendário acadêmico` e `nota necessária na final`;
- adiciona um catálogo de siglas e abreviações de disciplinas, incluindo `MDI`, `MDII`, `ADM`, `IA`, `IHC`, `IHM`, `SO`, `BDI`, `BDII`, `PW`, `PWI`, `PWII`, `OAC`, `TCC1` e `TCC2`;
- usa siglas apenas dentro de sentenças contextuais, como `quem ensina MDI`, `email do professor de ADM` ou `horário de IA`;
- evita a sigla isolada `SI` para Segurança da Informação, pois ela conflita com Sistemas de Informação;
- preserva respostas, e-mails, anexos, etiquetas e edições manuais durante a migração dos gatilhos;
- registra as versões anteriores no histórico antes de atualizar os cartões;
- adiciona testes contra falsos positivos em conversas comuns e testes de identificação pelas siglas;
- 108 testes automatizados aprovados.

## 0.8.5 — 2026-07-30

- reduz os emojis dos cartões de professores, mantendo apenas os indicadores de e-mail, calendário e disciplinas;
- simplifica os textos de CAPNE, CORES, CAENS, protocolo, coordenação, salas, fluxograma, média final e calendário;
- adiciona gatilhos por disciplina para localizar o professor mesmo quando a pessoa não sabe o nome;
- permite perguntas de contato, identificação e dias/horários usando o nome completo da disciplina;
- dá maior pontuação a sentenças mais específicas, fazendo “Programação Web II” prevalecer sobre “Programação Web”;
- mantém desambiguação quando a mesma disciplina é ministrada por mais de um professor, como Cálculo Diferencial Aplicado à Computação;
- acrescenta ao cartão de média final os comandos `!final MP PF` e `!final help`;
- exibe os cartões de mensagens automáticas em duas colunas no desktop e uma coluna em telas menores;
- adapta a ordenação por arrastar ao layout em grade;
- preserva e-mails personalizados e guarda a versão anterior no histórico durante a migração;
- 103 testes automatizados aprovados.

## 0.8.4 — 2026-07-30

- atualiza o cartão de Luana Lima Bittencourt Silva com `luanabittencourt@ifba.edu.br`;
- remove a etiqueta `#email-pendente` de Luana e adiciona `#email`;
- preserva um endereço de Luana que já tenha sido personalizado manualmente no painel;
- faz `!final` e `!final help` exibirem uma explicação específica da regra da média final;
- mostra as faixas `MP ≥ 7`, `2,5 ≤ MP < 7` e `MP < 2,5`, as fórmulas da MF e da PF necessária e um exemplo completo;
- mantém `!final MP PF` para efetuar o cálculo normalmente;
- adiciona testes de ajuda, fórmulas, exemplo e migração do e-mail de Luana;
- 96 testes automatizados aprovados.

## 0.8.3 — 2026-07-30

- preenche 27 cartões de professores com os e-mails institucionais fornecidos;
- mantém Luana Lima Bittencourt Silva com `E-mail: não encontrado` e a etiqueta `#email-pendente`;
- remove `#email-pendente` e adiciona `#email` nos cartões que passam a ter endereço institucional;
- preserva e-mails que já tenham sido editados manualmente no painel, atualizando apenas marcadores pendentes;
- adiciona cartões automáticos de CAPNE, CORES e CAENS com seus links de WhatsApp;
- adiciona cartões de protocolo, contato da coordenação de Sistemas de Informação e consulta de salas;
- adiciona cartões do HUB para fluxograma/matriz, média final/tabela e calendário acadêmico;
- amplia o gatilho de salas com os nomes e sobrenomes incomuns dos professores cadastrados;
- cria migrações idempotentes, sem duplicar cartões e sem recriá-los após exclusão deliberada;
- adiciona testes de e-mails, preservação de edição manual, links e gatilhos dos novos cartões.
- 92 testes automatizados aprovados.

## 0.8.2 — 2026-07-30

- substitui os gatilhos genéricos separados dos cartões de professores por sentenças explícitas que sempre contêm o identificador do docente;
- usa primeiro nome quando ele é suficientemente distinto e acrescenta sobrenomes incomuns como `silvério`, `espinheira`, `barreto`, `bastos`, `meira`, `máximus`, `rodolfo` e `lélis`;
- mantém variações naturais como `contato do professor Bruno`, `e-mail do Silvério`, `que dia o Allan` e `horário do Espinheira`;
- remove o identificador oculto em `termos obrigatórios`, tornando a configuração visível e compreensível diretamente no campo de sentenças;
- migra automaticamente os 29 cartões existentes sem alterar e-mails, respostas, anexos, etiquetas, estados ou histórico;
- preserva proteções contra ambiguidades como Leonardo/Thiago Leonardo e Paulo/Luís Paulo;
- adiciona testes específicos de identificadores explícitos, sobrenomes incomuns e migração da v0.8.1;
- 88 testes automatizados aprovados.

## 0.8.1 — 2026-07-30

- adiciona 28 cartões editáveis dos professores de Sistemas de Informação para o período 2026.2;
- adiciona um 29º cartão para a pendência de identificação da disciplina Meio Ambiente;
- preenche respostas com nome, marcador de e-mail, semestres, dias, disciplinas e horários publicados em 28/07/2026;
- adiciona as etiquetas `#professor`, `#si`, `#2026-2`, `#contato`, `#horario` e `#email-pendente`;
- configura gatilhos para pedidos de contato (`contato`, `ctt`, `email`, `e-mail`) e perguntas sobre dias/horários no IFBA;
- exige em cada regra um primeiro nome ou identificador incomum do docente, ignorando maiúsculas, minúsculas e acentos;
- usa tolerância controlada de um caractere para pequenas digitações incorretas;
- impede recriação dos cartões após exclusão deliberada e evita duplicação em atualizações futuras;
- adiciona testes de criação, conteúdo, gatilhos, ambiguidades e idempotência;
- 85 testes automatizados aprovados.

## 0.8.0 — 2026-07-30

- adiciona barra permanente de saúde com conexão, recebimento, fila, mensagens ativas e última resposta;
- alerta quando o WhatsApp está conectado, mas não há mensagens recebidas dentro do período configurável;
- divide o diagnóstico em modo simples e modo técnico;
- adiciona prévia de formatação do WhatsApp e do anexo dentro do editor;
- adiciona variáveis seguras `{{data}}`, `{{hora}}`, `{{nome_do_grupo}}` e `{{nome_da_pessoa}}`;
- valida gatilhos ausentes, genéricos e conflitantes antes de salvar;
- adiciona ordenação manual por arrastar, usada como critério de desempate;
- adiciona seleção múltipla para ativar, desativar, arquivar, desarquivar, etiquetar, exportar e excluir;
- adiciona estado arquivado sem apagar mensagem nem histórico;
- adiciona proteção contra ciclos por números de outros bots e prefixos configuráveis;
- adiciona backup completo ZIP com banco, JSON, configurações, histórico e anexos, com sessão opcional;
- adiciona editor em tela cheia;
- adiciona busca avançada por etiquetas, estado, escopo e tipo de anexo;
- torna os cartões da visão geral configuráveis;
- corrige a divisão de prefixos de bots por `|`, vírgula, ponto e vírgula ou linha;
- remove o cálculo O(n²) de conflitos do monitoramento periódico;
- move a compactação de backups completos para uma operação assíncrona, evitando bloquear o bot;
- reduz reconstruções completas do dashboard durante a atualização de saúde;
- 82 testes automatizados aprovados.

## 0.7.0 — 2026-07-30

- remove a organização por pastas e mantém somente etiquetas exibidas com `#`;
- converte pastas e tópicos antigos em etiquetas durante a migração;
- substitui a escolha exclusiva “todos/qualquer” por dois campos simultâneos: sentenças/trechos e palavras-chave obrigatórias;
- permite usar apenas sentenças, apenas palavras-chave ou os dois canais na mesma automação;
- garante que o nome interno nunca seja considerado gatilho;
- remove o simulador da tela de mensagens;
- integra upload, substituição e remoção de anexos ao próprio editor;
- atualiza o modelo CSV para sentenças, palavras-chave e etiquetas;
- adiciona limites conservadores globais, por hora, por pessoa e por fila;
- amplia o intervalo mínimo padrão entre envios e reduz os limites padrão de rajada;
- ignora broadcasts, status e newsletters;
- deixa mensagens recuperadas após reconexão desativadas por padrão;
- adiciona espera exponencial de reconexão e pausas longas após códigos 429/403;
- corrige os modelos iniciais para usarem sentenças alternativas;
- mantém compatibilidade com importações e backups antigos;
- 76 testes automatizados aprovados.

## 0.6.0 — 2026-07-30

- adiciona diagnóstico em tempo real com uma decisão final por mensagem, regras analisadas e motivos de resposta ou bloqueio;
- mantém o diagnóstico somente na memória, limitado a 500 eventos, com transmissão ao painel por SSE;
- adiciona escopo individual por mensagem: grupos e privado, somente grupos ou somente privado;
- adiciona anexos privados de até 25 MiB para imagens, áudios, PDFs e documentos comuns;
- envia anexos pelo Baileys com legenda, nome e tipo MIME apropriados;
- adiciona duplicação rápida, criando cópias inativas e completamente editáveis;
- adiciona organização por pastas e etiquetas, incluindo busca e importação CSV;
- adiciona histórico das 50 versões anteriores por mensagem e restauração direta no painel;
- inclui o histórico de alterações nos backups JSON;
- corrige MIME genérico de navegadores usando a extensão segura do arquivo;
- separa e limita o rastreador de mensagens recentes para evitar respostas duplicadas e crescimento de memória;
- aceita eventos recentes `append` sem reprocessar histórico antigo;
- informa no diagnóstico quando o arquivo de um anexo está ausente e envia somente o texto;
- corrige a versão de contingência exibida pelo painel;
- adiciona aviso de migração da pasta privada de anexos;
- 70 testes automatizados aprovados.

## 0.5.1 — 2026-07-30

- permite respostas automáticas, ajuda e calculadoras também em conversas privadas;
- mantém permissões e seleção de atendimento somente para grupos;
- torna **todos os gatilhos** o padrão das novas mensagens automáticas;
- move a escolha “todos/qualquer” para a área principal do editor;
- permite usar símbolos literais, inclusive `?`, como gatilhos;
- combina palavras em qualquer ordem, ignorando capitalização e acentos;
- impede que o nome interno da automação ative uma resposta;
- adiciona simulação explícita de conversa privada ou grupo;
- atualiza a importação CSV com a coluna `match_mode`;
- adiciona testes para mensagens privadas, símbolos e combinação de palavras.

## 0.5.0 — 2026-07-30

- substitui as áreas separadas de professores, links e FAQs por uma única área de **Mensagens automáticas**;
- cada mensagem passa a ter gatilhos e um texto completo enviado exatamente como foi escrito;
- remove a montagem automática de respostas, títulos, e-mails, links e rodapés para conteúdos comuns;
- aplica novas mensagens e edições imediatamente ao salvar;
- mantém condições avançadas em uma seção opcional dentro do mesmo editor;
- integra o gerenciamento de sinônimos à própria tela de mensagens;
- converte automaticamente professores, links e FAQs de versões anteriores para o modelo unificado;
- adiciona modelos simples que respondem a `professora exemplo`, `prof exemplo`, `link de teste` e `como testar o bot`;
- simplifica as permissões por grupo para ajuda, mensagens e calculadoras;
- preserva calculadoras como recurso separado por produzirem resultados dinâmicos.

## 0.4.5 — 2026-07-30

- Corrige **Remover sessão**: a ação agora encerra o socket, apaga e recria a autenticação, reinicia a conexão e gera automaticamente um novo QR code.
- Elimina o estado permanente `stopped` após a remoção da sessão.
- Mostra progresso durante a limpeza e impede cliques duplicados no botão.
- Adiciona teste de regressão para garantir que a remoção sempre reinicie o cliente.

## 0.4.4 — 2026-07-30

- corrigido pareamento Baileys que podia permanecer indefinidamente em `connecting` após o QR code;
- adicionada reinicialização única após as credenciais passarem a `registered`, conforme o fluxo multidispositivo;
- adicionada consulta da versão atual do WhatsApp Web com tempo limite e versão de contingência;
- adotado `makeCacheableSignalKeyStore`, conforme o exemplo oficial atual do Baileys;
- removida identificação manual de navegador para usar a configuração padrão da biblioteca;
- adicionado watchdog de conexão com recuperação automática e sem apagar a sessão;
- ampliada a leitura de códigos de desconexão, inclusive erros aninhados como `515`;
- adicionados diagnósticos no painel e no journal sem registrar QR, mensagens ou chaves;
- adicionados testes de regressão para configuração e recuperação pós-pareamento.

## 0.4.3 — 2026-07-30

- substituída integralmente a conexão `whatsapp-web.js`/Chromium por Baileys 7 via WebSocket;
- removida a dependência do evento `ready` que permanecia travado após o QR code em algumas contas;
- conexão passa a considerar o evento oficial `connection.update` com estado `open` como prontidão real;
- removidas dependências de Chromium, Puppeteer, perfil de navegador e watchdogs específicos da interface web;
- criada adaptação entre mensagens Baileys e o motor existente, preservando respostas citadas, comandos, desambiguação, grupos e logs;
- preservados banco SQLite, painel, senha, professores, links, FAQs, calculadoras, permissões e backups;
- sessão antiga `.wwebjs_auth` mantida apenas como legado; uma nova leitura do QR code é necessária porque formatos de autenticação não são compatíveis;
- autenticação nova gravada em `data/.baileys_auth` com atualizações de credenciais persistidas automaticamente;
- sincronização automática de grupos usa `groupFetchAllParticipating` e eventos de atualização de grupos;
- instalador deixa de instalar Chromium e reduz limites do serviço para 384 MiB/512 MiB;
- painel informa explicitamente o transporte WebSocket e a necessidade de nova vinculação durante a migração;
- adicionados testes para extração de mensagens, respostas citadas, participantes, encerramentos e ausência de Chromium;
- 50 testes automatizados aprovados.

## 0.4.2 — 2026-07-30

- corrigida a tela de autenticação: o painel permanece realmente oculto até a senha correta, inclusive ao rolar a página;
- adicionadas mensagens visíveis de senha correta, senha incorreta e sessão encerrada;
- adicionadas rotas locais separadas `/login` e `/painel`, mantendo todas as APIs protegidas por sessão;
- corrigido o travamento após leitura do QR code com perfil Chromium mais compatível, watchdog de prontidão, recuperação do evento perdido e reinício limitado sem apagar a sessão;
- removidas do perfil econômico flags que bloqueavam rede, sincronização e atualização de componentes do Chromium;
- grupos passam a ser sincronizados automaticamente ao conectar, com tentativas adicionais, atualização após mudanças de grupo e sincronização periódica;
- painel mostra progresso, tentativas de recuperação, quantidade de grupos sincronizados e horário da última sincronização;
- banco recebe professor, link, FAQ, sinônimos, registro e estatísticas de demonstração marcados como `🧪 Exemplo`;
- todos os exemplos podem ser apagados de uma vez pelo dashboard, sem afetar dados reais, e não reaparecem depois;
- ícones do painel e botões foram padronizados como emojis;
- perfil padrão alterado de `low` para `balanced`, com migração automática da configuração anterior;
- 46 testes automatizados aprovados, incluindo regressões de login, exemplos, rotas, recuperação do WhatsApp e sincronização automática de grupos.

## 0.4.1 — 2026-07-30

- corrigido loop infinito no instalador: o script npm reservado `install` executava `INSTALL.sh` automaticamente durante `npm install`;
- removido o ciclo de vida npm conflitante e substituído pelo comando explícito `npm run setup:fedora`;
- instalações e atualizações agora usam `npm install --ignore-scripts` como proteção adicional contra recursão e scripts de dependências;
- o instalador recupera normalmente uma tentativa interrompida da versão 0.4.0 e preserva banco, configuração e sessão;
- incluído teste de regressão para impedir que scripts npm reservados (`install`, `preinstall`, `postinstall`) voltem ao pacote.

## 0.4.0 — 2026-07-30

- regras avançadas por link e FAQ: qualquer/todas as palavras, obrigatórias, excluídas, frases exatas, ponto de interrogação, regex validada, sinônimos e exemplos negativos;
- tolerância controlada a erros de digitação de até dois caracteres, aplicada somente a termos com comprimento seguro;
- grupos reutilizáveis de sinônimos administrados pelo painel;
- desambiguação interativa com opções numeradas e escolha temporária por participante;
- comandos administrativos pelo WhatsApp com lista de números autorizados;
- verificação automática e manual de links, com código HTTP, estado e erro;
- retenção configurável dos registros;
- senha administrativa com hash scrypt, troca no painel, expiração de sessões e bloqueio temporário após tentativas inválidas;
- estatísticas anônimas agregadas somente por dia, tópico e tipo;
- atualização por ZIP iniciada no painel, com validação de versão/checksums, testes e restauração automática em falha;
- FAQs configuráveis com rascunho, simulação e publicação;
- calculadoras configuráveis de média, final, frequência, horas complementares e média ponderada;
- prioridade corrigida para permitir que FAQs explicativas sobre prova final não sejam interceptadas pela calculadora;
- backup no formato v3, incluindo FAQs, sinônimos, calculadoras, regras avançadas e permissões;
- 40 testes automatizados cobrindo versões anteriores, integridade de atualização e os novos recursos.

## 0.3.0 — 2026-07-29

- simulador de gatilhos no painel, sem envio ao WhatsApp, sem log e sem cooldown;
- simulador pode incluir rascunhos pendentes antes da publicação;
- detecção automática de palavras-chave sobrepostas e apelidos de professores duplicados;
- permissões individuais por grupo para ajuda, professores, links e calculadora;
- importação em massa de professores e links por CSV, com arquivos modelo e relatório de erros;
- respostas citam a mensagem original por padrão, com opção de desativar nas configurações;
- dashboard de saúde ampliado com uptime, memória do Node.js, integridade/tamanho do SQLite, últimas mensagens e respostas, reconexões e situação dos backups;
- backups JSON automáticos e rotativos, com intervalo e retenção configuráveis, criação manual, download e exclusão pelo painel;
- fluxo real de rascunho/publicação: edições não alteram a versão em produção até a publicação explícita;
- migração automática do banco das versões 0.1/0.2 para o novo esquema, preservando dados existentes;
- backup atualizado para o formato v2, incluindo rascunhos e permissões detalhadas dos grupos;
- 25 testes automatizados cobrindo recursos anteriores, migração e funcionalidades da versão 0.3.0.

## 0.2.3 — 2026-07-29

- painel administrativo convertido integralmente para modo escuro;
- nova paleta de alto contraste para fundo, cartões, tabelas, formulários, botões, diálogos, avisos e tela de login;
- controles nativos do navegador passam a respeitar `color-scheme: dark`;
- estados de foco visíveis e melhorias de acessibilidade visual;
- área do QR code mantida branca para garantir leitura confiável pelo WhatsApp;
- novo teste automatizado impede regressão acidental para o tema claro.

## 0.2.1 — 2026-07-29

- novo perfil padrão de baixo consumo para Chromium, desativando extensões, sincronização, tradução, notificações, telemetria, atualização de componentes e outros recursos que o bot não usa;
- cache de disco e mídia do Chromium limitado para conter crescimento desnecessário;
- QR code deixa de ser impresso repetidamente no journal por padrão e continua disponível no painel;
- indicador passa de consultas a cada 3 segundos para uma consulta consolidada a cada 10 segundos;
- indicador mostra a memória total do serviço, incluindo Node.js e processos do Chromium;
- painel reduz a atualização de estado de 5 para 15 segundos e interrompe consultas quando a aba está oculta;
- configurações, professores e links ativos passam a usar cache com invalidação automática;
- atualização de presença de grupos no SQLite é limitada a uma gravação por grupo a cada 10 minutos;
- limpeza da tabela de logs deixa de executar em toda resposta e passa a ocorrer em lotes;
- SQLite configurado com `synchronous=NORMAL`, cache limitado e armazenamento temporário em memória;
- serviço systemd recebe prioridade reduzida, pesos baixos de CPU/I/O e limites de proteção contra consumo anormal;
- novo comando `npm run resources` para medir memória, CPU acumulada e processos do serviço;
- 14 testes automatizados aprovados, incluindo cache e redução de gravações no SQLite.

## 0.2.0 — 2026-07-29

- execução em segundo plano por serviço `systemd --user` no Fedora;
- inicialização automática na sessão do usuário;
- reinício automático do processo em caso de falha;
- novo indicador para GNOME/AppIndicator com estados conectado, aguardando e erro;
- menu para abrir painel, iniciar, parar, reiniciar e acompanhar registros;
- opção para ativar/desativar a inicialização automática pelo próprio indicador;
- lançador no menu de aplicativos e inicialização automática do ícone;
- instalador e desinstalador específicos para Fedora GNOME;
- migração automática de uma instância antiga do PM2 com o mesmo nome;
- saída do indicador não encerra o serviço do bot;
- documentação atualizada para o fluxo com systemd.

## 0.1.1 — 2026-07-28

- consulta de contato de professor agora exige um ponto de interrogação literal (`?`);
- palavras de cargo, como `professor` e `docente`, deixaram de ativar a consulta sozinhas;
- a mensagem também precisa conter intenção explícita de contato e um nome/apelido cadastrado;
- o painel de professores informa visualmente a nova regra de disparo;
- novos testes cobrem mensagens sem `?` e perguntas comuns sobre professores.

## 0.1.0 — 2026-07-27

- primeira versão autohospedada completa;
- painel local para professores, links, grupos, configurações, backup e logs;
- SQLite local;
- conexão por WhatsApp Web com QR code;
- cálculo dinâmico de média e prova final;
- suporte a PM2.

## 0.2.2

- Instalação simplificada para um único comando: `bash INSTALL.sh`.
- Programa instalado em `~/.local/share/hub-whatsapp-bot`.
- Preservação automática de banco, configuração e sessão em atualizações.
- Migração automática da pasta usada pelo serviço anterior.
- Abertura automática do painel e exibição da senha ao concluir.
- Atalho do menu de aplicativos passa a abrir diretamente o painel.
- A pasta extraída deixa de ser necessária após a instalação.
