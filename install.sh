#!/usr/bin/env bash
# User-scoped setup. Browser security requires manual approval for unpacked extensions.
set -euo pipefail
# Quando executado por curl | bash, baixa temporariamente o repositório.
# Quando executado de um clone local, utiliza diretamente os arquivos locais.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$PWD/install.sh}")" && pwd)"
if [[ ! -f "$ROOT/bridge/host.py" || ! -f "$ROOT/scripts/build-extensions.sh" ]]; then
  command -v git >/dev/null || { echo 'git é obrigatório para instalação remota' >&2; exit 1; }
  TEMP_DIR="$(mktemp -d)"
  trap 'rm -rf -- "$TEMP_DIR"' EXIT
  git clone --quiet --depth 1 https://github.com/zonaro/gear-lever-grab.git "$TEMP_DIR/repository"
  bash "$TEMP_DIR/repository/install.sh"
  exit $?
fi
DEST="$HOME/.local/share/gear-lever-grab"
if [ -n "$(printenv XDG_DATA_HOME || :)" ]; then DEST="$(printenv XDG_DATA_HOME)/gear-lever-grab"; fi
BIN="$HOME/.local/bin/gear-lever-grab-host"
EXT_ID="$(tr -d '\n' < "$ROOT/extension/chromium/id.txt")"

command -v python3 >/dev/null || { echo 'python3 é obrigatório' >&2; exit 1; }
if ! command -v gearlever >/dev/null && ! flatpak info it.mijorus.gearlever >/dev/null 2>&1; then
  echo 'Aviso: Gear Lever não detectado. Instale-o antes de ativar a extensão.' >&2
fi
bash "$ROOT/scripts/build-extensions.sh"
mkdir -p "$DEST" "$(dirname "$BIN")"
cp -a "$ROOT/bridge" "$ROOT/scripts" "$ROOT/extension" "$ROOT/dist" "$DEST/"
cat > "$BIN" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$DEST"
exec python3 -m bridge.host
EOF
chmod 755 "$BIN"
python3 "$DEST/scripts/register_hosts.py" --host-path "$BIN" --extension-id "$EXT_ID"

cat <<EOF

Host nativo instalado; falta autorizar a extensão no navegador:
  Chrome/Chromium/Brave/Vivaldi/Edge/Opera: abra a página de extensões
  (chrome://extensions, edge://extensions etc.), ative Modo do desenvolvedor,
  escolha "Carregar sem compactação" e selecione:
    $DEST/dist/chromium

  Firefox: about:debugging > Este Firefox > Carregar extensão temporária:
    $DEST/dist/firefox/manifest.json
  Para instalação persistente no Firefox padrão, é necessária assinatura AMO.

Depois clique no ícone da extensão e ligue o toggle ON.
O Gear Lever determina a pasta de destino e se mantém o download original.
O instalador não altera políticas do navegador nem força extensão sem consentimento.
EOF
