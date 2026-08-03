# HUB WhatsApp Bot

## Novidades da v0.10.7

- adiciona o card oficial de contato da Coordenação de BSI;
- inicia toda consulta dinâmica com um título que confirma dia da semana e semestre;
- aceita formas equivalentes como `2 semestre`, `2º semestre`, `2° semestre`, `2o semestre`, `segundo semestre` e `semestre 2`;
- melhora a pergunta quando o semestre está ausente, com o dia consultado e exemplos de resposta;
- aceita respostas curtas de continuação como `2`, `2º` e `segundo`;
- amplia consultas para aula, matéria, disciplina, cadeira, componente e horário.
- evita falsos positivos em comentários como `aula normal hoje né?` e avisos de dias sem aula.

## Novidades da v0.10.6

- consulta aulas de BSI por dia e semestre, reconhecendo `hoje`, `amanhã`, `depois de amanhã` e dias da semana;
- aceita também pedidos curtos formados por data e semestre, como `amanhã terceiro semestre`;
- quando o dia é informado sem o semestre, pergunta qual semestre deve ser consultado e mantém o contexto para a resposta seguinte;
- retorna somente disciplina, sala e professor, com base no quadro 2026.2 incorporado;
- usa o horário real da mensagem e o fuso `America/Bahia` para interpretar datas relativas;
- corrige a sigla exibida para **ACEX**, mantendo `ACE` como alias legado;
- amplia as variantes de elogios, agradecimentos, ofensas e xingamentos das reações contextuais;
- permite dados comunitários privados por `private-content.json`, arquivo ignorado pelo Git e ausente deste repositório público.

## Novidades da v0.10.5

- `!final` agora mostra somente a situação e a nota mínima necessária, sem exibir a MF;
- a faixa da média aparece com 🟢, 🔵, 🟡, 🟠 ou 🔴, seguindo a tabela da prova final;
- agradecimentos e elogios dirigidos ao bot recebem ❤️; ofensas dirigidas ao bot recebem 😔;
- a reação ocorre ao responder uma mensagem do bot, mencioná-lo por `@` ou citar `bot`, `Escravo do Juan` e variantes;
- o card de Felipe Juan aceita `juan`, consultas de contato e perguntas sobre quem criou o bot;
- os cards docentes e cards de disciplinas compartilhadas exibem `SIGLA - Nome completo`;
- preserva banco, sessão, anexos, configurações e personalizações durante a atualização.

## Novidades da v0.10.4

- mantém somente o comando `!final`; os comandos antigos de média, frequência, horas e média ponderada foram removidos;
- com um valor, `!final` considera esse número como a média das unidades e informa a nota mínima necessária na prova final;
- com vários valores, calcula a média das unidades antes de informar a situação e a nota necessária;
- atualiza os cards docentes com as salas do quadro 2026.2, versão 2, de 28/07/2026, e melhora a leitura por contato, semestres e horários/salas;
- reconhece consultas docentes por `sala`, `onde`, `laboratório`, `laboratorio` e `lab`;
- acrescenta o card oficial de trancamento da graduação, o contato de Felipe Juan e o Bar do Benjamin;
- a palavra “bot” isolada não ativa mais a ajuda em grupos; a ajuda por menção exige uma menção `@` real do WhatsApp;
- preserva banco, sessão, anexos, configurações e personalizações durante a atualização.


## Preservação e recuperação de anexos — v0.10.3

A v0.10.3 corrige uma regressão específica da atualização anterior: anexos personalizados do card **Como passar em Cálculo?** não podem mais ser confundidos com conteúdo oficial do pacote. Quando a v0.10.2 removeu esse anexo durante a atualização, a v0.10.3 recupera automaticamente os metadados a partir do histórico do próprio card, mantendo o arquivo armazenado em `data/attachments`. Atualizações futuras de cards do pacote também preservam anexos adicionados pelo administrador.


> [!IMPORTANT]
> ### Todo o código deste repositório foi criado por IA generativa, em especial ChatGPT/OpenAI, a partir de instruções, ideias, testes e revisões humanas.
>
> O mantenedor humano atuou principalmente como **idealizador, testador, revisor, curador de conteúdo e validador visual/funcional** do projeto.

> [!WARNING]
> Este é um projeto **independente e não oficial**. Ele não representa o IFBA, o Campus Vitória da Conquista, o WhatsApp, a Meta ou a OpenAI.
>
> A integração com o WhatsApp usa o Baileys, uma biblioteca não oficial. O uso pode estar sujeito a limitações, mudanças de compatibilidade ou restrições da plataforma. Recomenda-se usar um número separado e evitar automações abusivas, mensagens em massa ou conteúdo não solicitado.

## Visão geral

O HUB WhatsApp Bot é uma aplicação autohospedada para responder perguntas recorrentes em grupos e conversas privadas do WhatsApp. O projeto foi desenvolvido inicialmente para apoiar estudantes do Bacharelado em Sistemas de Informação do IFBA — Campus Vitória da Conquista, mas sua estrutura pode ser adaptada para outras instituições, cursos e comunidades.

O bot utiliza regras, cards, diretórios estruturados e fluxos guiados. **Ele não usa inteligência artificial generativa durante a execução e não envia conversas para serviços de IA por padrão.**

Principais objetivos:

- centralizar informações institucionais verificadas;
- responder perguntas frequentes com mensagens previsíveis;
- reduzir falsos positivos por meio de gatilhos controlados;
- permitir administração local pelo navegador;
- manter dados, sessão e histórico sob controle do operador;
- oferecer diagnóstico, backup, atualização e recuperação.

## Estado do projeto

Versão atual: **0.10.7**

O projeto ainda está em preparação para a versão 1.0. Apesar da suíte automatizada e dos testes realizados pelo mantenedor, ele deve ser considerado experimental.

Antes de usar em produção:

1. revise os cards e contatos incorporados;
2. confirme as fontes e datas de verificação;
3. teste os gatilhos em um grupo controlado;
4. use uma conta separada do WhatsApp;
5. configure backup e retenção de logs;
6. mantenha o painel restrito a `localhost`, salvo necessidade específica.

## Novidades da v0.10.3

- recupera automaticamente a imagem personalizada do card **Como passar em Cálculo?** quando ela foi removida pela migração da v0.10.2;
- preserva anexos administrativos em atualizações futuras de cards oficiais do pacote;
- normaliza snapshots antigos que haviam incorporado anexos do usuário como se fossem conteúdo oficial;
- mantém o reconhecimento de perguntas completas sem `?` final introduzido na v0.10.2;
- mantém banco, sessão, anexos, configurações e histórico durante a atualização.

## Recursos principais

### Respostas automáticas

- cards editáveis com frases, palavras-chave, exclusões e prioridade;
- frases diretas curtas que podem funcionar sem `?`;
- perguntas completas que podem funcionar sem `?` quando a estrutura interrogativa é clara;
- exigência do `?` ou de uma frase direta completa quando não há estrutura interrogativa reconhecível;
- proteção contra menções indiretas e discurso relatado;
- desambiguação quando mais de uma resposta é possível;
- respostas progressivas com `mais detalhes`;
- fonte oficial e data de verificação na própria resposta;
- anexos enviados com o texto no mesmo balão quando tecnicamente possível.

### Conteúdo estruturado

- cadastro de professores;
- cadastro de setores;
- disciplinas, horários, semestres e contatos;
- localização docente somente quando houver fonte e data de confirmação;
- fluxos guiados para TCC, estágio, ACEX, atividades complementares, SUAP e auxílios;
- cards institucionais voltados ao IFBA Vitória da Conquista e ao curso de Sistemas de Informação.

### Administração

- painel web local;
- criação, edição, ativação, arquivamento e exclusão de cards;
- prévia semelhante ao WhatsApp;
- diagnóstico em tempo real;
- relatório de conflitos de gatilhos;
- importação de quadro docente por CSV, TSV ou XLSX;
- cadastro estruturado de setores e professores;
- histórico de alterações;
- pesquisa, filtros e ações em massa;
- estatísticas e métricas de desempenho.

### Confiabilidade

- SQLite em modo WAL;
- fila persistente de envios;
- ordenação por conversa e paralelismo entre conversas distintas;
- proteção contra envio duplicado;
- estado de entrega incerta para timeouts não confirmados;
- watchdog e recuperação de conexão;
- backup consistente do banco;
- rollback do instalador e do atualizador;
- deduplicação e verificação SHA-256 de anexos;
- processo dedicado para gravações no banco;
- workers administrativos separados do núcleo do WhatsApp.

## Como os gatilhos funcionam

A política global procura reduzir ativações acidentais.

### Frase direta

Uma frase curta cadastrada pode funcionar sem ponto de interrogação:

```text
calendário acadêmico
contato caens
contato da caens
```

### Pergunta completa sem `?`

Desde a v0.10.2, uma mensagem com ao menos três termos pode ser reconhecida como pergunta mesmo sem o sinal final, quando começa com uma estrutura interrogativa ou de pedido clara:

```text
Como passar em Cálculo
Você sabe qual é o contato da CAENS
Onde fica a sala do professor Allan
Por favor, como solicito aproveitamento
```

O `?` continua útil e é necessário quando a mensagem não apresenta uma estrutura interrogativa reconhecível. Estas mensagens não devem responder:

```text
Alguma coisa calendário acadêmico
A gente falou do contato da CAENS
Ontem comentaram sobre como passar em Cálculo
Onde fica
```

Saudações e expressões de cortesia no começo são ignoradas para a análise. O motor continua bloqueando frases incompletas, menções casuais e relatos sobre algo que outra pessoa comentou ou publicou.

## Requisitos

Instalação principal testada em:

- Fedora Linux com GNOME;
- Node.js 22.13 ou superior;
- npm;
- systemd no modo de usuário;
- Chromium ou navegador compatível;
- conexão com a internet para a instalação inicial e vinculação do WhatsApp.

O instalador Fedora adiciona os pacotes de sistema necessários, configura o serviço e cria o indicador da área de trabalho.

## Instalação no Fedora GNOME

Extraia o projeto, entre na pasta e execute:

```bash
bash INSTALL.sh
```

O instalador:

- instala as dependências necessárias;
- copia a aplicação para `~/.local/share/hub-whatsapp-bot`;
- cria o arquivo de configuração local;
- configura o serviço `hub-whatsapp-bot.service`;
- inicia o bot em segundo plano;
- abre o painel local no navegador.

Por padrão, o painel usa:

```text
http://127.0.0.1:3210
```

Guarde a senha gerada pelo instalador.

## Vinculação do WhatsApp

No painel, abra a área de conexão e leia o QR code pelo aplicativo:

```text
WhatsApp → Configurações → Dispositivos conectados → Conectar um dispositivo
```

Use preferencialmente um número dedicado ao bot.

## Comandos do serviço

Ver o estado:

```bash
systemctl --user status hub-whatsapp-bot.service
```

Reiniciar:

```bash
systemctl --user restart hub-whatsapp-bot.service
```

Parar:

```bash
systemctl --user stop hub-whatsapp-bot.service
```

Iniciar:

```bash
systemctl --user start hub-whatsapp-bot.service
```

Acompanhar logs:

```bash
journalctl --user -u hub-whatsapp-bot.service -f
```

## Atualização

Baixe ou extraia a nova versão e execute novamente:

```bash
bash INSTALL.sh
```

O instalador foi projetado para preservar:

- `.env`;
- banco SQLite;
- sessão do WhatsApp;
- anexos;
- cards personalizados;
- dependências anteriores para rollback, quando disponíveis.

Ainda assim, faça um backup antes de atualizar.

## Desinstalação

Na pasta do projeto:

```bash
bash uninstall-fedora-gnome.sh
```

Revise as opções apresentadas antes de remover dados e sessão.

## Execução para desenvolvimento

Copie a configuração de exemplo:

```bash
cp .env.example .env
```

Edite a senha e as opções locais:

```bash
nano .env
```

Instale as dependências:

```bash
npm install
```

Execute as verificações iniciais:

```bash
npm run setup
npm run check
```

Inicie em modo normal:

```bash
npm start
```

Ou em modo de desenvolvimento:

```bash
npm run dev
```

## Testes

Executar a suíte automatizada:

```bash
npm test
```

Verificar sintaxe JavaScript:

```bash
npm run syntax
```

Verificar scripts e indicador do desktop:

```bash
npm run desktop:check
```

A versão 0.10.3 foi empacotada após 260 testes automatizados aprovados, executados pela suíte combinada do Node.js. Esse número não substitui revisão independente nem teste em uma conta real diferente.

## Variáveis de ambiente

Exemplo disponível em `.env.example`:

```dotenv
ADMIN_PASSWORD="troque-esta-senha"
ADMIN_HOST="127.0.0.1"
ADMIN_PORT="3210"
SESSION_HOURS="12"
GROUP_TOUCH_INTERVAL_SECONDS="600"
TRAY_POLL_SECONDS="10"
DATA_DIR="./data"
```

Nunca publique o arquivo `.env`.

## Dados locais e privacidade

Por padrão, os dados ficam na própria máquina do operador. Dependendo da configuração e do uso, podem ser armazenados:

- sessão de autenticação do WhatsApp;
- números e identificadores de conversas;
- mensagens necessárias para diagnóstico;
- cards e histórico de alterações;
- banco SQLite;
- anexos;
- backups;
- estatísticas.

O operador é responsável por definir retenção, acesso, backup, finalidade e proteção desses dados, observando a legislação aplicável.

Não publique no GitHub:

- `.env`;
- banco SQLite;
- sessão do WhatsApp;
- diretório `data`;
- backups;
- anexos privados;
- exportações contendo números, mensagens ou contatos não públicos.

O `.gitignore` já bloqueia os caminhos locais mais comuns, mas o responsável deve revisar cada commit.

## Estrutura do projeto

```text
hub-whatsapp-bot/
├── desktop/                 # indicador e ícones do desktop
├── public/                  # painel web
│   └── js/                  # módulos da interface
├── scripts/                 # setup, verificação e manifesto
├── src/
│   ├── content/             # conteúdo institucional por domínio
│   ├── database/            # conexão, migrações e repositórios
│   ├── bot-engine.js        # coordenação do processamento
│   ├── matcher.js           # correspondência e pontuação
│   ├── semantic-question.js # proteção semântica
│   ├── guided-flows.js      # fluxos guiados
│   ├── whatsapp.js          # integração do núcleo
│   └── ...
├── test/                    # testes automatizados
├── .env.example
├── .gitignore
├── INSTALL.sh
├── LICENSE
├── package.json
└── README.md
```

## Conteúdo institucional incorporado

A distribuição inclui cards e cadastros voltados ao IFBA — Campus Vitória da Conquista, com foco no Bacharelado em Sistemas de Informação.

Esses dados podem ficar desatualizados. Antes de usar:

- confira as fontes oficiais;
- revise contatos, nomes, horários e regulamentos;
- observe a data de verificação;
- desative o que não se aplica ao seu contexto;
- não apresente o bot como canal oficial da instituição.

Cards personalizados e dados locais não fazem parte do código público, salvo quando alguém os exporta ou os grava manualmente no repositório.

## Segurança

Recomendações mínimas:

- mantenha `ADMIN_HOST=127.0.0.1`;
- use senha exclusiva e forte;
- não exponha o painel diretamente à internet;
- proteja backups e sessão do WhatsApp;
- revise dependências e atualizações;
- teste novas regras antes de ativá-las;
- não use o bot para spam;
- não envie dados pessoais desnecessários;
- use um número separado da conta pessoal.

Falhas de segurança não devem ser publicadas com credenciais, sessões, números ou dados reais. Abra uma issue com informações mínimas ou procure o mantenedor por um canal privado quando houver risco de exposição.

## Limitações conhecidas

- integração não oficial com o WhatsApp;
- testes realizados principalmente em Fedora GNOME;
- conteúdo institucional sujeito a mudanças;
- respostas dependem da qualidade dos gatilhos cadastrados;
- nenhuma garantia contra bloqueio ou alteração da plataforma;
- ainda não houve auditoria independente;
- o projeto não substitui orientação oficial de setores, coordenações ou regulamentos.

## Contribuições

Contribuições são bem-vindas, especialmente em:

- revisão de segurança;
- testes em outros ambientes;
- redução de falsos positivos;
- acessibilidade do painel;
- documentação;
- modularização;
- testes de integração;
- migração futura para provedores oficiais.

Ao contribuir, descreva claramente:

- o problema resolvido;
- os testes executados;
- possíveis impactos em dados e compatibilidade;
- uso de IA na contribuição, quando aplicável.

Não envie dados reais de estudantes, professores, grupos ou sessões.

## Licença

Distribuído sob a licença MIT. Consulte [`LICENSE`](LICENSE).

A licença permite uso, cópia, modificação e redistribuição, sem garantia de funcionamento ou adequação a uma finalidade específica.

## Créditos e responsabilidade

- Concepção, especificação, testes, curadoria e manutenção: **Allan de Sousa Soares**.
- Geração do código-fonte: **inteligência artificial generativa, principalmente ChatGPT/OpenAI**.
- Integração com WhatsApp: projeto comunitário Baileys.

A menção a OpenAI, ChatGPT, WhatsApp, Meta ou IFBA não representa parceria, aprovação ou endosso por essas organizações.
