#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

class Element {
  constructor(tag = 'div') {
    this.tag = tag; this.handlers = {}; this.children = [];
    this.textContent = ''; this.disabled = false; this.checked = true;
    this.dataset = {}; this.className = '';
  }
  addEventListener(type, handler) {this.handlers[type] = handler;}
  replaceChildren(...children) {this.children = [...children];}
  append(...children) {this.children.push(...children);}
}
const ids = ['notification-feedback', 'notification-history', 'notification-diagnostics',
  'notification-test', 'notification-check-updates', 'notification-clear-history'];
const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
const keys = ['suggestions', 'integrationSuccess', 'integrationError',
  'updatesAvailable', 'updatesCompleted', 'updatesError'];
const inputs = keys.map(key => {
  const input = new Element('input');
  input.dataset.notification = key;
  return input;
});
const state = {notificationPreferences: {suggestions: true}};
const requests = [];
const browser = {
  storage: {local: {
    async get(names) {
      const list = Array.isArray(names) ? names : [names];
      return Object.fromEntries(list.map(name => [name, state[name]]));
    },
    async set(values) {Object.assign(state, values);}
  }},
  runtime: {async sendMessage(message) {
    requests.push(message.action);
    if (message.action === 'notificationDiagnostics') return {
      ok: true, permission: 'granted', host: 'ready', preferences: {
        suggestions: state.notificationPreferences?.suggestions !== false,
        integrationSuccess: true, integrationError: true, updatesAvailable: true,
        updatesCompleted: true, updatesError: true
      }, history: state.notificationHistory || [], buildCommit: 'a'.repeat(40)};
    if (message.action === 'testNotification') return {ok: true, status: 'requested'};
    if (message.action === 'checkAppUpdates') return {ok: true, status: 'success', count: 2};
    throw Error('Unexpected message');
  }}
};
const document = {
  getElementById(id) {return elements[id];},
  querySelectorAll() {return inputs;},
  createElement(tag) {return new Element(tag);}
};
const context = vm.createContext({browser, document, console, Date, Number,
  AIGI18n: {locale: 'pt-BR', translate: value => value}});
context.globalThis = context;
vm.runInContext(readFileSync('extension/common/notification-settings.js', 'utf8'), context);
const ui = context.AIGNotificationUI;
const flush = () => new Promise(resolve => setTimeout(resolve, 10));

ui.activate();
await flush();
assert.equal(elements['notification-history'].children.length, 1, 'empty history state');
assert.equal(inputs[0].checked, true);
inputs[0].checked = false;
await inputs[0].handlers.change();
assert.equal(state.notificationPreferences.suggestions, false);
assert.equal(state.suggestionsEnabled, false, 'legacy popup setting stays in sync');
await elements['notification-test'].handlers.click();
assert.ok(requests.includes('testNotification'));
assert.match(elements['notification-feedback'].textContent, /Aviso solicitado/);
await elements['notification-check-updates'].handlers.click();
assert.ok(requests.includes('checkAppUpdates'));
await elements['notification-clear-history'].handlers.click();
assert.equal(state.notificationHistory.length, 0);

const html = readFileSync('extension/common/manager.html', 'utf8');
for (const key of keys) assert.match(html, new RegExp('data-notification="' + key + '"'));
assert.match(html, /src="notification-settings\.js"/);
console.log('Notification manager settings and diagnostics UI tests passed.');
