#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

const handlers = [];
const notifications = [];
const state = {enabled: false, pending: {}, processed: []};
let permission = 'granted';
let updates = [{path: '/home/test/AppImages/tool.AppImage', name: 'Tool', available_version: '2.0'}];
let updateFails = false;
let shown;
const local = {
  async get(keys) {
    const names = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(names.map(key => [key, state[key]]));
  },
  async set(values) {Object.assign(state, values);}
};
const api = {
  runtime: {
    id: 'test', getURL: path => 'chrome-extension://test/' + path,
    onMessage: {addListener: handler => handlers.push(handler)},
    onInstalled: {addListener() {}}, onStartup: {addListener() {}}
  },
  storage: {local, onChanged: {addListener() {}}},
  notifications: {
    async getPermissionLevel() {return permission;},
    async create(id, options) {notifications.push({id, options}); return id;},
    onShown: {addListener(callback) {shown = callback;}},
    onClicked: {addListener() {}}, onButtonClicked: {addListener() {}}
  },
  tabs: {async create() {}},
  downloads: {onCreated: {addListener() {}}, onChanged: {addListener() {}}},
  action: {async setBadgeText() {}, async setBadgeBackgroundColor() {}},
  alarms: {onAlarm: {addListener() {}}, async create() {}}
};
const host = {
  async request(request) {
    if (request.action === 'ping') return {ok: true};
    if (request.action === 'listInstalled') return {ok: true, apps: [
      {name: 'Tool', path: '/home/test/AppImages/tool.AppImage'}]};
    if (request.action === 'listUpdates') return {ok: true, apps: updates};
    if (request.action === 'updateApp') {
      if (updateFails) throw new Error('Update failed');
      return {ok: true, path: request.path, status: 'updated'};
    }
    throw new Error('Unexpected native action ' + request.action);
  }
};
const context = vm.createContext({browser: api, GLGNative: host,
  GLGUpdate: {async check() {}}, crypto: webcrypto, TextEncoder,
  console, Date, Set, Map, Object, Promise, String, Number, Boolean});
context.globalThis = context;
for (const path of ['extension/common/notifications.js', 'extension/common/background.js']) {
  vm.runInContext(readFileSync(path, 'utf8'), context, {filename: path});
}

async function send(action, extras = {}, validSender = true) {
  const sender = {id: validSender ? 'test' : 'foreign',
    url: 'chrome-extension://test/manager.html'};
  return new Promise((resolve, reject) => {
    for (const handler of handlers) {
      if (handler({action, ...extras}, sender, resolve) === true) return;
    }
    reject(new Error('No matching listener for ' + action));
  });
}
const flush = () => new Promise(resolve => setTimeout(resolve, 10));

assert.equal((await send('notificationDiagnostics')).host, 'ready');
let reply = await send('testNotification');
assert.equal(reply.status, 'requested');
assert.equal(notifications.length, 1);
assert.equal(state.notificationHistory[0].status, 'requested');
shown(notifications[0].id);
await flush();
assert.equal(state.notificationHistory[0].status, 'shown');

permission = 'denied';
reply = await send('testNotification');
assert.equal(reply.status, 'blocked');
assert.equal(notifications.length, 1);
permission = 'granted';

reply = await send('checkAppUpdates');
assert.equal(reply.count, 1);
assert.equal(notifications.length, 2);
assert.match(notifications[1].options.message, /Tool/);
await send('checkAppUpdates');
assert.equal(notifications.length, 2, 'persistent update alert deduplication');
updates = [{...updates[0], available_version: '2.1'}];
await send('checkAppUpdates');
assert.equal(notifications.length, 3, 'new confirmed version should notify');
assert.ok(state.notificationHistory.every(event => !event.message.includes('/home/test')));

state.notificationPreferences = {updatesAvailable: false};
reply = await send('checkAppUpdates');
assert.equal(reply.status, 'disabled');
assert.equal(notifications.length, 3);
state.notificationPreferences = {updatesAvailable: true, updatesCompleted: true, updatesError: true};

reply = await send('startAppUpdate', {
  path: '/home/test/AppImages/tool.AppImage', name: 'Tool', confirmed: true});
assert.equal(reply.status, 'updated');
assert.equal(notifications.length, 4);
assert.match(notifications[3].options.title, /atualizada/);
updateFails = true;
reply = await send('startAppUpdate', {
  path: '/home/test/AppImages/tool.AppImage', name: 'Tool', confirmed: true});
assert.equal(reply.ok, false);
assert.equal(notifications.length, 5);
assert.match(notifications[4].options.title, /Falha/);
await assert.rejects(send('startAppUpdate', {path: '/test', confirmed: true}, false));

console.log('Notification permissions, history, updates, and operation tests passed.');
