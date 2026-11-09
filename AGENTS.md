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
