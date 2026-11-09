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

## v0.2 — arquitetura e UI

- `bridge.sources` extrai o **nome do asset do release** da URL original; troca semver por `*` mantendo arquitetura e edição.
- `bridge.sources.verify_source` compara arquitetura do asset com ELF `e_machine`; para wildcards consulta API do release conhecido, exige asset original presente e **único match** para o glob. Sem verificação ou glob ambíguo: não configura fonte.
- A biblioteca `bridge.manager.AppManager` oferece leitura de instalados/updates e ações validadas na CLI Gear Lever (atualizar, remover para lixeira, editar/desfazer fonte).
- O host Native Messaging aceita `listInstalled`, `listUpdates`, `updateApp`, `removeApp`, `setSource`, `unsetSource`, além de `integrate` e `ping`. Operações mutáveis exigem `confirmed: true` e caminho exatamente presente na lista do Gear Lever.
- Popup oferece acesso rápido e toggle; `manager.html` abre em aba própria para tela completa, com busca, status e ações, sem executar programas arbitrários.
- O frontend imita conceitos do fluxo Gear Lever, mas não embute a janela GTK nem copia interface binária.

## Manual browser extension installation

- `install.sh` clones the latest main, builds only `dist/chromium` and `dist/firefox`, updates the Python Native Messaging host, and stamps the Git main SHA in the extension and bridge.
- It removes previous `dist/packages` CRX/XPI artifacts, but retains any legacy private signing keys stored outside the application to avoid destructive loss.
- The host allowlist registers only the stable Chromium unpacked extension ID and the existing Firefox ID.
- `scripts/generate_install_guide.py` renders `scripts/install-guide-template.html` as the self-contained `$XDG_DATA_HOME/gear-lever-grab/install-guide.html`, using canonical local paths, safely JSON-escaped metadata, detected browsers and PT-BR/EN/ES text.
- The guide includes extension-page links, copy-address buttons, exact extension directory/manifest paths with copy buttons, and explanatory instructions. Since browser-internal pages may reject navigation from file://, users can paste the address into the URL bar.
- With graphical DISPLAY/WAYLAND and xdg-open, installation ends by opening the HTML guide in the default browser. `GLG_OPEN_BROWSER=0` skips launch. Without a graphical session, the guide is still written and its location printed.
- Nothing silently installs or activates the browser extension. Chrome-like browsers use Developer Mode → Load unpacked; Firefox uses temporary loading of manifest.json until official signed distribution is implemented.

## Git main commit-based updates

- install.sh always clones the latest public main; GLG_FROM_MAIN=1 is only set when re-entering the fetched script. Both local and curl-piped invocations use this flow.
- scripts/build-extensions.sh reads GLG_BUILD_SHA (or git HEAD), stamps dist/{chromium,firefox}/version.json and build-revision.js. The root version.json is copied to the installed bridge after all preceding steps complete.
- Python Native Messaging handles getVersion without touching Gear Lever. Browser extension GLGUpdate checks https://api.github.com/repos/zonaro/gear-lever-grab/commits/main at most once per 12h, using storage.local cached result and an MV3 alarm.
- Background action badge says NEW if main revision differs from extension revision or bridge revision, otherwise ON/OFF as before. Popup and manager show the three SHAs and a copyable install one-liner. No automatic remote script execution.
- Reloading an unpacked extension is still required after the installer refreshes the on-disk extension directories; the bridge updates immediately.

## Gear Lever state accuracy: sources and updates

- The CLI `--list-installed --json` gives name, path, current_version, manager, embedded_source and running, but not source-specific config keys. `bridge/source_config.py` reads the selected Gear Lever's `gearlever.conf` *read-only* and matches `app.<md5(path)>.update_manager` using the exact file path from the CLI.
- Flatpak target: `~/.var/app/it.mijorus.gearlever/config/gearlever.conf`. Native target: `$XDG_CONFIG_HOME/gearlever.conf` or `~/.config/gearlever.conf`. Never combine profiles or guess custom installations.
- Exposed fields `source_status` and `source_options` are read-only. When source info is missing/mismatched, show unavailable; do not replace existing configs with empty form defaults.
- The browser manager shows Update **only** when exact path is included in the latest Gear Lever `--list-updates --json` response. Python AppManager.update calls the same CLI again before `--update`. On error/refresh, stale update results are discarded.
- The update manager can exist without an update. The user must explicitly request the update check, and a Gear Lever CLI failure means state is unverified, not up-to-date.

## Browser notifications and download by source URL

- `bridge/link_resolver.py` validates direct AppImage assets from GitHub, GitLab and Codeberg, and resolves supported provider repository/release pages through their fixed public APIs. User-chosen assets are listed by filename and architecture; do not infer architecture if missing.
- `extension/common/manager.js` presents a link-input form and asks for confirmation after choosing an asset. Background `startManagedDownload` re-resolves the origin and only starts browser downloads for assets confirmed by the native resolver; no direct Python shell/download execution.
- Manual downloads are recorded in `storage.local.pending` and processed even with automatic download toggle OFF. Downloads that are interrupted do not yield success.
- Native Messaging `integrate` must confirm a successful Gear Lever status and an installed path before a browser desktop notification is shown. `already_processed` and failed imports never trigger a success notification. Browser/OS notification permission may suppress display without undoing a completed integration.
- A successful integration refreshes the popup and browser manager app list via changes to `lastResult`. Keep this behavior independent from the extension's own Git commit update indicator.
- Browser extension icons are PNG 16/32/48 derived from the green gear-and-glove graphic, stored under `extension/common/icons/`; site `docs/assets/favicon.png` shares the icon. `build-extensions.sh` must recursively copy all common assets.
