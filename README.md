# Gear Lever Grab

**AppImage baixado → Gear Lever → fonte de atualização.** Extensão WebExtension + host Python para Linux. O Gear Lever continua responsável pela instalação, organização dos arquivos e atualização.

## Landing page

Site do projeto (pt-BR, English, Español): **https://zonaro.github.io/gear-lever-grab/** — disponível depois que o GitHub Pages for habilitado com `main` / `/docs`.

A landing está em [`docs/`](docs/README.md), usa HTML/CSS/JavaScript puro com i18n, e destaca o [instalador em um comando](install.sh).

## Gerenciador no navegador (versão 0.2)

Além do toggle ON/OFF, o popup apresenta uma lista resumida dos AppImages instalados. O botão **Gerenciar no navegador** abre uma aba com um painel inspirado na organização visual do Gear Lever, mas implementado em HTML/CSS/JS (não é uma incorporação da interface GTK).

O painel permite **buscar aplicativos, consultar versões e fontes, verificar atualizações, atualizar, mover para a lixeira e configurar/remover fontes personalizadas**. O backend é sempre a CLI do Gear Lever via Native Messaging. Todas as ações que modificam instalações ou fontes pedem confirmação explícita; arquivos arbitrários fora da lista instalada não são aceitos. Fontes embutidas não podem ser substituídas pelo painel.

### Versões e arquiteturas dos releases

O Grab usa o nome do **asset do release** (não nomes possivelmente alterados pelo navegador, como `(1)`) como `repo_filename` do Gear Lever. Exemplos:

- `MyApp-v2.6.1-x86_64.AppImage` → `MyApp-*-x86_64.AppImage`
- `MyApp-2.6.1-aarch64.AppImage` → `MyApp-*-aarch64.AppImage`
- `MyApp-2.6.1-i686.AppImage` → `MyApp-*-i686.AppImage`

Distingue `x86_64/amd64`, `x86/i686`, `arm64/aarch64`, `armv7` e `riscv64`. O padrão troca **somente a versão**, preservando edição e arquitetura. Para padrões contendo `*`, consulta o release oficial (GitHub/GitLab/Codeberg) e só registra automaticamente a fonte quando **um único asset** corresponde. Se a consulta falhar ou o wildcard coincidir com outros assets, integra sem fonte personalizada: nunca seleciona outra arquitetura por aproximação. Se houver informação de arquitetura no executável ELF, ela é confrontada com a indicada no asset.

**Importante:** para receber a nova interface e o novo host após atualizar o código, execute novamente o instalador, depois **recarregue a extensão** na página de extensões do navegador. Extensões carregadas manualmente não recebem atualizações automáticas da loja.

## Funcionamento

Quando a extensão está **ON**, ela observa downloads de arquivos `.AppImage` (sem alterar o download normal). Após o navegador concluir um download HTTPS:

1. O host Python recebe caminho, URL e referência do navegador por Native Messaging.
2. Valida arquivo real do usuário com assinatura ELF/AppImage e tenta descobrir a fonte de atualização (GitHub Releases, GitLab Releases e Codeberg Releases).
3. Usa `flatpak run it.mijorus.gearlever --integrate <arquivo> -y`, conferindo a entrada criada em `--list-installed --json`.
4. Se a fonte é identificada e não há uma fonte anterior/embutida, usa `--set-update-source` com os argumentos próprios do provedor.
5. A pasta final e a opção de **remover o arquivo original** são configurações **do Gear Lever**, respeitadas pela integração; não fazemos `mv` manualmente nem modificamos o banco interno do programa.

Fontes desconhecidas não são adivinhadas: a AppImage pode ser integrada, mas sem gerenciador de atualização personalizado. A extensão **não executa a AppImage** após integrar. Entretanto, o Gear Lever pode extrair metadados do arquivo; confie apenas em downloads seguros.

## Instalação (Linux)

Requisitos: Python 3.10+, Gear Lever com CLI e `--list-installed --json` (recomendamos versão recente), navegador compatível, Bash, Git e curl.

**Instalação rápida — copie e cole uma única linha no terminal:**

```bash
curl -fsSL https://raw.githubusercontent.com/zonaro/gear-lever-grab/main/install.sh | bash
```

O comando obtém o instalador diretamente deste repositório; ele baixa uma cópia temporária dos arquivos, instala o host Native Messaging e remove a cópia temporária ao concluir. Como qualquer instalador remoto executado no terminal, revise [o script](install.sh) antes de executar se não confiar na origem.

**Alternativa usando um clone local** (útil para desenvolvimento e testes):

```bash
git clone https://github.com/zonaro/gear-lever-grab.git && cd gear-lever-grab && bash install.sh
```

O instalador copia os componentes para `~/.local/share/gear-lever-grab`, registra o host Native Messaging nos navegadores **detectados** (Chrome, Chromium, Brave, Vivaldi, Edge, Opera, Thorium, Firefox, Floorp e Waterfox) e prepara os diretórios das extensões.

**A autorização final da extensão é manual.** Os navegadores não permitem instalar silenciosamente extensões unpacked por um instalador comum; não burlamos políticas de segurança. Para Edge acesse `edge://extensions`, habilite **Modo do desenvolvedor**, clique **Carregar sem compactação** e selecione:

```
~/.local/share/gear-lever-grab/dist/chromium
```

Nos outros navegadores Chromium, siga o fluxo equivalente. No Firefox a instalação sem assinatura é **temporária** via `about:debugging`; para distribuição permanente é necessário assinar o add-on na AMO.

Depois abra o popup da extensão e ative o toggle **ON**. O estado é salvo no armazenamento do próprio navegador e o badge mostra ON/OFF. **OFF** deixa todos os downloads funcionando normalmente, sem iniciar integrações novas.

## Como testar

```bash
python3 -m unittest discover -s tests -v
node --check extension/common/background.js
bash -n install.sh uninstall.sh scripts/build-extensions.sh
```

Para um teste real, baixe uma AppImage de um release GitHub válido após habilitar a extensão; confirme no Gear Lever o caminho e a origem de atualização. O host não fica rodando como daemon: o navegador o inicia por demanda.

## Limitações

- Só arquivos terminados em `.AppImage`, downloads HTTPS concluídos, arquivo regular pertencente ao usuário e assinatura AppImage são processados.
- URLs finais CDN e redirecionamentos podem ocultar a origem. Sem evidência confiável de release, não registramos uma fonte inventada.
- Assets versionados recebem wildcard na versão completa do nome; somente padrões com correspondência única no release são registrados automaticamente. A API pode bloquear a validação (por exemplo, limite de requisições), deixando o AppImage integrado sem uma fonte personalizada.
- Navegadores Flatpak/sandboxed podem não conseguir localizar o host, exigindo integração adicional.
- Não testa assinatura criptográfica do publisher; **assinatura ELF/AppImage não prova autenticidade**.
- Se o Gear Lever mantiver o original após integrar, o Grab não o exclui por conta própria.
- Ainda não executamos QA real em todos os navegadores e distros.

## Desinstalação

```bash
bash uninstall.sh
```

Remove o host registrado e os arquivos do Grab. A extensão deve ser removida no navegador. Os programas já integrados ao Gear Lever **não são removidos**.

## Documentação

Consulte [AGENTS.md](AGENTS.md) e [.agents/architecture.md](.agents/architecture.md). Licença no arquivo [LICENSE](LICENSE).
