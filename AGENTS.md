# Orientações para agentes

- Monorepo Linux, Python stdlib + WebExtensions JS; sem dependências extras.
- Gear Lever é o backend, não recriar nem alterar banco/metadata internos dele.
- Extensão OFF por padrão; ON integra automaticamente downloads HTTPS .AppImage após conclusão. OFF não intercepta downloads.
- Segurança: não executar AppImages diretamente, nunca usar shell=True, validar arquivos regulares, origem e sintaxe das fontes. Nunca inventar URL de updates.
- Não sobrescrever fonte de atualização já existente ou embutida. Usar Gear Lever CLI.
- Pasta final deve ser controlada por Gear Lever; nunca mover arquivos manualmente.
- Native host de uma solicitação por processo, comunicação JSON length-prefixed em stdin/stdout.
- Navegadores precisam de consentimento para instalação de extensões. Nunca utilizar políticas corporativas para fazer force-install.
- Atualizar README, .agents e testes quando mudar contrato, CLI ou fluxos.
- Testes: python3 -m unittest discover -s tests -v; node --check extension/common/background.js; bash -n install.sh uninstall.sh scripts/build-extensions.sh.

- Após v0.2, não gerar wildcard que misture arquiteturas/edições: validar asset original e correspondência única contra API do release; quando não for possível, manter fonte desconhecida.
- Interface web: Native Messaging API com ações allowlisted, confirmação explícita e path conferido na lista do Gear Lever; atualizações não podem forçar execução de apps abertos.
- Testes devem incluir novas rotas de gestão e carregamento dos recursos `manager.html`/`native-client.js`.

- Package files in `dist/packages` with `scripts/package_extensions.py`; sign CRX with the browser packer only (CRX3), store private key outside repo and dist, and never commit a `.pem`.
- Do not modify browser profiles or use enterprise forced-install policies. Signed CRX may be manually installed where supported; fallback is developer-mode unpacked. Unsigned Firefox XPI is for temporary install only.
- Preserve old unpacked extension ID for existing users; pass both unpacked and packaged IDs to Native Messaging when a packed ID is available.
- README.md must be fully in English. Update i18n in `docs/assets/i18n.js` together for pt-BR/en/es when describing installation.

- The Git SHA of main is the only application build identifier, embedded by scripts/build-extensions.sh into version.json and build-revision.js for both extension flavors. The installer must fetch the newest main even if invoked from an old local checkout.
- bridge/host.py getVersion exposes installed version.json without initializing Gear Lever. Write installed revision LAST after successful installation.
- The extension periodically compares GitHub commits/main against its embedded commit and host commit; badge NEW and UI alerts do not run shell scripts and must not toggle ON/OFF.
- Keep README.md English and do not claim locally packaged CRX/XPI can be silently updated inside a browser.

- Local CRX3 is an experimental packaging artifact, not a reliable install route for Edge/Chrome. CRX_REQUIRED_PROOF_MISSING indicates missing browser-store proof. In installer/README recommend Developer mode → Load unpacked first, with no force-install, policy modification or profile injection.
