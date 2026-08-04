# Dados estruturados de horários

A tabela `professor_schedule_entries` guarda:

- período acadêmico;
- professor e e-mail;
- disciplina e sigla;
- semestre;
- dia da semana;
- início e fim;
- sala;
- título, versão e data da fonte.

Professor, disciplina, semestre, sala, horário, aula atual e próxima aula são renderizados a partir desses registros. Ao importar um quadro, o sistema registra contagem, checksum e data em `academic_data_imports`.
