# Arquitetura

```text
Chrome/Chromium/Brave/Vivaldi/Edge/Firefox + downloads API
    ↓ (ON + download complete)
WebExtension / background.js
    ↓ Native Messaging (stdio JSON)
bridge.host
    ├─ valida .AppImage / ELF / arquivo regular / HTTPS
    ├─ deduplica (flock + recibos em XDG_STATE_HOME)
    ├─ detect_source: URL asset de releases GitHub/GitLab/Codeberg
    └─ bridge.gearlever: CLI pública
          ├─ --list-installed --json
          ├─ --integrate <caminho> -y
          ├─ --list-installed --json
          └─ --set-update-source <instalado> --manager <provedor> chave=valor ...
```

- Estado persistente de popup: browser.storage.local (enabled, pending, processed, lastResult).
- Host: `~/.local/bin/gear-lever-grab-host`.
- Código instalado: `$XDG_DATA_HOME/gear-lever-grab`.
- Recibos/log: `$XDG_STATE_HOME/gear-lever-grab`.
- A opção `appimages-default-folder` e a movimentação na integração são do Gear Lever (não editamos gsettings).
- Fontes existentes/embutidas são mantidas.
- Sem daemon permanente nem auto-update próprio: o Gear Lever atualiza.
- A extensão não altera o download do navegador; instala o arquivo baixado apenas quando ON e finalizado.
- Sem adivinhar repositório com base apenas no nome do arquivo ou na URL genérica da página.
- O host é invocado com autorização da extensão específica (allowed_origins / allowed_extensions), não é uma API HTTP aberta.
