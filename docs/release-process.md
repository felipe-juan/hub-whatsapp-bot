# Processo de release

1. Atualize `VERSION`, `package.json` e `package-lock.json`.
2. Execute `npm run syntax`.
3. Execute os grupos de testes e o corpus.
4. Execute `npm run release:verify`.
5. Empacote sem `.env`, `data/`, `node_modules/` e `private-content.json`.
6. Gere hashes SHA-256.
7. Publique o pacote público e aplique com `scripts/hub-bot release`.

O manifesto impede que conteúdo privado seja distribuído como código da aplicação.
