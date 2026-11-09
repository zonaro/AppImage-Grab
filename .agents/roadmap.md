# Roadmap

MVP: extensão Chromium/Firefox com toggle persistente, bridge Python, detecção de releases GitHub/GitLab/Codeberg, integração e registro de fonte de atualização via CLI Gear Lever, instalador/desinstalador por usuário.

QA pendente: validar Fedora real com Gear Lever Flatpak, Edge/Brave/Vivaldi, redirects CDN, arquivos repetidos, navegador encerrado durante download, permissões de Flatpak.

Futuro: publicar CRX/Web Store e extensão assinada Firefox/AMO, detectar origens sem padrão de URL por API com validação do asset, tela de revisão opcional, integração com navegadores Flatpak, i18n pt/en/es, testes automatizados de ponta a ponta.

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
