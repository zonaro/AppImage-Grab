#!/usr/bin/env node
// Validate complete locale key coverage without external libraries.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'docs/index.html'), 'utf8');
const messages = fs.readFileSync(path.join(root, 'docs/assets/i18n.js'), 'utf8');
const context = { globalThis: {} };
vm.runInNewContext(messages, context, { timeout: 1000 });
const locales = context.globalThis.AIG_I18N;
const requiredLocales = ['pt-BR', 'en', 'es'];
const knownKeys = Object.keys(locales['pt-BR']).sort();
const errors = [];

for (const language of requiredLocales) {
  const strings = locales[language];
  if (!strings) {
    errors.push('Missing language: ' + language);
    continue;
  }
  const keys = Object.keys(strings).sort();
  const missing = knownKeys.filter(key => !keys.includes(key));
  const extra = keys.filter(key => !knownKeys.includes(key));
  if (missing.length) errors.push(language + ' missing keys: ' + missing.join(', '));
  if (extra.length) errors.push(language + ' extra keys: ' + extra.join(', '));
  for (const [key, val] of Object.entries(strings)) {
    if (typeof val !== 'string' || val.trim() === '') errors.push(language + '.' + key + ' is empty');
  }
}
const usage = /data-i18n(?:-aria)?="([^"]+)"/g;
for (const match of html.matchAll(usage)) {
  if (!knownKeys.includes(match[1])) errors.push('Untranslated HTML key: ' + match[1]);
}
for (const required of [
  'meta.title', 'meta.description', 'meta.ogDescription', 'install.copy',
  'install.copied', 'install.failed'
]) {
  if (!knownKeys.includes(required)) errors.push('Missing required key: ' + required);
}
for (const feature of ['id="install-command"', 'id="copy-command"', 'id="faq"', 'id="benefits"', 'id="how"']) {
  if (!html.includes(feature)) errors.push('Missing landing element: ' + feature);
}
const command = 'curl -fsSL https://raw.githubusercontent.com/zonaro/AppImage-Grab/main/install.sh | bash';
if (!html.includes(command)) errors.push('Installation command differs from documented one-liner.');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Landing OK: ' + knownKeys.length + ' translation keys × ' + requiredLocales.length + ' languages.');
