#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script = readFileSync('extension/common/background.js','utf8');
const noticesScript = readFileSync('extension/common/notifications.js', 'utf8');
async function runCase({enabled, manual, integrationStatus, expectedNotifications, notificationFails = false}) {
  let changed = null, handler = null;
  const notices = [];
  const state = {enabled, pending: manual ? {42: {manual:true, url:'https://github.com/a/b/releases/download/v1/app.AppImage'}} : {},
                 processed: []};
  const item = {id:42, filename:'/home/user/Downloads/app.AppImage', state:'complete',
    url:'https://github.com/a/b/releases/download/v1/app.AppImage'};
  const browser = {
    action:{async setBadgeText(){},async setBadgeBackgroundColor(){}},
    storage:{
      local:{
        async get(keys) {
          const names = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(names.map(key=>[key,state[key]]));
        },
        async set(next) {Object.assign(state,next);}
      },
      onChanged:{addListener(){}}
    },
    downloads:{
      onCreated:{addListener(){}},
      onChanged:{addListener(fn){changed=fn;}},
      async search(){return [item];},
      async download(){return 42;}
    },
    notifications:{async create(id, info){
      if (notificationFails) throw new Error('Desktop blocked');
      notices.push({id,info});
    },
      async getPermissionLevel(){return 'granted';}},
    runtime:{
      getURL:path=>'chrome-extension://app/'+path,
      onMessage:{addListener(fn){handler=fn;}},
      onInstalled:{addListener(){}},
      onStartup:{addListener(){}},
      connectNative(){
        const callbacks = [];
        return {
          onMessage:{addListener(fn){callbacks.push(fn);}},
          onDisconnect:{addListener(){}},
          postMessage(){
            queueMicrotask(()=>callbacks.forEach(fn=>fn({
              ok:true,status:integrationStatus,
              installedPath:'/home/user/AppImages/app.AppImage'})));
          },
          disconnect(){}
        };
      }
    },
    alarms:{onAlarm:{addListener(){}},async create(){}}
  };
  const context=vm.createContext({globalThis:{browser,GLGUpdate:{async check(){}}},
    console, queueMicrotask, Date, Set, Error, String, Boolean, Number});
  // VM globalThis is the global itself in real browsers, not a separate scope.
  context.browser=browser;
  context.GLGUpdate={async check(){}};
  context.globalThis=context;
  vm.runInContext(noticesScript,context);
  vm.runInContext(script,context);
  assert.equal(typeof changed,'function');
  changed({id:42,state:{current:'complete'}});
  await new Promise(r=>setTimeout(r,30));
  assert.equal(notices.length,expectedNotifications);
  if(expectedNotifications){
    assert.match(notices[0].info.message, integrationStatus === 'invalid'
      ? /conferir o erro/ : integrationStatus === 'integrated_unlisted'
        ? /ainda não listou/ : /integrada com sucesso/);
    assert.equal(notices[0].info.iconUrl,'chrome-extension://app/icons/icon-48.png');
  }
  assert.equal(state.lastResult.status,
    ['integrated_with_source','integrated_without_source','integrated_unlisted'].includes(integrationStatus)?'success':'error');
  assert.ok(handler,'Manager download handler registered');
}
await runCase({enabled:true,manual:false,integrationStatus:'integrated_with_source',expectedNotifications:1});
await runCase({enabled:false,manual:true,integrationStatus:'integrated_without_source',expectedNotifications:1});
await runCase({enabled:true,manual:false,integrationStatus:'integrated_unlisted',expectedNotifications:1});
await runCase({enabled:true,manual:false,integrationStatus:'invalid',expectedNotifications:1});
await runCase({enabled:true,manual:false,integrationStatus:'integrated_with_source',
  notificationFails:true,expectedNotifications:0});
console.log('Desktop notification integration tests passed');
