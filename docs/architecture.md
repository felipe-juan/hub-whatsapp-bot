# Arquitetura

## Fluxo principal

1. O transporte normaliza a ativação e entrega a mensagem ao motor.
2. O motor consulta contexto, correções, entidades e regras candidatas.
3. O roteador identifica professor, disciplina, setor, semestre ou continuação.
4. Fatos acadêmicos são consultados em `professor_schedule_entries` e no catálogo permanente.
5. Um renderizador monta a resposta completa ou seletiva.
6. A fila persistente entrega a resposta e registra o diagnóstico.

## Motor de mensagens

`src/bot-engine.js` é uma fachada e um orquestrador. A lógica foi dividida em:

- `engine/academic-handler.js`: professores, disciplinas e consultas de semestre;
- `engine/card-handler.js`: cards, menus, setores e avaliação geral;
- `engine/context-handler.js`: estado, contexto persistente e ativação rápida;
- `engine/correction-handler.js`: continuações e correções explícitas;
- `engine/disambiguation-handler.js`: escolhas e candidatos ambíguos;
- `engine/learning-handler.js`: sugestões, rejeições e métricas;
- `engine/reaction-handler.js`: agradecimentos, elogios e ofensas;
- `engine/fallback-handler.js`: recuperação e respostas desconhecidas.

Os handlers são instalados no protótipo de `BotEngine`, preservando a API pública anterior.

## Painel administrativo

`src/admin-server.js` mantém autenticação, infraestrutura HTTP e despacho. As rotas ficam em:

- `admin/auth-routes.js`;
- `admin/cards-routes.js`;
- `admin/learning-routes.js`;
- `admin/academic-routes.js`;
- `admin/backup-routes.js`;
- `admin/diagnostics-routes.js`.

## Transporte WhatsApp

`src/whatsapp.js` mantém o estado compartilhado e instala módulos para:

- conexão e reconexão;
- mensagens recebidas e fragmentos;
- fila e entrega persistente;
- encerramento, reinício e logout;
- sincronização de grupos.

## Migrações

`database/migrations/legacy.js` é apenas a fachada das migrações históricas. Os métodos foram separados em:

- schema e sementes iniciais;
- origem e organização de conteúdo;
- conteúdo das versões 0.10.x;
- conteúdo das versões 0.13–0.15;
- professores, suporte e dados de exemplo.

Migrações novas continuam em `database/migrations/versions/`.

## Conteúdo de BSI

`content/bsi-course.js` agrega quatro pacotes temáticos: perfil do curso, currículo, infraestrutura/comunidade e processos acadêmicos. A ordem e os 50 cards originais são preservados.

## Fonte única de horários

`professor_schedule_entries` é a fonte de verdade para professor, disciplina, semestre, dia, horário e sala. Cards empacotados continuam fornecendo título e gatilhos, mas o conteúdo acadêmico é gerado em tempo de consulta.

## Limites arquiteturais

O teste `v0190-modularization.test.js` impede que as cinco fachadas voltem a concentrar lógica e verifica a presença dos módulos e dos contratos públicos.
