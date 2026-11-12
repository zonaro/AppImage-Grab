#!/usr/bin/env node
// Regression test for manager UI without a DOM library or network dependency.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class FakeElement {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.handlers = {};
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this.title = '';
    this.dataset = {};
    this.classList = { toggle() {} };
    this.firstChild = { textContent: '' };
  }
  addEventListener(name, callback) { this.handlers[name] = callback; }
  setAttribute(name, value) { this[name] = value; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

const code = fs.readFileSync('extension/common/manager.js', 'utf8');
const names = [...new Set([...code.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]))];
const elements = Object.fromEntries(names.map(name => [name, new FakeElement()]));
const app = {
  name: 'MyApp',
  path: '/home/test/MyApp-x86_64.AppImage',
  manager: 'GithubUpdater',
  current_version: '1.2',
  running: false,
  embedded_source: false,
  source_status: 'loaded',
  source_options: {
    repo: 'publisher/myapp',
    repo_filename: 'MyApp-*-x86_64.AppImage',
    allow_prereleases: 'true'
  }
};
let updates = [];
const called = [];
const sandbox = {
  document: {
    getElementById(id) { assert.ok(elements[id], 'missing fake node ' + id); return elements[id]; },
    createElement(tag) { return new FakeElement(tag); },
  },
  window: {confirm() {return true;},prompt() {}},
  navigator: {clipboard: {async writeText() {}}},
  console,
  GLGNative: {
    async request(req) {
      called.push(req);
      if (req.action === 'listInstalled') return {ok: true, apps: [app]};
      if (req.action === 'listUpdates') return {ok: true, apps: updates};
      if (req.action === 'resolveLink') return {ok: true, choices: [
        {name: 'MyApp-x86_64.AppImage', source: 'GitHub',
         url: 'https://github.com/publisher/myapp/releases/download/v1/MyApp-x86_64.AppImage',
         architecture: 'x86_64'}]};
      if (req.action === 'updateApp') return {ok: true};
      throw Error('Unexpected native action: ' + req.action);
    }
  },
  GLGUpdate: {COMMAND: 'test command', async check() {}},
  browser: {
    runtime: {async sendMessage(message) {
      called.push(message);
      return {ok: true, name: 'MyApp-x86_64.AppImage'};
    }},
    storage: {
      local: {async get() {return {};}, async set() {}},
      onChanged: {addListener() {}}
    }
  }
};
const context = vm.createContext(sandbox);
vm.runInContext(code, context);

function descendants(element) {
  return [element, ...element.children.flatMap(descendants)];
}
function labels() {
  return descendants(elements.apps).filter(n => n.tag === 'button').map(n => n.textContent);
}
async function flush() {await new Promise(resolve => setImmediate(resolve));}

await flush();
assert.equal(labels().includes('Atualizar'), false,
  'configured GithubUpdater does not prove a new update');
assert.equal(elements['total-count'].textContent, '1');
assert.equal(elements['sources-count'].textContent, '1');

await vm.runInContext('checkUpdates()', context);
assert.equal(labels().includes('Atualizar'), false,
  'empty Gear Lever --list-updates must show no Update button');
assert.equal(elements['updates-count'].textContent, '0');

updates = [{path: app.path, name: app.name}];
await vm.runInContext('checkUpdates()', context);
assert.equal(labels().includes('Atualizar'), true,
  'only a confirmed CLI update should show the button');
assert.equal(elements['updates-count'].textContent, '1');

vm.runInContext('editSource(state.apps[0])', context);
assert.equal(elements['source-repo'].value, 'publisher/myapp');
assert.equal(elements['source-pattern'].value, 'MyApp-*-x86_64.AppImage');
assert.equal(elements['source-prerelease'].checked, true);
assert.equal(elements['save-source'].hidden, false);
assert.equal(elements['source-dialog'].open, true);

vm.runInContext('state.apps[0].source_status = "unavailable"; editSource(state.apps[0])', context);
assert.equal(elements['save-source'].hidden, true,
  'missing existing settings must never cause a prefilled empty overwrite');
assert.equal(elements['source-manager'].disabled, true);
assert.equal(elements['source-warning'].hidden, false);
assert.equal(elements['unset-source'].hidden, true);

// A deliberate click on Download/Install must not open a second confirm dialog.
sandbox.window.confirm = () => {throw new Error('Unexpected installation confirmation');};
elements['link-url'].value = 'https://github.com/publisher/myapp/releases/latest';
await elements['link-form'].handlers.submit({preventDefault() {}});
assert.equal(elements['link-choices'].hidden, false);
elements['link-asset'].value = '0';
await elements['link-download'].handlers.click();
assert.ok(called.some(request => request.action === 'startManagedDownload' &&
  request.assetUrl.includes('/MyApp-x86_64.AppImage')));
assert.match(elements['link-feedback'].textContent, /Download iniciado/);

console.log('Browser manager regression tests passed.');
