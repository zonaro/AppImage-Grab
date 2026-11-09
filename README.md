# Gear Lever Grab

**AppImage baixado → Gear Lever → fonte de atualização.** Extensão WebExtension + host Python para Linux. O Gear Lever continua responsável pela instalação, organização dos arquivos e atualização.

## Funcionamento

Quando a extensão está **ON**, ela observa downloads de arquivos `.AppImage` (sem alterar o download normal). Após o navegador concluir um download HTTPS:

1. O host Python recebe caminho, URL e referência do navegador por Native Messaging.
2. Valida arquivo real do usuário com assinatura ELF/AppImage e tenta descobrir a fonte de atualização (GitHub Releases, GitLab Releases e Codeberg Releases).
3. Usa `flatpak run it.mijorus.gearlever --integrate <arquivo> -y`, conferindo a entrada criada em `--list-installed --json`.
4. Se a fonte é identificada e não há uma fonte anterior/embutida, usa `--set-update-source` com os argumentos próprios do provedor.
5. A pasta final e a opção de **remover o arquivo original** são configurações **do Gear Lever**, respeitadas pela integração; não fazemos `mv` manualmente nem modificamos o banco interno do programa.

Fontes desconhecidas não são adivinhadas: a AppImage pode ser integrada, mas sem gerenciador de atualização personalizado. A extensão **não executa a AppImage** após integrar. Entretanto, o Gear Lever pode extrair metadados do arquivo; confie apenas em downloads seguros.

## Instalação (Linux)

Requisitos: Python 3.10+, Gear Lever com CLI e `--list-installed --json` (recomendamos versão recente), navegador compatível, Bash.

```bash
git clone https://github.com/zonaro/gear-lever-grab.git
cd gear-lever-grab
bash install.sh
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
- Assets versionados recebem wildcard limitado ao número encontrado na tag de release; padrões especiais podem exigir ajuste manual no Gear Lever.
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
