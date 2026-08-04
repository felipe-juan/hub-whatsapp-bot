# Backups e recuperação

Antes de atualizar a Oracle, o script preserva:

- `data/`;
- `.env`;
- `private-content.json`, quando existir.

Os backups ficam em `~/hub-whatsapp-backups`. Em falha de instalação ou validação, os dados são mantidos e o serviço é iniciado novamente. Teste periodicamente a restauração em uma cópia separada.
