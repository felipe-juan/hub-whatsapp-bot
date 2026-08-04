# Arquitetura

## Fluxo principal

1. O texto recebido é normalizado e classificado.
2. A política de gatilhos decide se a regra é exata, contextual, observável ou bloqueada.
3. O roteador identifica professor, disciplina, setor, semestre ou continuação.
4. Fatos acadêmicos são consultados em `professor_schedule_entries`.
5. Um renderizador monta a resposta completa ou seletiva.
6. A fila persistente entrega a resposta e registra o diagnóstico.

## Fonte única de horários

`professor_schedule_entries` é a fonte de verdade para professor, disciplina, semestre, dia, horário e sala. Cards empacotados continuam fornecendo título e gatilhos, mas o conteúdo acadêmico é gerado em tempo de consulta.

## Módulos

- `src/engine/`: intenção, contexto, desambiguação e renderização;
- `src/whatsapp/`: conexão, entrada, serialização, entrega e reconciliação;
- `src/database/migrations/versions/`: migrações incrementais;
- `src/database/*-repository.js`: acesso estruturado ao SQLite;
- `src/structured-card-renderer.js`: apresentações derivadas dos dados.
