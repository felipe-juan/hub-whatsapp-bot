# Instalação na Oracle Cloud

A instalação esperada fica em `/home/ubuntu/hub-whatsapp-bot` e usa o serviço `hub-whatsapp-bot.service`.

Atualização recomendada:

```bash
scripts/hub-bot release oracle 0.15.13 ~/Downloads/hub-whatsapp-bot-v0.15.13.zip
```

O procedimento cria backup pré-atualização, envia o release para uma pasta temporária, preserva `.env`, `data/` e `private-content.json`, instala dependências, valida o projeto e reinicia o serviço. A conexão SSH usa timeout curto para não ficar presa em redes que bloqueiam a porta 22.
