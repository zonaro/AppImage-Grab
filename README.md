# Gear Lever Grab

**Download an AppImage in your browser. Let Gear Lever take care of the rest.**

Gear Lever Grab is a Linux browser extension with a small Python Native Messaging bridge. When you enable it, the extension detects completed HTTPS AppImage downloads and integrates them into **Gear Lever**. For recognized GitHub, GitLab, and Codeberg release assets, it attempts to configure the correct update source while preserving the AppImage's architecture and edition.

[Website](https://zonaro.github.io/gear-lever-grab/) · [Issues](https://github.com/zonaro/gear-lever-grab/issues) · [Architecture](.agents/architecture.md)

## Install and update in one command

Requirements: Linux, Python 3.10+, Git, curl, and Gear Lever (recent enough to support `--list-installed --json`).

```bash
curl -fsSL https://raw.githubusercontent.com/zonaro/gear-lever-grab/main/install.sh | bash
```

This same command **installs or updates** the Python Native Messaging bridge and the unpacked browser extension files to the latest commit on `main`. The full Git commit SHA is the installed revision. You can [inspect the installer](install.sh) before running it. No root privileges or changes to managed browser policies are required.

The script:

- Detects locally installed browsers and registers their Native Messaging host manifest (when supported).
- Builds **unpacked browser extension directories only**, including the correct commit stamp.
- Installs the Chromium-family extension at `$XDG_DATA_HOME/gear-lever-grab/dist/chromium` (defaults to `~/.local/share/gear-lever-grab/dist/chromium`).
- Installs the Firefox extension at `$XDG_DATA_HOME/gear-lever-grab/dist/firefox`.
- Installs or updates the Python bridge at `$XDG_DATA_HOME/gear-lever-grab/bridge` and its launcher at `~/.local/bin/gear-lever-grab-host`.
- Generates a **standalone local HTML installation guide** at `$XDG_DATA_HOME/gear-lever-grab/install-guide.html`, with absolute paths that match this computer, detected browsers, extension-page links, copy buttons, and PT-BR/EN/ES instructions.
- Attempts to open the guide in the default web browser after installation. The exact path is also printed in the terminal in case it cannot be opened automatically.
- Removes obsolete local package artifacts from older Grab installations; previous signing keys, if present, are deliberately preserved rather than deleted.

**No CRX or XPI packages are generated, and browser extensions are never silently injected or activated.** The browser installation step is yours to complete. The extension's download automation remains **OFF until you turn it ON**, even after the installer is updated.

## Load the extension into your browser

After running the installer, follow the HTML guide that opens automatically. You can reopen it at any time:

```text
~/.local/share/gear-lever-grab/install-guide.html
```

The guide lists your detected browsers, their extension-page addresses, and the **real absolute filesystem path** of the appropriate extension. You can copy these using the buttons in the guide. Browsers may block navigation to internal pages (such as `edge://extensions`) from a local HTML file. If the direct link doesn't work, copy its address and paste it into the browser address bar.

### Edge, Chrome, Brave, Chromium, Vivaldi, Opera, and Thorium

1. Open the relevant extension management page, such as `edge://extensions`, `chrome://extensions` or `brave://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the directory indicated in the guide. By default it is `~/.local/share/gear-lever-grab/dist/chromium`. **Select the directory**, not `manifest.json`.
5. If necessary, enable the extension in the browser. Open its popup and turn **ON** only if you want automatic AppImage integration.

### Firefox, Floorp, and Waterfox

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on**.
3. Select the actual `dist/firefox/manifest.json` file shown by the guide.
4. Open the extension popup and optionally enable its ON/OFF toggle.

**Unsigned Firefox add-ons are temporary.** They must be loaded again after a browser restart. Permanent installation requires an appropriately signed extension published through Mozilla's supported distribution process.

### What happens on update?

Run the same one-liner. The bridge and unpacked extension folders are refreshed from the latest main commit. The installer regenerates the local guide and opens it again (when graphical). **Reload the extension from your browser's extensions page** so the new JavaScript is activated. Previously saved ON/OFF settings remain in browser storage.

The extension itself checks GitHub's latest main SHA periodically, and shows a **NEW** badge and an update command when your installed extension/bridge is behind. This check does **not** execute any remote code automatically.

To avoid automatically opening the HTML guide, set `GLG_OPEN_BROWSER=0` in the environment used to run the installer.

## How AppImage integration works

When the extension's toggle is **ON**:

1. It observes completed HTTPS downloads ending in `.AppImage`.
2. Native Messaging sends the filename and download URL to the local Python bridge. No permanent background daemon is required.
3. The bridge validates the file and tries to identify a GitHub, GitLab or Codeberg release asset.
4. The asset's version is replaced by a wildcard while retaining the architecture and product edition, for example `App-v2.6.1-x86_64.AppImage` → `App-*-x86_64.AppImage`. Ambiguous wildcard patterns are verified against the release assets; if a reliable source cannot be identified, no custom update source is registered.
5. The bridge invokes the **Gear Lever CLI** to integrate the file and, when safe, register its update source. Gear Lever determines the integration destination and manages future updates.

The extension **does not run downloaded AppImages directly**, but Gear Lever may inspect their contents. File-format checks do not verify software authenticity: download only from sources you trust.

## Browser-based AppImage manager

The extension's popup includes the ON/OFF toggle, a quick view of installed AppImages and last activity. The **Manage in browser** screen opens a tab with search, installed versions, update sources, update checks, manual updates and removals. Confirmations are required before modifying installed apps or their sources. This is a browser frontend for the Gear Lever CLI, not a clone of the GTK implementation.

## Development and tests

```bash
git clone https://github.com/zonaro/gear-lever-grab.git
cd gear-lever-grab
bash scripts/build-extensions.sh
python3 -m unittest discover -s tests -v
node scripts/test-update-check.mjs
node scripts/check-docs.mjs
bash -n install.sh uninstall.sh scripts/build-extensions.sh
```

Both extension builds are always directories in `dist/chromium` and `dist/firefox`. To test the guide generator using those builds:

```bash
python3 scripts/generate_install_guide.py \
  --output /tmp/gear-lever-grab-guide.html \
  --chromium dist/chromium \
  --firefox-manifest dist/firefox/manifest.json \
  --commit "$(git rev-parse HEAD)"
```

The generated HTML is a local, self-contained file. The guide uses no external assets or telemetry. It does not install or activate browser extensions.

## Limitations

- Browsers require the user's explicit approval for manually loaded extensions.
- Firefox temporary unsigned extensions do not survive a browser restart.
- Some browsers distributed inside Flatpak sandboxes need extra Native Messaging configuration.
- If redirects obscure a release URL or the release's asset names are ambiguous, Gear Lever Grab may integrate the AppImage without a custom update source.
- Real-world QA on all supported browsers and Fedora configurations is ongoing; please see the [issue tracker](https://github.com/zonaro/gear-lever-grab/issues).

## Uninstall

```bash
bash "$HOME/.local/share/gear-lever-grab/uninstall.sh"
```

If `XDG_DATA_HOME` is customized, use that location instead. Uninstall the browser extension from the browser's own management page. Already integrated AppImages remain managed by Gear Lever. Signing keys left from older releases are not removed automatically.

## License

See [LICENSE](LICENSE). Gear Lever Grab is an independent open-source project and is not officially affiliated with Gear Lever.
