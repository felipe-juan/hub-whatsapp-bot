# HUB WhatsApp Bot v0.15.0

Bot comunitário autohospedado para responder dúvidas acadêmicas em grupos e conversas privadas relacionadas ao HUB Arquivos IFBA. A v0.15.0 consolida dados estruturados, gatilhos explicáveis, contexto persistente, migrações versionadas e operação reproduzível.

> [!IMPORTANT]
> ### Todo o código deste repositório foi criado por IA generativa, em especial ChatGPT/OpenAI, a partir de instruções, ideias, testes e revisões humanas.
>
> O mantenedor humano atuou principalmente como **idealizador, testador, revisor, curador de conteúdo e validador visual/funcional** do projeto.

> [!WARNING]
> O projeto usa Baileys, uma integração não oficial com o WhatsApp. Use um número separado, responda apenas a solicitações reais, evite mensagens em massa e não apresente o bot como serviço oficial do IFBA.

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
scripts/hub-bot release local 0.15.0 ~/Downloads/hub-whatsapp-bot-v0.15.0.zip
scripts/hub-bot release github 0.15.0 ~/Downloads/hub-whatsapp-bot-v0.15.0-github.zip
scripts/hub-bot release oracle 0.15.0 ~/Downloads/hub-whatsapp-bot-v0.15.0.zip
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
