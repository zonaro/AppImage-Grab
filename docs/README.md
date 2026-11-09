# Gear Lever Grab — landing page

Static GitHub Pages landing in \`/docs\`: pure HTML/CSS/JavaScript, no build step and no external services.

## Publish

In **Settings → Pages → Build and deployment** select **Deploy from a branch**, \`main\`, \`/docs\`, then save. This makes the landing available at:

**https://zonaro.github.io/gear-lever-grab/**

Pages is not enabled just by pushing \`/docs\`. GitHub repository settings require activation by a maintainer.

## Languages / i18n

- \`pt-BR\` is the default, readable HTML even if JavaScript is disabled.
- \`en\` and \`es\` are stored alongside Brazilian Portuguese in \`assets/i18n.js\`.
- Choose a language using PT/EN/ES at the top. The selection is persisted (if storage is available) and reflected in \`?lang=en\` or \`?lang=es\`; explicit URL parameter overrides the stored preference.
- Initial locale falls back to browser preference and then pt-BR. All visible marketing copy, aria-labels, page title and meta descriptions are translated.
- Canonical and hreflang links point to the project Pages domain.

This is client-rendered i18n; search engine indexing of alternate-language \`?lang=\` versions is not guaranteed. Consider generating static translated pages if organic search by locale becomes a major acquisition channel.

## Developing locally

\`\`\`bash
python3 -m http.server 8000 --directory docs
# Open http://localhost:8000/?lang=es
node scripts/check-docs.mjs
\`\`\`

The installer one-liner is copied directly from the project's root README. Do not claim installation of an unpacked extension is silent: browsers require manual authorization.

## Design

- Mobile-first responsive sections, semantic headings, links, native FAQ details and keyboard focus.
- CSS-only hero flow illustration (not an actual screenshot or live connection).
- No tracking, cookies or third-party fonts.
- A reduced-motion mode respects accessibility preferences.
