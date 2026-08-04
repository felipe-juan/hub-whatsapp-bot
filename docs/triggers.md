# Política de gatilhos

Categorias:

- `exact_isolated`: somente quando ocupa a mensagem inteira;
- `entity`: professor, setor ou outra entidade reconhecida;
- `intent`: sala, horário, contato, localização ou semestre;
- `safe_phrase`: pode aparecer em uma frase maior;
- `risky_short`: termo curto protegido;
- `contextual_block`: bloqueia confirmações impossíveis, como presença hoje;
- `continuation`: depende de contexto anterior;
- `observation`: registra a ocorrência sem responder.

## Modo de observação

Use-o antes de publicar um gatilho arriscado. O painel registra as mensagens que teriam acionado o card, a frequência e os motivos. Depois da revisão, o administrador pode ativar a resposta normal.
