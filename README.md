# HUB WhatsApp Bot v0.19.0

Bot comunitário autohospedado para responder dúvidas acadêmicas em grupos e conversas privadas relacionadas ao HUB Arquivos IFBA. A v0.19.0 mantém o comportamento da v0.18.0 e conclui a divisão dos maiores arquivos em módulos temáticos, reduzindo acoplamento e facilitando manutenção e testes.

> [!IMPORTANT]
> ### Todo o código deste repositório foi criado por IA generativa, em especial ChatGPT/OpenAI, a partir de instruções, ideias, testes e revisões humanas.
>
> O mantenedor humano atuou principalmente como **idealizador, testador, revisor, curador de conteúdo e validador visual/funcional** do projeto.

> [!WARNING]
> O projeto usa Baileys, uma integração não oficial com o WhatsApp. Use um número separado, responda apenas a solicitações reais, evite mensagens em massa e não apresente o bot como serviço oficial do IFBA.

## O que mudou na v0.19.0

- `bot-engine.js` virou uma fachada/orquestrador com oito handlers independentes;
- as rotas do painel foram separadas em seis módulos por domínio;
- conexão, entrada, saída, ciclo de vida e sincronização do WhatsApp foram separados;
- as migrações legadas foram divididas por geração de schema e conteúdo;
- os 50 cards de BSI foram divididos em quatro pacotes temáticos;
- contratos públicos, rotas, ordem dos cards e comportamento foram preservados;
- foi adicionado teste estrutural para impedir que as fachadas voltem a crescer.

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
npm run test:conversation-corpus
npm run release:verify
```

Implantação:

```bash
scripts/hub-bot release local 0.19.0 ~/Downloads/hub-whatsapp-bot-v0.19.0.zip
scripts/hub-bot release github 0.19.0 ~/Downloads/hub-whatsapp-bot-v0.19.0-github.zip
scripts/hub-bot release oracle 0.19.0 ~/Downloads/hub-whatsapp-bot-v0.19.0.zip
```

Para a Oracle, o atualizador usa, nesta ordem: `HUB_ORACLE_SSH_TARGET`, o arquivo `~/.config/hub-whatsapp-bot/oracle-ssh-target` ou o alias `hub-oracle` quando ele estiver realmente definido no `~/.ssh/config`. Exemplo de configuração persistente:

```bash
mkdir -p ~/.config/hub-whatsapp-bot && printf '%s\n' 'ubuntu@SEU_IP' > ~/.config/hub-whatsapp-bot/oracle-ssh-target
```

## Documentação

- [Arquitetura](docs/architecture.md)
- [Recuperação conversacional](docs/conversation-recovery.md)
- [Gatilhos e modo de observação](docs/triggers.md)
- [Dados de horários](docs/schedule-data.md)
- [Backups e recuperação](docs/backups-and-recovery.md)
- [Processo de release](docs/release-process.md)
- [Solução de problemas](docs/troubleshooting.md)
- [README histórico da v0.14.4](docs/legacy-readme-v0.14.4.md)

## Licença

Este projeto é distribuído sob a licença MIT. Consulte [LICENSE](LICENSE). O uso de integrações não oficiais com o WhatsApp é de responsabilidade de quem hospeda e opera a instalação.
