# Landing page (/docs)

Stack: HTML5 + CSS + vanilla JavaScript. GitHub Pages can publish this folder directly without a build process.

Goals: clear value proposition, conversion to install with a copyable one-liner, trustworthy explanation of manual browser authorization, open-source positioning, Linux browser support, and differences between Grab and Gear Lever.

Content constraints:
- Grab integrates browser AppImage downloads into Gear Lever when enabled, with update-source association only when a suitable release source is identified.
- Gear Lever, not Grab, performs subsequent update checks/installations and decides the AppImage storage folder / file movement behavior.
- Browser extension approval remains manual; Firefox unsigned versions are temporary.
- The UI illustration is explicitly labeled as illustrative; no fabricated user reviews, metrics, or endorsements.
- All user-facing content must be translated into pt-BR, en, es using docs/assets/i18n.js. Keep translations synchronized with data-i18n keys.

Public site after Pages is enabled: https://zonaro.github.io/AppImage-Grab/
Publish source: main /docs. Landing CI: .github/workflows/landing.yml.

Validate: node --check docs/assets/main.js; node --check docs/assets/i18n.js; node scripts/check-docs.mjs.
