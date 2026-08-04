# HUB WhatsApp Bot v0.16.0

Bot comunitário autohospedado para responder dúvidas acadêmicas em grupos e conversas privadas relacionadas ao HUB Arquivos IFBA. A v0.16.0 adiciona uma camada própria de interpretação e condução da conversa: o bot aproveita o que entendeu, pede apenas a informação ausente, mantém contexto, sugere assuntos relacionados e mede se a recuperação resolveu a dúvida.

> [!IMPORTANT]
> ### Todo o código deste repositório foi criado por IA generativa, em especial ChatGPT/OpenAI, a partir de instruções, ideias, testes e revisões humanas.
>
> O mantenedor humano atuou principalmente como **idealizador, testador, revisor, curador de conteúdo e validador visual/funcional** do projeto.

> [!WARNING]
> O projeto usa Baileys, uma integração não oficial com o WhatsApp. Use um número separado, responda apenas a solicitações reais, evite mensagens em massa e não apresente o bot como serviço oficial do IFBA.

## O que mudou na v0.16.0

- interpreta intenção, disciplina, professor, referência temporal e semestre antes de desistir;
- quando falta um dado essencial, faz somente uma pergunta complementar;
- mantém o último assunto após respostas normais, inclusive setores, professores e disciplinas;
- diferencia agradecimentos, confirmações e conversa comum de tentativas frustradas;
- amplia a ajuda progressivamente na primeira, segunda e terceira falha;
- aprende, para revisão administrativa, com reformulações e opções escolhidas;
- permite confiança, termos obrigatórios, evidências negativas e assuntos incompatíveis por card;
- aceita aliases fonéticos e transcrições recorrentes;
- oferece no máximo três sugestões e a opção “Nenhuma dessas”;
- retoma escolhas e contextos expirados recentemente;
- mantém recuperação restrita em grupos: apenas após prefixo, ponto ou menção, salvo uma escolha que o próprio bot iniciou;
- registra métricas de resolução direta, esclarecimento, sugestão, menu e abandono;
- adiciona a área **Dados acadêmicos** ao painel;
- persiste conversas temporárias no SQLite e separa o estado por usuário;
- adiciona fonte e responsável às exceções acadêmicas, com desativação automática após a validade;
- restaura atalhos exatos oficiais que migrações antigas haviam ampliado indevidamente.

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
scripts/hub-bot release local 0.16.0 ~/Downloads/hub-whatsapp-bot-v0.16.0.zip
scripts/hub-bot release github 0.16.0 ~/Downloads/hub-whatsapp-bot-v0.16.0-github.zip
scripts/hub-bot release oracle 0.16.0 ~/Downloads/hub-whatsapp-bot-v0.16.0.zip
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
