#!/usr/bin/env node
// Localization smoke tests: locale precedence, templates, DOM, and packaged manifests.
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('extension/common/i18n.js', 'utf8');
function createContext(uiLanguage, navigatorLanguage = 'en-US', document = undefined) {
  const context = {navigator: {language: navigatorLanguage},
    browser: {i18n: {getUILanguage: () => uiLanguage}}, document};
  context.globalThis = context;
  vm.runInNewContext(source, context, {filename: 'i18n.js'});
  return context.GLGI18n;
}

const english = createContext('fr-FR', 'pt-BR');
assert.equal(english.language, 'en', 'unsupported browser UI locale falls back to English');
assert.equal(english.translate('Loja de AppImages'), 'AppImage Store');
assert.equal(english.translate('Notificações e diagnóstico'), 'Notifications and diagnostics');
assert.equal(english.translate('AppImage atualizada'), 'AppImage updated');
assert.equal(english.translate('7 aplicativo(s) integrados ao Gear Lever'), '7 apps integrated with Gear Lever');
assert.equal(english.translate('Versão: 1.2.3 • Fonte: GitHub'), 'Version: 1.2.3 • Source: GitHub');
assert.equal(english.translate('Download iniciado: Tool.AppImage. Uma notificação confirmará quando o Gear Lever concluir a integração.'),
  'Download started: Tool.AppImage. A notification will confirm when Gear Lever completes integration.');

const portuguese = createContext('pt-PT', 'es-ES');
assert.equal(portuguese.language, 'pt_BR');
assert.equal(portuguese.locale, 'pt-BR');
assert.equal(portuguese.translate('Check again'), 'Verificar novamente');
assert.equal(portuguese.translate('O Gear Lever permanece no controle.'), 'O Gear Lever permanece no controle.');
const spanish = createContext('es-MX', 'en-US');
assert.equal(spanish.language, 'es');
assert.equal(spanish.translate('Loja de AppImages'), 'Tienda de AppImages');
assert.equal(spanish.translate('Nova versão'), 'Nueva versión');
assert.equal(spanish.translate('Integração parcial da AppImage'), 'Integración parcial de AppImage');
assert.equal(spanish.translate('Teste de notificação Gear Lever Grab'), 'Prueba de notificación de Gear Lever Grab');
assert.equal(spanish.translate('3 AppImages disponíveis neste repositório.'), '3 AppImages disponibles en este repositorio.');
assert.equal(spanish.translate('Baixar "App.AppImage" de GitHub e adicionar ao Gear Lever? Confirme que você confia nesta origem.'),
  '¿Descargar «App.AppImage» de GitHub y añadirla a Gear Lever? Confirma que confías en esta fuente.');
assert.equal(spanish.translate('Copy update command'), 'Copiar comando de actualización');
assert.equal(spanish.translate('There is no translation for this unknown text'), 'There is no translation for this unknown text');

// A hostile catalog name must always remain plain text, never be interpreted as markup.
assert.match(spanish.translate('Ícone de <script>alert(1)</script>'), /<script>alert\(1\)<\/script>/);

let mutationCallback;
class Element {
  constructor(tag, attributes = {}, nodes = []) {
    this.nodeType = 1; this.tagName = tag; this.attributes = attributes; this.childNodes = nodes;
  }
  hasAttribute(key) {return key in this.attributes;}
  getAttribute(key) {return this.attributes[key];}
  setAttribute(key, value) {this.attributes[key] = value;}
}
class TextNode {
  constructor(value) {this.nodeType = 3; this.nodeValue = value;}
}
const header = new TextNode('Loja de AppImages');
const button = new Element('BUTTON', {'aria-label': 'Atualizar lista'}, [header]);
const html = new Element('HTML', {}, [button]);
const document = {nodeType: 9, readyState: 'complete', childNodes: [html], documentElement: html};
const domContext = {document, navigator: {language: 'es-ES'},
  MutationObserver: class {constructor(callback) {mutationCallback = callback;} observe() {}},
  browser: {i18n: {getUILanguage: () => 'es-ES'}}};
domContext.globalThis = domContext;
vm.runInNewContext(source, domContext);
assert.equal(document.documentElement.lang, 'es');
assert.equal(header.nodeValue, 'Tienda de AppImages');
assert.equal(button.attributes['aria-label'], 'Actualizar lista');
const notice = new TextNode('Aplicativos carregados.');
button.childNodes.push(notice);
mutationCallback([{type: 'childList', addedNodes: [notice]}]);
assert.equal(notice.nodeValue, 'Aplicaciones cargadas.');

for (const target of ['chromium', 'firefox']) {
  const manifest = JSON.parse(readFileSync('extension/' + target + '/manifest.json', 'utf8'));
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.name, '__MSG_extensionName__');
  assert.equal(manifest.description, '__MSG_extensionDescription__');
  for (const locale of ['en', 'pt_BR', 'es']) {
    const path = 'extension/common/_locales/' + locale + '/messages.json';
    const messages = JSON.parse(readFileSync(path, 'utf8'));
    assert.ok(messages.extensionName.message);
    assert.ok(messages.extensionDescription.message);
    assert.ok(existsSync('dist/' + target + '/_locales/' + locale + '/messages.json'),
      'build should package ' + target + ' ' + locale);
  }
}
for (const page of ['popup', 'manager']) {
  const htmlText = readFileSync('extension/common/' + page + '.html', 'utf8');
  assert.match(htmlText, /<script defer src="i18n\.js"><\/script>/);
}
for (const target of ['chromium', 'firefox']) {
  assert.ok(existsSync('dist/' + target + '/i18n.js'));
}

console.log('Extension i18n and locale packaging tests passed.');
