# HUB WhatsApp Bot v0.15.10

Bot comunitário autohospedado para responder dúvidas acadêmicas em grupos e conversas privadas relacionadas ao HUB Arquivos IFBA. A v0.15.10 amplia os atalhos exatos dos cards de semestre, incluindo números, ordinais e algarismos romanos, mantendo a ativação explícita em grupos. No privado, o comportamento permanece inalterado.

> [!IMPORTANT]
> ### Todo o código deste repositório foi criado por IA generativa, em especial ChatGPT/OpenAI, a partir de instruções, ideias, testes e revisões humanas.
>
> O mantenedor humano atuou principalmente como **idealizador, testador, revisor, curador de conteúdo e validador visual/funcional** do projeto.

> [!WARNING]
> O projeto usa Baileys, uma integração não oficial com o WhatsApp. Use um número separado, responda apenas a solicitações reais, evite mensagens em massa e não apresente o bot como serviço oficial do IFBA.

## O que mudou na v0.15.10

- Contatos do Serviço Social adicionados aos cards de PAAE.
- Valores monetários de 2025 apresentados numericamente.
- Auxílio para óculos incluído com requisitos e valor variável.

- mensagens casuais em grupos são descartadas antes de entrar na fila serial;
- comandos deixam de esperar atrás do tráfego normal de um grupo movimentado;
- o motor não varre todos os cards quando o índice não encontra candidatos;
- metadados completos de centenas de participantes não são mais carregados por mensagem;
- entrada e saída de participantes não provocam sincronização completa de todos os grupos;
- a sincronização inicial ocorre em segundo plano.

- Os oito cards de semestre aceitam atalhos exatos como `primeiro semestre`, `semestre 1`, `1º semestre`, `semestre I` e `I semestre`.
- Em grupos, os atalhos continuam exigindo ativação: `.primeiro semestre`, `bot semestre 1` ou menção ao bot.

## O que mudou na v0.15.2

- corrige a validação dos ZIPs para permitir somente a pasta `data/` vazia, mantendo proibido qualquer banco, arquivo, link ou conteúdo de runtime;
- remove a pasta `data/` vazia dos novos ZIPs, evitando a falha observada na v0.15.1;
- detecta explicitamente um Node.js 22.13+ da família 22.x antes da instalação;
- permite indicar o Node correto com `HUB_NODE_BIN=/caminho/para/node-22`;
- caso `npm ci` não consiga acessar o registro, reutiliza `node_modules` da instalação anterior somente após validar as versões diretas;
- mantém rollback completo caso a nova versão não consiga ser validada ou iniciada.

## O que mudou na v0.15.1

- cria um card canônico de repositórios, arquivos e materiais de BSI;
- inclui Notion BSI 2.0, HUB Arquivos IFBA, Google Drives e Manual de Sobrevivência;
- aceita atalhos exatos como `repositório`, `arquivos`, `drive`, `links do drive`, `acervo` e perguntas contextuais equivalentes;
- adiciona um card direto sobre quebra de pré-requisito, protocolo, justificativa e decisão do Colegiado;
- adiciona um card que explica como a letra e os números das salas indicam bloco e andar, com destaque para o Bloco H e os laboratórios `H40x`;
- reconcilia migrações antigas para manter gatilhos curtos como frases exatas, sem conflitos com Biblioteca ou com o card de Felipe;
- preserva cards personalizados e aposenta apenas o card genérico antigo de Drive quando ele não foi alterado pelo administrador.

## O que mudou na v0.15.0

- o quadro estruturado passou a gerar dinamicamente cards de professor, disciplina, semestre, sala, horário e próxima aula;
- migrações futuras são versionadas, transacionais e verificadas por checksum;
- dados e apresentação foram separados por renderizadores estruturados;
- gatilhos possuem política central e modo de observação;
- contextos curtos sobrevivem a reinícios por alguns minutos;
- o painel mostra validade acadêmica, migrações, observações e relatos de falsos positivos;
- há corpus permanente, grupos de testes e banco-template de testes;
- `package-lock.json`, proveniência e faixa Node `>=22.13 <23` fazem parte do release;
- implantação local, GitHub e Oracle usa `scripts/hub-bot release ...`;
- `private-content.json` não é distribuído nos ZIPs principais.

## Instalação rápida

```bash
cp .env.example .env
cp private-content.example.json private-content.json  # opcional; preencha apenas dados privados locais
chmod 600 private-content.json
npm ci --ignore-scripts --no-audit --no-fund --legacy-peer-deps
npm run check
npm start
```

O painel é local. Consulte [instalação no Fedora](docs/installation-fedora.md) ou [instalação na Oracle](docs/installation-oracle.md).

## Comandos principais

```bash
npm run check
npm run syntax
npm run test:unit
npm run test:integration
npm run test:content
npm run test:migrations
npm run test:performance
npm run test:corpus
npm run release:verify
```

Implantação:

```bash
scripts/hub-bot release local 0.15.10 ~/Downloads/hub-whatsapp-bot-v0.15.10.zip
scripts/hub-bot release github 0.15.10 ~/Downloads/hub-whatsapp-bot-v0.15.10-github.zip
scripts/hub-bot release oracle 0.15.10 ~/Downloads/hub-whatsapp-bot-v0.15.10.zip
```

## Documentação

- [Arquitetura](docs/architecture.md)
- [Gatilhos e modo de observação](docs/triggers.md)
- [Dados de horários](docs/schedule-data.md)
- [Backups e recuperação](docs/backups-and-recovery.md)
- [Processo de release](docs/release-process.md)
- [Solução de problemas](docs/troubleshooting.md)
- [README histórico da v0.14.4](docs/legacy-readme-v0.14.4.md)

## Licença

Este projeto é distribuído sob a licença MIT. Consulte [LICENSE](LICENSE). O uso de integrações não oficiais com o WhatsApp é de responsabilidade de quem hospeda e opera a instalação.
