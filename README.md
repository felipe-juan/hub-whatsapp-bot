# HUB WhatsApp Bot v0.15.3

Bot comunitário autohospedado para responder dúvidas acadêmicas em grupos e conversas privadas relacionadas ao HUB Arquivos IFBA. A v0.15.3 corrige os endereços e a descrição dos dois Google Drives do card de repositórios, preservando as melhorias do atualizador e da arquitetura estruturada.

> [!IMPORTANT]
> ### Todo o código deste repositório foi criado por IA generativa, em especial ChatGPT/OpenAI, a partir de instruções, ideias, testes e revisões humanas.
>
> O mantenedor humano atuou principalmente como **idealizador, testador, revisor, curador de conteúdo e validador visual/funcional** do projeto.

> [!WARNING]
> O projeto usa Baileys, uma integração não oficial com o WhatsApp. Use um número separado, responda apenas a solicitações reais, evite mensagens em massa e não apresente o bot como serviço oficial do IFBA.

## O que mudou na v0.15.3

- corrige o Google Drive da turma 2025.2 para o endereço próprio `1d7RuJsK8dhAFFu1z45nC6nYTscY8aqSl`;
- informa que esse acervo mais atual possui atualmente o 1º semestre e o 2º semestre em desenvolvimento;
- mantém o Drive de veteranos no endereço `1WC7rQ6et4OiSq_4eZ9rLbKqGNeUm37dA`;
- descreve o acervo de veteranos como mais amplo, atualmente organizado do I ao VI semestre, mas potencialmente desatualizado;
- adiciona atalhos seguros como `drive 2025.2`, `drive mais atual` e `drive dos veteranos`;
- migra automaticamente o card canônico em instalações existentes, preservando cards personalizados.

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
scripts/hub-bot release local 0.15.3 ~/Downloads/hub-whatsapp-bot-v0.15.3.zip
scripts/hub-bot release github 0.15.3 ~/Downloads/hub-whatsapp-bot-v0.15.3-github.zip
scripts/hub-bot release oracle 0.15.3 ~/Downloads/hub-whatsapp-bot-v0.15.3.zip
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
