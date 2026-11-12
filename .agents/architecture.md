# Arquitetura

```text
Chrome/Chromium/Brave/Vivaldi/Edge/Firefox + downloads API
    ↓ (ON + download complete)
WebExtension / background.js
    ↓ Native Messaging (stdio JSON)
bridge.host
    ├─ verifica só limites de segurança Native Messaging (caminho absoluto do usuário)
    ├─ deduplica downloads idênticos (flock + recibos em XDG_STATE_HOME)
    └─ bridge.gearlever: CLI pública
          └─ --integrate <caminho> -y  [autoridade única sobre o AppImage]
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

- `bridge.sources` permanece como código legado auxiliar, mas não participa da integração automática. Não usamos ELF/e_machine, MIME, magic bytes, hashes, arquitetura nem conteúdo para decidir se o Gear Lever pode instalar algo. O resolvedor de links continua verificando URLs de releases para apresentar escolhas seguras ao usuário.
- A integração automática não altera fontes de atualização, não gera wildcards e não tenta reconciliar `--list-installed`; fontes embutidas e demais configurações são geridas pelo Gear Lever. O usuário pode editá-las explicitamente na interface gerencial.
- A biblioteca `bridge.manager.AppManager` oferece leitura de instalados/updates e ações validadas na CLI Gear Lever (atualizar, remover para lixeira, editar/desfazer fonte).
- O host Native Messaging aceita `listInstalled`, `listUpdates`, `updateApp`, `removeApp`, `setSource`, `unsetSource`, além de `integrate` e `ping`. Operações mutáveis exigem `confirmed: true` e caminho exatamente presente na lista do Gear Lever.
- Popup oferece acesso rápido e toggle; `manager.html` abre em aba própria para tela completa, com busca, status e ações, sem executar programas arbitrários.
- O frontend imita conceitos do fluxo Gear Lever, mas não embute a janela GTK nem copia interface binária.

## Manual browser extension installation

- `install.sh` clones the latest main, builds only `dist/chromium` and `dist/firefox`, updates the Python Native Messaging host, and stamps the Git main SHA in the extension and bridge.
- It removes previous `dist/packages` CRX/XPI artifacts, but retains any legacy private signing keys stored outside the application to avoid destructive loss.
- The host allowlist registers only the stable Chromium unpacked extension ID and the existing Firefox ID.
- `scripts/generate_install_guide.py` renders `scripts/install-guide-template.html` as the self-contained `$XDG_DATA_HOME/gear-lever-grab/install-guide.html`, using canonical local paths, safely JSON-escaped metadata, detected browsers and PT-BR/EN/ES text.
- The guide includes copy-address buttons, exact extension directory/manifest paths and explanatory instructions. A local `file://` page cannot reliably navigate to internal `edge://`, `chrome://` or `about:` URLs, so the HTML no longer advertises a broken open button.
- With graphical DISPLAY/WAYLAND, `install.sh` opens the local guide using `xdg-open`, **then** passes the matching internal extensions URL directly to the detected browser executable. Previous `$DEST/version.json` is checked before it is overwritten; updates/reinstalls use `--updating` to add a best-effort `?q=Gear%20Lever%20Grab` hint to Chromium-family extensions URLs (e.g. `edge://extensions/?q=Gear%20Lever%20Grab`). The parameter is not an officially guaranteed search API and may be ignored; Firefox always opens the usual `about:debugging` page, while first installs use the unfiltered extensions page. Both guide and extension page still open on updates. The script discovers the default .desktop entry via `xdg-settings` then `xdg-mime`, opens only the matching browser or one fallback. No silent activation/reloading; `GLG_OPEN_BROWSER=0` disables both launches. In headless mode, print paths and manual URLs.
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
- `extension/common/manager.js` presents a link-input form; the direct Install click after choosing an asset is consent, without a second confirmation modal. Background `startManagedDownload` re-resolves the origin and only starts browser downloads for assets confirmed by the native resolver; no direct Python shell/download execution.
- Manual downloads are recorded in `storage.local.pending` and processed even with automatic download toggle OFF. Downloads that are interrupted do not yield success.
- Native Messaging `integrate` trusts `gearlever --integrate <path> -y` return code. Zero means success, with a distinct `already_processed` response when the CLI says so; nonzero CLI errors propagate to History. A Gear Lever success notification is allowed without `installedPath` (fallback to downloaded filename). Browser/OS notification suppression is independent.
- The CLI may print its actual destination path; this is display metadata only. No secondary verification, no content comparison, no reconciliation against `--list-installed`, no injected update source and no automatic reimport. Gear Lever remains the sole AppImage format and integration authority.
- A successful integration refreshes the popup and browser manager app list via changes to `lastResult`. Keep this behavior independent from the extension's own Git commit update indicator.
- Browser extension icons are PNG 16/32/48 derived from the green gear-and-glove graphic, stored under `extension/common/icons/`; site `docs/assets/favicon.png` shares the icon. `build-extensions.sh` must recursively copy all common assets.

## Browser repository-page suggestions

- `extension/common/page-offers.js`: pure URL parser accepts only GitHub, GitLab (nested groups supported), and Codeberg repository/release pages; strips query/fragment before sharing with native.
- `extension/common/page-offer-background.js`: listens for active tab loads and activation using `tabs` permission, calls Native Messaging `resolveLink`, caches responses for 15 minutes, and sends a browser notification only if AppImage assets exist. A per-repository persistent 24-hour cooldown limits suggestion frequency.
- Notification click/action opens `manager.html?source=<canonical supported URL>`, prefilling the existing link installer and listing architecture choices. It **never starts a download**; an explicit Install click remains mandatory.
- Popup calls `getPageOffer` to show provider/repository/available assets and offers an **Install in Gear Lever** button, choosing an architecture and clicking Install (no extra confirmation dialog). Installation goes through existing `startManagedDownload` background handler, normal browser download completion, `integrate` Native Messaging and success notification.
- `suggestionsEnabled` (default true) controls passive discovery pushes only; `enabled` (default false) controls automatic integration of ordinary downloads. Explicit user-approved link installs work even with automatic integration disabled. No webpage contents, cookies, or arbitrary URLs are collected.

## Local notification diagnostics and AppImage update alerts

- `extension/common/notifications.js` is the shared WebExtensions notifications layer loaded by Chromium `importScripts` and Firefox `background.scripts`. It owns category preferences, bounded `notificationHistory` (50 entries), browser permission checks, a manual test alert and click navigation. An accepted `notifications.create()` request is **not** confirmation of OS display; `onShown` is recorded only where available. A notification failure never changes an actual Gear Lever integration/update result.
- Preferences (`notificationPreferences`) are independent of automatic-download `enabled`; the `suggestions` preference mirrors legacy `suggestionsEnabled`. Manager `notification-settings.js` owns the settings/diagnostics view, with popup shortcut. The diagnostic checks native host `ping`, browser notification permission and last suggestion/check state; no private download path or URL is stored in the notification history.
- An independent 12-hour `grab-app-update-check` alarm uses Native Messaging `listUpdates` and `listInstalled`. Only exact installed paths also confirmed as pending updates qualify; deduplication persists as `appUpdateAlerts[path] = availableVersion || 'available'`. Only a **successful** complete check resets missing entries; offline errors retain the last valid alert state. The extension's own commit badge remains separate.
- Explicit manager updates now request `startAppUpdate` in the background, which requires an internal manager-page sender, explicit confirmation and the native Gear Lever path recheck. The background emits success only after `status: updated` and the exact returned path, or a distinct error alert on failure. Notification clicks only open the manager, never execute an update or install.
- A tab still needs a recognized provider and verified AppImage assets to be eligible for repository suggestions. `lastSuggestionStatus` records a small categorical diagnostic (disabled, cooldown, no assets, inactive, requested, blocked or error), never a browsed URL.
- Testing: `scripts/test-notifications.mjs`, `scripts/test-notification-ui.mjs`, existing integration/page-offer tests; real Fedora GNOME/Edge/Firefox visual notification delivery remains a manual QA gate.

## Histórico de operações

- Background records each completed/failed download and native integration via `GLGActivity.record` in `storage.local.activityHistory`, keyed by browser download ID. Limit: 200 recent operations, no URLs, full paths or credentials.
- Popup async operations must catch Native Messaging/storage/update/navigation failures without killing the UI. The `#popup-error` alert surfaces recoverable errors (tests: `scripts/test-popup-errors.mjs`); failed toggle writes restore their previous visual state. Extension context invalidation after a developer reload is ignored only in the obsolete popup, never as a success signal. A manual request rejected before download has its own operation ID; updates use an operation ID.
- Manager includes a History tab with search/status filter and explicit copy/clear actions. New entries are announced via `storage.onChanged`; errors retain bridge/CLI error messages for troubleshooting. Notification failure clicks go to `?view=history`.
- Bridge offers allowlisted `getHostLog` for read-only, bounded, redacted WARN/ERROR entries from the pre-existing `$XDG_STATE_HOME/gear-lever-grab/host.log`. This is NOT Gear Lever's private log; never read arbitrary caller-supplied paths or reveal credentials. Clearing browser history must not delete it.
