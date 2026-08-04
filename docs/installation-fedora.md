# Instalação no Fedora

Requisitos: Fedora, Node.js 22.13–22.x, npm, unzip e rsync.

```bash
bash INSTALL.sh
```

Para validar:

```bash
cd ~/.local/share/hub-whatsapp-bot
node scripts/check.js
```

O arquivo `.env`, o banco em `data/`, `node_modules/` e `private-content.json` são preservados em atualizações.
