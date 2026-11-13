#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('extension/common/native-client.js', 'utf8');
let integrationBackend = 'gearlever';
const posted = [];
const browser = {
  storage:{local:{async get(key) {
    assert.equal(key, 'integrationBackend');
    return {integrationBackend};
  }}},
  runtime:{
    connectNative(name) {
      assert.equal(name, 'br.com.redclaw.appimage_grab');
      let onMessage, onDisconnect;
      return {
        onMessage: {addListener(callback) {onMessage = callback;}},
        onDisconnect: {addListener(callback) {onDisconnect = callback;}},
        postMessage(request) {
          posted.push(request);
          queueMicrotask(() => onMessage({ok:true, status:'ready'}));
        },
        disconnect(){}
      };
    }
  }
};
const context = vm.createContext({browser, Promise, Error, setTimeout, clearTimeout, queueMicrotask});
context.globalThis=context;
vm.runInContext(code, context);
await context.AIGNative.request({action:'ping'});
integrationBackend = 'shelly';
await context.AIGNative.request({action:'listInstalled'});
await context.AIGNative.request({action:'integrate', backend:'gearlever', filename:'/tmp/test.AppImage'});
assert.deepEqual(posted.map(record => record.backend), ['gearlever','shelly','gearlever']);
assert.equal(posted[1].action, 'listInstalled');
assert.equal(posted[2].filename, '/tmp/test.AppImage');
console.log('Native client selects the configured backend and respects pinned download backend.');
