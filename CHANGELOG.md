# v0.16.0 — 2026-08-04

- cria a camada de interpretação e recuperação conversacional;
- extrai intenção, disciplina, professor, tempo e semestre;
- pergunta somente o dado essencial que estiver ausente;
- mantém contexto após respostas normais e retoma contextos recém-expirados;
- diferencia conversa comum de tentativa frustrada;
- oferece ajuda progressiva e sugestões com “Nenhuma dessas”;
- registra aprendizado assistido por reformulação e escolha;
- adiciona confiança e evidências negativas por card;
- persiste estados temporários e métricas de recuperação no SQLite;
- adiciona a área Dados acadêmicos e métricas ao painel;
- amplia exceções temporárias com fonte, responsável e expiração automática;
- restaura gatilhos exatos oficiais afetados por migrações legadas.

# v0.15.13 — 2026-08-04

- aceita `bote` como prefixo equivalente a `bot`;
- reconhece consultas fragmentadas e repetitivas combinando professor, disciplina e dia;
- inclui `econimia` como variação real de transcrição para Economia;
- substitui o nome local do CSV pelo link oficial do quadro no SharePoint.
