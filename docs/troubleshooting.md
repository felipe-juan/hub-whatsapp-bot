# Solução de problemas

## SSH fica em “Connecting”

Teste outra rede ou hotspot. Use o destino salvo em `~/.config/hub-whatsapp-bot/oracle-ssh-target` ou informe `HUB_ORACLE_SSH_TARGET=ubuntu@IP`; o alias `hub-oracle` só é usado quando estiver definido no `~/.ssh/config`.

## Dependências

Execute `node scripts/verify-package-lock.js` e depois `npm ci --ignore-scripts --no-audit --no-fund --legacy-peer-deps`.

## Contexto de continuação não funciona

Confirme `persistent_context_enabled=true` e verifique se a pergunta seguinte ocorreu antes da expiração configurada.

## Dados acadêmicos antigos

Abra **Qualidade** no painel. Verifique período ativo, data da fonte e número de registros, depois importe o quadro atualizado.
