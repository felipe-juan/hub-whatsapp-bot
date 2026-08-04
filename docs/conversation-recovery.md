# Recuperação conversacional

A v0.16.0 executa a recuperação somente depois das regras exatas e da camada acadêmica estruturada.

## Fluxo

1. Usa uma conversa temporária pendente, quando houver.
2. Trata comandos administrativos.
3. Ignora ou responde brevemente a agradecimentos, confirmações e saudações.
4. Extrai intenção, disciplina, professor, referência temporal e semestre.
5. Responde diretamente quando há confiança suficiente.
6. Pergunta somente o elemento essencial ausente.
7. Oferece até três hipóteses e “Nenhuma dessas”.
8. Amplia para categorias após falhas consecutivas.
9. Registra abandono e resolução para análise no painel.

## Estado temporário

O estado é separado por conversa e participante, persiste no SQLite, expira normalmente em cinco minutos e mantém uma janela curta adicional para retomada. `sair`, `cancelar`, `menu` e `0` encerram o fluxo.

## Aprendizado assistido

Reformulações e opções escolhidas podem produzir sugestões no painel. Nenhum novo gatilho é publicado automaticamente.

## Grupos

Em grupos, a recuperação só começa quando a mensagem é ativada por `bot`, `bote`, `robô`, `Escravo do Juan`, menção ou ponto inicial. Uma resposta numérica sem prefixo só é aceita quando o próprio bot deixou uma escolha pendente para aquele participante.

## Métricas

O painel apresenta resolução direta, por esclarecimento, por sugestão, por menu e abandono, além do número médio de mensagens até a resposta.
