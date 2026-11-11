#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('extension/common/notifications.js', 'utf8');

async function scenario(mode, buttons = false) {
  const data = {};
  const attempts = [];
  const api = {
    runtime: {getURL: name => 'chrome-extension://test/' + name},
    storage: {local: {
      async get(keys) {
        const list = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(list.map(key => [key, data[key]]));
      },
      async set(patch) {Object.assign(data, patch);}
    }},
    notifications: {
      async getPermissionLevel() {return mode === 'denied' ? 'denied' : 'granted';},
      async create(id, options) {
        attempts.push({id, icon: options.iconUrl, buttons: Boolean(options.buttons)});
        if (mode === 'all-images-fail' ||
            (mode === 'bad-48' && options.iconUrl.endsWith('icon-48.png'))) {
          throw new Error('Unable to download all specified images.');
        }
        if (mode === 'buttons-unsupported' && options.buttons) throw new Error('Buttons unsupported');
        return id;
      },
      onShown: {addListener() {}}, onClicked: {addListener() {}},
      onButtonClicked: {addListener() {}}
    },
    tabs: {async create() {}}
  };
  const context = vm.createContext({browser: api, console: {warn() {}}, Date, Promise});
  context.globalThis = context;
  vm.runInContext(source, context, {filename: 'notifications.js'});
  const reply = await context.GLGNotifications.emit({kind: 'integrationSuccess',
    id: 'glg-test-event', title: 'Test', message: 'Test message',
    ...(buttons ? {buttons: [{title: 'View'}]} : {})});
  return {reply, attempts, history: data.notificationHistory};
}

let test = await scenario('normal');
assert.equal(test.reply.status, 'requested');
assert.equal(test.attempts.length, 1);
assert.match(test.attempts[0].icon, /icon-48\.png$/);

test = await scenario('bad-48', true);
assert.equal(test.reply.status, 'requested');
assert.equal(test.attempts.length, 2, 'retry only once with valid backup');
assert.match(test.attempts[1].icon, /icon-32\.png$/);
assert.equal(test.attempts[1].buttons, true, 'preserve supported buttons');
assert.equal(test.history[0].status, 'requested');

test = await scenario('buttons-unsupported', true);
assert.equal(test.reply.status, 'requested');
assert.equal(test.attempts.length, 2);
assert.equal(test.attempts[1].buttons, false);

test = await scenario('all-images-fail');
assert.equal(test.reply.status, 'error');
assert.equal(test.attempts.length, 2, 'do not loop indefinitely');
assert.equal(test.history[0].status, 'error');

test = await scenario('denied');
assert.equal(test.reply.status, 'blocked');
assert.equal(test.attempts.length, 0);
assert.equal(test.history[0].status, 'blocked');

console.log('Notification icon fallback, button fallback, and failure tests passed.');
