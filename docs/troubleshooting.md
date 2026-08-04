# Solução de problemas

## SSH fica em “Connecting”

Teste outra rede ou hotspot e use `ssh -o ConnectTimeout=10 -o ConnectionAttempts=1 hub-oracle hostname`.

## Dependências

Execute `node scripts/verify-package-lock.js` e depois `npm ci --ignore-scripts --no-audit --no-fund --legacy-peer-deps`.

## Contexto de continuação não funciona

Confirme `persistent_context_enabled=true` e verifique se a pergunta seguinte ocorreu antes da expiração configurada.

## Dados acadêmicos antigos

Abra **Qualidade** no painel. Verifique período ativo, data da fonte e número de registros, depois importe o quadro atualizado.
