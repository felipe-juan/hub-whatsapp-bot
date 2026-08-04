# Relatório de implementação — v0.15.0

Esta versão executa o plano de quinze melhorias arquiteturais definido para o HUB WhatsApp Bot.

## 1. Fonte única do quadro

`professor_schedule_entries` passou a alimentar dinamicamente respostas completas e seletivas de professor, disciplina, semestre, sala, horário, aula atual e próxima aula. Os cards empacotados mantêm identidade e gatilhos, mas não são mais a autoridade dos fatos acadêmicos.

## 2. Dependências e instalação

O release inclui `package-lock.json`, versões diretas exatas, `DEPENDENCY_PROVENANCE.json`, verificação automática de divergência e Node limitado a `>=22.13 <23`. A dependência crítica Baileys está ligada à versão `7.0.0-rc13`, tag e commit imutável upstream.

## 3. Migrações versionadas

As migrações novas ficam em `src/database/migrations/versions/`. A tabela `schema_migrations` registra identificador, checksum, data e duração. A execução usa transação, é idempotente e rejeita alteração posterior do conteúdo de uma migração já aplicada.

## 4. Dados e apresentação

`structured-card-renderer.js` recebe dados estruturados e gera versões completas, compactas e seletivas. A apresentação não precisa mais interpretar textos antigos para descobrir professor, disciplina, sala ou período.

## 5. Política central de gatilhos

`trigger-policy.js` classifica gatilhos exatos, entidades, intenções, frases seguras, frases curtas arriscadas, bloqueios contextuais e continuações. O modo de observação registra o que teria disparado sem responder.

## 6. Corpus permanente

`test/fixtures/message-corpus.json` guarda casos positivos e negativos independentes da versão. `npm run test:corpus` mede acertos, falsos positivos, falsos negativos, precisão, recall e duração média.

## 7. Suíte dividida e acelerada

Há grupos `unit`, `integration`, `content`, `migrations` e `performance`. O grupo de conteúdo usa um SQLite-template nos casos seguros e mantém cenários de migração isolados. O executor força encerramento de processos de teste ao concluir.

## 8. Módulos menores

Foram criados módulos focados em `src/engine/` e `src/whatsapp/`, mantendo fachadas compatíveis para evitar uma reescrita arriscada de uma só vez.

## 9. Contexto persistente

Continuações curtas são gravadas em `conversation_contexts`, com entidade, participante, conversa, referência e expiração. O conteúdo integral da conversa não é armazenado para esse recurso.

## 10. Validade acadêmica

O banco registra importações acadêmicas e o painel exibe período ativo, fonte, data, quantidade de entradas e estado de desatualização configurável.

## 11. Falsos positivos

Mensagens como `não era isso`, `resposta errada` e equivalentes podem ser vinculadas à resposta anterior. O painel lista, revisa e registra a decisão sobre os relatos.

## 12. Publicação simplificada

`scripts/hub-bot` e `scripts/deploy.sh` oferecem implantação local, GitHub e Oracle com verificação do ZIP, cópia segura, preservação dos dados, teste, reinício e rollback.

## 13. Dados privados fora dos releases

`private-content.json` é ignorado pelo Git, manifesto, atualizador e empacotamento. O release contém apenas `private-content.example.json`. Atualizações preservam o arquivo privado já existente na instalação.

## 14. Documentação separada

O README principal foi reduzido ao estado atual. Instalação, arquitetura, gatilhos, horários, backups, releases e solução de problemas ficam em `docs/`. O README antigo foi preservado como documento histórico.

## 15. Node.js controlado

A faixa suportada é Node `>=22.13 <23`. O diagnóstico informa versão instalada, faixa testada e compatibilidade, sem substituir o SQLite apenas por seu aviso experimental no Node 22.

## Validação da versão

- sintaxe JavaScript integral;
- 36 testes unitários;
- 155 testes de integração;
- 115 testes de conteúdo;
- 2 testes de instalação/migração;
- 54 testes de desempenho;
- total: 362 testes automatizados, sem falhas;
- corpus inicial: 10 de 10 casos, sem falso positivo ou falso negativo;
- verificação do manifesto e ausência de conteúdo privado nos pacotes.
