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

The unpacked extension's version is generated from the **Git commit timestamp**, not the installation time. Both browsers receive the same `YY.DDD.HHmm` timestamp-based release label (two-digit year, day of year, 24-hour time and minute), preserving the timezone recorded in the commit. For example, a commit at 03:52 on November 11, 2026 gives `26.315.0352`. Browser manifests cannot include leading zeros in nonzero numeric components, so the mandatory `version` is `26.315.352`; `version_name` preserves `26.315.0352` for browsers that display it. Leap years may use day 366. Two commits in the same minute share the same manifest version, but the SHA still changes and powers the Grab update checker. The manifests in `extension/` are build templates; **load the generated `dist/` extension**, not the templates. After running the installer, **reload the unpacked extension** in the browser to activate the latest scripts and version.

To avoid automatically opening the HTML guide, set `GLG_OPEN_BROWSER=0` in the environment used to run the installer.

## How AppImage integration works

When the extension's toggle is **ON**:

1. It observes completed downloads with a filename ending in `.AppImage`.
2. Native Messaging passes the local download path to the Python bridge. No permanent daemon is required.
3. The bridge calls **Gear Lever's public CLI** with `--integrate <downloaded-file> -y`.
4. **Gear Lever alone** determines whether the file is supported, where to install it, whether it is already integrated, and how to manage its updates. Grab forwards the CLI's success/failure result and records any error in **History**. It does not inspect AppImage magic bytes, ELF headers, MIME types, architectures or file contents; it does not compare the installed copy or register an automatic update source.

The bridge keeps only basic Native Messaging input-safety checks (absolute `.AppImage` path, user-owned regular file, no symlink) and deduplicates identical completed downloads. These checks are **not** AppImage format validation.

The extension **never executes downloaded AppImages itself**. Gear Lever may inspect or extract them when installing. A filename ending in `.AppImage` is not proof that a download is authentic: obtain applications from developers you trust.

The installed location is taken from Gear Lever's CLI output when present, for display only. No failure is fabricated when Gear Lever successfully integrates an AppImage but renames it or omits its destination in CLI output. An already-integrated result from Gear Lever does not trigger a second install or a success notification. Existing update sources remain entirely Gear Lever's responsibility; explicit source edits in the manager still use Gear Lever's CLI.

## Browser notifications and link-based installation

When the download integration completes and Gear Lever confirms the new installation, the extension issues an OS/browser **notification** using its icon. A failed download or failed integration never produces a success notification. Notification delivery depends on browser and desktop notification permissions.

The manager also provides a **Notifications** section, accessible from the popup. Its independent categories cover repository suggestions, successful integrations, integration errors, available AppImage updates, completed manual updates, and update errors. Preferences persist across browser restarts, preserve the previous repository-suggestion toggle, and do not change download automation. A small local history records notification attempts (up to 50) without full file paths or private links. A notification accepted by the browser API is **not proof** that GNOME or another desktop actually displayed it.

### Installation history and troubleshooting

Open **Manage in browser → History** to inspect a persistent, browser-local log of the last **200** installation/download/update operations. Each entry records the AppImage filename, phase (download/integration/update), current outcome, timestamp and the **actual error returned by the Native Messaging bridge / Gear Lever CLI**. The same download ID is updated as it progresses, preventing duplicate lines. Search by filename or error, filter failed/pending/successful operations, expand details, copy a diagnostic report, refresh or clear browser history. No remote server, telemetry, full local paths, private download URLs or secrets are stored in this activity history.

The History page can also display a **read-only, redacted tail of the Gear Lever Grab Native Messaging bridge's own `host.log`** (warnings and errors, up to 80 lines). This file already exists under `$XDG_STATE_HOME/gear-lever-grab/host.log` (or `~/.local/state/gear-lever-grab/host.log`). **It is not Gear Lever's internal log**. The host has no general file-browsing access and never exposes raw stack traces or arbitrary paths. Older installations are not retroactively added to browser history; the bridge log may contain older failed requests. Clearing browser history deliberately leaves the local service log intact.

If an installation fails, open **History**, filter **Errors**, expand its entry and inspect the CLI/host message. If the Native Messaging host cannot be reached, the browser history still records the failure. Existing installed apps are never changed by opening logs.

Use **Send test notification** to check desktop delivery without downloading anything. The diagnostics panel reports browser permission (where available), Native Messaging connectivity and recent update checks. If no alert appears, verify that the newest built `dist/chromium` or `dist/firefox` extension is loaded and reloaded, that browser notifications are permitted, and that the GNOME **Do Not Disturb** setting and browser application notifications are enabled. Errors may be recorded locally when the OS suppresses a toast.

AppImage update availability is checked on a conservative 12-hour browser alarm, independently of the Grab extension's own Git commit checks. Only exact paths confirmed by Gear Lever's `--list-updates --json` and `--list-installed --json` can trigger alerts; repeated results are deduplicated across restarts and offline errors never clear the last valid state. The notifications open the manager but **never install, download, or update an AppImage on click**. Manual updates continue to require confirmation and are run through the Gear Lever CLI.

The manager's **Add AppImage by link** field accepts direct GitHub, GitLab, and Codeberg release-asset links, plus GitHub, GitLab, and Codeberg repository/release pages. For a repository, it lists matching AppImage assets and their detected architecture; the user chooses which file to download and confirms the action. The browser downloads the chosen asset, and the Native Messaging bridge asks Gear Lever to integrate it after completion. This manual action works independently of the automatic download toggle. Trusted release providers are used to resolve links, but **download-source selection is not AppImage file validation**.

## Install suggestions while browsing

When you visit a **supported GitHub, GitLab, or Codeberg repository/release page**, the extension reads the tab URL (not the page contents), asks the existing Native Messaging resolver for AppImage release assets and, when a compatible asset is found, offers to install it.

- A browser desktop notification suggests installation. Click it or its **View and install** action to open the manager with that source already selected; it never downloads automatically.
- The extension popup shows an **Install in Gear Lever** button on compatible repository pages. If a release contains several AppImages, the popup lets you choose the exact filename and CPU architecture first.
- Each install starts on the user's explicit **Install** click, without an additional JavaScript confirmation dialog. The user still chooses an exact asset/architecture; the browser download and Native Messaging resolver confirm the selected release URL, while Gear Lever alone validates the file. Successful integration triggers the existing desktop notification.
- Passive repository suggestions can be disabled independently from download automation with **Suggest AppImages when visiting repositories** in the popup. Suggestions are on by default and each repository is notified **at most once per 24 hours**, even after browser restarts.
- The extension requests the WebExtensions `tabs` permission solely to inspect open tab URLs for supported provider/repository patterns. It does not read page content, forms, cookies, or private URLs, and it never tries to resolve arbitrary websites. Only the three known providers currently have release resolvers.
- No recommendation is shown when the provider has no AppImage release or the local bridge cannot verify a compatible release. A browser or desktop may suppress notifications; the popup remains available.

## Browser-based AppImage manager

The extension's popup includes the ON/OFF toggle, a quick view of installed AppImages and last activity. The **Manage in browser** screen opens a tab with search, installed versions, update sources, update checks, manual updates and removals. Only verified available updates are offered; confirmations are required before modifying installed apps or their sources. This is a browser frontend for the Gear Lever CLI, not a clone of the GTK implementation.

### Extension languages

The **entire browser extension** (popup, manager, store, installation actions, notifications, activity messages, and update prompts) supports **English, Brazilian Portuguese, and Spanish**. It detects the browser UI language automatically (for example `pt-BR`, `es-ES`, `es-MX`) and falls back to **English** for unsupported locales and missing translations. The extension does not add a separate language setting. Browser metadata uses standard WebExtension `_locales` bundles; the interface shares a dependency-free `extension/common/i18n.js` translator that also handles dynamically rendered messages. App names and remote catalog descriptions are shown as published by their authors.

To check localization and package coverage after building, run `node scripts/test-i18n.mjs`. The displayed popup version comes directly from the built manifest (including its commit timestamp), not a hard-coded version string.

### AppImage store

The manager also has a **Store** tab, with search, catalog/source and category filters, sorting, app cards, descriptions, screenshots, download choices and pagination. It combines two independent public sources:

- **AppImage Catalog / AppImagePool**: `https://appimage.github.io/feed.json`, the community feed also used by [AppImagePool](https://github.com/prateekmedia/appimagepool). Release links are passed to the existing Native Messaging provider resolver, which verifies the actual GitHub/GitLab/Codeberg release asset before the user can download it.
- **AppImageHub / OpenDesktop**: the OCS API at `https://api.opendesktop.org/ocs/v1/`. Only entries with an explicit `.AppImage` download filename are shown. When the file is hosted by the known Pling download service, the background script fetches the OCS item again and checks the exact filename and allowlisted URL before asking the browser to download it. Recognized GitHub/GitLab/Codeberg assets use the existing trusted resolver. Unsupported external hosting is linked to its catalog page instead of downloaded directly.

Catalog metadata is not a verification of authenticity. Every download requires an explicit file/architecture choice and a **Download and integrate** click (no second confirmation dialog); the browser saves the file and the Native Messaging bridge integrates it through **Gear Lever**, never by executing it. Short-lived Pling URLs are only fetched when downloading, not stored for later use. A Pling-hosted file generally has **no verifiable automatic update source**, so Gear Lever may integrate it without update configuration. The Store still works with the automatic ON/OFF toggle set to **OFF**. Both sources load independently; if one API is unavailable, the other remains usable. Store requests are cached in memory for approximately 15 minutes while the manager tab remains open.

Both browser manifests request the narrowly scoped `https://appimage.github.io/*` and `https://api.opendesktop.org/*` origins to read the catalogs, in addition to the existing GitHub API access. App icons/screenshots are displayed from the catalog's public image hosts; no page contents or browser history are transmitted to the stores. Store API search terms are sent to OpenDesktop when using its catalog.

## Update status and existing Gear Lever source settings

**An update source does not mean a new version is available.** The browser manager now shows an **Update** action only after running Gear Lever's public `--list-updates --json` command and finding the exact installed AppImage path in its results. No update is assumed solely from a configured GitHub/GitLab/Codeberg/FTP manager. The Python bridge **rechecks** the current list immediately before executing an update; if Gear Lever no longer confirms availability, no update is started. An offline/error result does not display stale updates.

Gear Lever's public `--list-installed --json` reports the source manager and whether it is embedded, but **does not include the source configuration fields**. For existing manually configured sources, Grab reads the same `gearlever.conf` used by the selected Gear Lever variant, **read-only**:

- Flatpak Gear Lever: `~/.var/app/it.mijorus.gearlever/config/gearlever.conf`.
- Native Gear Lever: `$XDG_CONFIG_HOME/gearlever.conf` (defaults to `~/.config/gearlever.conf`).

The adapter uses Gear Lever's existing per-AppImage configuration key (`app.<md5-of-installed-file-path>.update_manager`). It displays source settings such as repository, filename pattern, pre-release preference and custom URL without changing the config. These settings are re-read when refreshing the browser manager.

If the source is **embedded**, Grab displays that fact but keeps it read-only. If a custom source is configured but its details **cannot be verified** (missing/unreadable INI, mismatched manager, or an unsupported/custom provider), Grab shows a warning or read-only details instead of inserting fake defaults or silently overwriting the user's existing settings. Existing configuration changes still use **Gear Lever's own CLI**, never direct writes to its config.

This read-only compatibility layer depends on Gear Lever's current INI layout. If a later Gear Lever release introduces an official JSON source-details CLI, that API should replace the INI reader.

## Development and tests

```bash
git clone https://github.com/zonaro/gear-lever-grab.git
cd gear-lever-grab
bash scripts/build-extensions.sh
python3 -m unittest discover -s tests -v
node scripts/test-update-check.mjs
node scripts/test-notifications.mjs
node scripts/test-notification-ui.mjs
node scripts/test-integration-notifications.mjs
node scripts/test-page-offers.mjs
node scripts/test-i18n.mjs
node scripts/test-store.mjs
node scripts/test-manager-ui.mjs
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
- Automatic integration intentionally never injects a custom update source; Gear Lever owns updates and any existing embedded source. Users can manage supported sources explicitly in the manager.
- Real-world QA on all supported browsers and Fedora configurations is ongoing; please see the [issue tracker](https://github.com/zonaro/gear-lever-grab/issues).

## Uninstall

```bash
bash "$HOME/.local/share/gear-lever-grab/uninstall.sh"
```

If `XDG_DATA_HOME` is customized, use that location instead. Uninstall the browser extension from the browser's own management page. Already integrated AppImages remain managed by Gear Lever. Signing keys left from older releases are not removed automatically.

## License

See [LICENSE](LICENSE). Gear Lever Grab is an independent open-source project and is not officially affiliated with Gear Lever.
