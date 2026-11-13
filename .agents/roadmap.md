# Roadmap

MVP: extensão Chromium/Firefox com toggle persistente, bridge Python, detecção de releases GitHub/GitLab/Codeberg, integração e registro de fonte de atualização via CLI Gear Lever, instalador/desinstalador por usuário.

QA pendente: validar Fedora real com Gear Lever Flatpak, Edge/Brave/Vivaldi, redirects CDN, arquivos repetidos, navegador encerrado durante download, permissões de Flatpak.

Futuro: publicar CRX/Web Store e extensão assinada Firefox/AMO, detectar origens sem padrão de URL por API com validação do asset, tela de revisão opcional, integração com navegadores Flatpak, testes automatizados de ponta a ponta.

- [x] Extension i18n: pt-BR, en, es with browser-language detection and English fallback across popup, manager, store, confirmations and notifications; standard manifest locales and regression checks.
- [x] Local notification preferences, browser permission diagnostics, test notification, bounded event history, and clickable manager fallback.
- [x] Gear Lever-confirmed AppImage update alerts (12-hour alarm and deduplication), integration-error alerts and explicit-update completion/error alerts; automated tests added.

## Versão 0.2

- [x] Extração de versão e arquitetura do nome do asset com wildcard restrito.
- [x] Consulta segura da lista de assets para validar padrões ambíguos.
- [x] Popup com lista de AppImages; painel de gerenciamento em aba do navegador, usando Gear Lever CLI.
- [x] Operações de atualizar, mover para lixeira e configurar fonte com confirmação e checagem da lista instalada.
- [ ] Testes reais em Fedora/Edge e outros navegadores, incluindo API rate limit e assets de diferentes arquiteturas.
- [ ] Paridade visual/funções extras com versões futuras do Gear Lever (metadados e controle de atualização avançado via CLI quando disponíveis).

## Browser packaging and installation (v0.3)

- [x] Produce an unsigned Firefox XPI with assets at archive root.
- [x] Attempt Chromium-generated signed CRX3 using a private key retained locally for stable future builds.
- [x] Update Native Messaging to trust both unpacked legacy ID and locally packaged CRX ID.
- [x] Print per-browser manual installation guidance, opening the default browser's extension page when interactive.
- [x] Keep the fallback unpacked extension when CRX packaging or installation is not supported.
- [x] Rewrite README fully in English and test generated XPI in CI.
- [ ] Publish a signed Firefox AMO release for persistent installation.
- [ ] Establish a publisher signing key and published CRX on supported browser stores (one stable extension ID across machines).
- [ ] Validate CRX3 installation and native host communication on Edge, Chrome, Brave, Vivaldi and Fedora; refine browser-specific instructions.

## Commit-based updates (v0.4)

- [x] Treat the latest main commit SHA as the installed version.
- [x] Re-run install.sh as an updater by fetching the newest main even from an older local clone.
- [x] Stamp the same SHA into the Python bridge and extension bundles/packages.
- [x] Browser checks GitHub API periodically, caches result and shows NEW badge and update/reload notices.
- [x] Expose host getVersion without invoking Gear Lever.
- [x] Keep AppImage automation OFF/ON unrelated to checking extension updates.
- [ ] Test Edge/Firefox real installation/reinstallation and badge behavior.
- [ ] Provide future in-browser update flow only if browser-store distribution supports a compliant signed auto-update channel.

## CRX_REQUIRED_PROOF_MISSING (2026-11-09)
- [x] Document that local CRX3 key signing is not equivalent to Web Store / Edge Add-ons distribution proof.
- [x] Make Load unpacked the recommended Chromium-family setup route and ensure install.sh prints exact directory.
- [ ] Publish official browser-store packages for no-developer-mode installation with user approval.
- [ ] Test Edge's extension details, native host connectivity and browser restart with unpacked extension.

## Simplified unpacked-only distribution

- [x] Remove CRX/XPI packaging code, tests and generated files.
- [x] Install/update only unpacked extension directories and Python Native Messaging bridge.
- [x] Generate one standalone local HTML setup guide with canonical install paths, detected browser URLs, copy buttons and pt-BR/en/es instructions.
- [x] Open the guide in the default browser when a graphical desktop is available; opt out via AIG_OPEN_BROWSER=0.
- [x] Show terminal instructions when the guide cannot be opened.
- [x] Update README in English and landing i18n in PT-BR/EN/ES.
- [ ] Perform real Fedora/Edge/Firefox installation QA using the guide.

Legacy CRX/XPI milestones above are superseded; there is **no package builder** in the current distribution flow.

## State accuracy regression (2026-11-09)

- [x] Fix false Update actions caused by using presence of an update manager as a proxy for an update.
- [x] Use Gear Lever --list-updates --json as the authoritative update source and revalidate server-side before starting updates.
- [x] Read existing source configuration (repo, pattern, prereleases, static URL) from Gear Lever's INI read-only; distinguish Flatpak and native config roots.
- [x] Prefill existing settings in the browser manager, preserve embedded and unsupported managers, and block writes when settings cannot be safely loaded.
- [ ] Validate against real user installations/Flatpak config path, including saved Forgejo/FTP sources and update checks when offline.
- [ ] Ask upstream Gear Lever for an official --get-update-source --json endpoint to eliminate read-only reliance on private INI layout.

## Supported-site suggestions

- [x] Discover AppImage release assets on active GitHub/GitLab/Codeberg repository pages.
- [x] Show a throttled desktop push and an Install button in the popup with architecture selection.
- [x] Notification opens a prefilled manager form; no automatic download until the user confirms.
- [x] Keep passive-suggestions toggle separate from download integration ON/OFF.
- [x] Add URL validation / cooldown tests to CI.
- [ ] Manual Edge/Firefox/Fedora QA including the browser permissions prompt, notifications, install confirmation, release selectors and app installation via Native Messaging.
- [ ] Extend provider support with explicit allowlisted resolver modules; do not treat every website as compatible.

## AppImage store in the browser manager (2026-11-11)

- [x] New Store tab in `manager.html`, independent from installed apps and updates.
- [x] AppImage Catalog feed (the same source as AppImagePool) and AppImageHub/OpenDesktop OCS catalog, with source/category filters, search, sorting, details, images and load-more.
- [x] Architecture selection and explicit consent before a browser download. Preserve Native Messaging + Gear Lever as the only integration route.
- [x] On-demand revalidation of known Pling-hosted files against the AppImageHub item API. Unsupported third-party hosts are open-in-browser only.
- [x] Offline unit and UI regression tests, manifest origin permissions and English README instructions.
- [ ] Verify actual downloads/installations with Firefox and Chromium on Fedora, especially short-lived Pling links, download prompts and Gear Lever source detection.
