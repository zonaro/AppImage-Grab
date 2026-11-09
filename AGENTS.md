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
