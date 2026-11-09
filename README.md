# Gear Lever Grab

**Download an AppImage in your browser. Let Gear Lever take care of the rest.**

Gear Lever Grab is a Linux browser extension and a small Python Native Messaging bridge. When enabled, it watches for completed HTTPS AppImage downloads, integrates them through **Gear Lever's public CLI**, and attempts to register a trustworthy update source. Gear Lever remains responsible for app storage and updates.

[Project website](https://zonaro.github.io/gear-lever-grab/) · [GitHub issues](https://github.com/zonaro/gear-lever-grab/issues) · [Architecture](.agents/architecture.md)

## Install with one command

Prerequisites: Linux, Python 3.10+, Git, curl, and a recent Gear Lever installation with `--list-installed --json` support.

```bash
curl -fsSL https://raw.githubusercontent.com/zonaro/gear-lever-grab/main/install.sh | bash
```

You can [review the installer](install.sh) before running it. The installer is **user-scoped**: it does not require `sudo`, change your browser preferences, or apply enterprise policies.

**What it installs**

- The Python bridge under `~/.local/share/gear-lever-grab/` (or `$XDG_DATA_HOME/gear-lever-grab`).
- The native host launcher at `~/.local/bin/gear-lever-grab-host`.
- Native Messaging manifests for detected Chrome, Chromium, Edge, Brave, Vivaldi, Opera, Thorium, Firefox, Floorp, and Waterfox installations.
- A Firefox `.xpi` archive for temporary testing.
- When a compatible Chromium-based browser can create one, a locally signed **CRX3** `.crx` package.
- Unpacked extension files as a fallback when browser policies reject a local package.

After installation, the script prints the detected browsers, extension URLs, and exact paths. In an interactive graphical terminal, it attempts to open the **default installed browser's** extension management page automatically. Set `GLG_OPEN_BROWSER=0` to skip that step.

**Browser installation still needs your approval.** Local `.crx`/`.xpi` packaging is not permission to silently modify browser profiles. The installer does not secretly inject, activate, force-install, or bypass browser safeguards.

### Chromium family: Chrome, Edge, Brave, Chromium, Vivaldi, Opera, Thorium

Open the relevant extension management page: `chrome://extensions`, `edge://extensions`, `brave://extensions`, or the corresponding URL for your browser.

If packaging succeeded, a CRX3 file is available at:

```text
~/.local/share/gear-lever-grab/dist/packages/gear-lever-grab.crx
```

On **Linux browsers that permit local CRX installation**, drag this package into the extensions page and explicitly approve the browser's install prompt. Some Chrome/Chromium derivatives or policies reject locally signed CRX packages. This is expected; use the supported developer-mode fallback:

1. Enable **Developer mode** on the extensions page.
2. Click **Load unpacked** (or the equivalent option).
3. Select the directory `~/.local/share/gear-lever-grab/dist/chromium` (or your `$XDG_DATA_HOME` equivalent).
4. Enable the extension in the browser if it was added in a disabled state. Then open its popup and set **ON** only when you want automation.

This fallback loads an unpacked directory because a rejected CRX cannot be converted into a silently installed extension.

### Firefox, Floorp, Waterfox

The installer creates an **unsigned** package:

```text
~/.local/share/gear-lever-grab/dist/packages/gear-lever-grab.xpi
```

For temporary development use, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select the `.xpi` package (or `dist/firefox/manifest.json` if the browser rejects the package). Unsigned temporary add-ons are removed when Firefox restarts. **Permanent Firefox installation requires Mozilla AMO signing**; the generated XPI is not a signed store release.

### What about automatic extension installation?

Our installer detects browsers and registers the native host automatically, but **ordinary user-scoped scripts cannot consistently pre-install local extensions across these browsers while preserving user consent**. Extension stores and managed enterprise deployment have different requirements. We intentionally do **not** write directly to browser profile databases, tamper with `Preferences`, inject policies, or use forced extension deployment. When browsers reject the packaged extension, the installer prints the exact manual fallback steps.

### CRX signing identity and Native Messaging

A CRX needs a cryptographic signing key; merely renaming a ZIP to `.crx` is not valid. For local builds, the script asks an installed Chromium-based browser to pack a **real CRX3**, generating a private key the first time and reusing it for subsequent packages. The key remains only on your computer:

```text
~/.local/share/gear-lever-grab-keys/chromium.pem
```

**Back up this file securely if you intend to keep using that CRX identity. Never commit or share it.** A locally generated CRX ID may differ from the existing unpacked extension ID. The installer registers **both** in the Native Messaging allowlist. A future publicly distributed/store-signed version will need one maintained publisher signing identity.

If no compatible browser packer is available, packaging fails, or CRX installation is blocked, the unpacked directory remains usable. The XPI is always generated as long as its source files are present.

## How it works

With its **ON/OFF toggle**, the extension never changes normal browser downloads. When ON and an AppImage download completes:

1. The extension sends the local path and download URL to the user-scoped Python host via Native Messaging.
2. The host checks for a regular user-owned AppImage file and an HTTPS download.
3. It identifies direct GitHub, GitLab, or Codeberg release assets when possible.
4. It converts a versioned filename such as `App-2.6.1-x86_64.AppImage` into a source pattern like `App-*-x86_64.AppImage`. Architecture and product edition are preserved; ambiguous patterns are checked against the release's actual asset list before registration.
5. The host calls Gear Lever's `--integrate` command. **Gear Lever decides the destination folder** and whether to move or keep the downloaded file.
6. If a verified source exists and Gear Lever did not discover an existing or embedded source, it uses `--set-update-source`. Otherwise the app is integrated without making up an update source.

The bridge does not launch the downloaded AppImage, although Gear Lever may inspect or extract its metadata during integration. **A valid AppImage header is not proof of publisher authenticity.** Download from sources you trust.

## Manage AppImages from the browser

The extension popup shows its ON/OFF toggle, recent activity, and a compact list of installed AppImages. **Manage in browser** opens a larger tab-based UI with search, installed app versions, update source information, available updates, update/remove actions, and source editing.

All management requests go through the **Gear Lever CLI**, not a separate app database. Updates and removals require explicit confirmation. Removal uses Gear Lever's default Trash behavior rather than permanent deletion. The browser UI is inspired by Gear Lever's workflow, not a pixel-perfect clone of its GTK interface.

## Updating

Re-run the installation one-liner to refresh the Python bridge and local extension files. Then reload an unpacked extension from your browser's extension page. Locally packaged CRX/XPI files do **not** provide automatic store-style extension updates; reinstall them with user approval when needed.

## Local development and tests

```bash
git clone https://github.com/zonaro/gear-lever-grab.git
cd gear-lever-grab
bash scripts/build-extensions.sh
python3 scripts/package_extensions.py --root . --skip-crx  # unsigned Firefox XPI
python3 -m unittest discover -s tests -v
node --check extension/common/background.js
node --check extension/common/manager.js
bash -n install.sh uninstall.sh scripts/build-extensions.sh
```

To try a CRX3 package using a compatible installed browser, run:

```bash
python3 scripts/package_extensions.py --root . --key-dir "$HOME/.local/share/gear-lever-grab-keys"
```

Generated extension packages are written to `dist/packages/` and excluded from Git. **Do not place a private signing key in the repository or a web-accessible directory.**

## Current limitations

- Browser-specific installation restrictions require manual extension approval.
- Firefox XPI is unsigned: persistent distribution requires AMO signing.
- Chrome-derived CRX support depends on the browser and its packaging/install policy.
- Some sandboxed browsers (for example Flatpak) need additional Native Messaging integration.
- CDN redirects can hide the original release URL; uncertain sources are not registered.
- API rate limits and ambiguous release asset names may prevent automatic source registration.
- Real-world browser/Flatpak compatibility testing is still in progress; see [issues](https://github.com/zonaro/gear-lever-grab/issues).

## Uninstall

Once installed, run:

```bash
bash "$HOME/.local/share/gear-lever-grab/uninstall.sh"
```

Remove the browser extension using the browser's own interface. Already integrated AppImages remain managed by Gear Lever. The uninstall script **preserves** the local CRX signing key in `~/.local/share/gear-lever-grab-keys/` to prevent accidental loss of its signing identity.

## License

See [LICENSE](LICENSE). Gear Lever Grab is an independent open-source project, not an official component of Gear Lever.
