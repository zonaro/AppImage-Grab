#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const storage = {};
const api = {
  storage: {
    local: {
      async get(keys) {
        const names = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(names.map(k => [k, storage[k]]));
      },
      async set(data) {Object.assign(storage, data);}
    },
    onChanged: {addListener() {}}
  }
};
const ctx = vm.createContext({browser: api, console, Date, Promise});
ctx.globalThis = ctx;
vm.runInContext(fs.readFileSync('extension/common/activity-log.js', 'utf8'),ctx);
const history = ctx.AIGActivity;
await history.record({id:'download-20',status:'downloading',phase:'download',
  filename:'/home/user/Downloads/mechvibes-3.5.6.AppImage',
  detail:'Downloading https://example.com/secret.AppImage?token=abcd', source:'manual'});
await Promise.all([
  history.record({id:'download-20',status:'integrating',phase:'integration',filename:'mechvibes-3.5.6.AppImage',
    detail:'Gear Lever executing', source:'manual'}),
  history.record({id:'download-21',status:'error',phase:'integration',filename:'broken.AppImage',
    detail:'Gear Lever returned 1: /home/user/Downloads/broken.AppImage token=abcdef', source:'automatic'})
]);
assert.equal(storage.activityHistory.length,2);
assert.equal(storage.activityHistory.find(e=>e.id==='download-20').status,'integrating');
const failed=storage.activityHistory.find(e=>e.id==='download-21');
assert.equal(failed.status,'error');
assert.match(failed.detail,/broken.AppImage/);
assert.ok(!JSON.stringify(storage.activityHistory).includes('/home/user/'));
assert.ok(!JSON.stringify(storage.activityHistory).includes('abcdef'));
assert.ok(!JSON.stringify(storage.activityHistory).includes('https://'));
await history.record({id:'download-20',status:'success',phase:'integration',detail:'Installed',source:'manual'});
assert.equal(storage.activityHistory.length,2);
assert.equal(storage.activityHistory.find(e=>e.id==='download-20').status,'success');
await assert.rejects(history.record({id:'../bad',status:'error'}));
for(let i=0;i<215;i++) await history.record({id:'download-'+(1000+i),status:'success',
  phase:'integration',filename:'app.AppImage',detail:'Done'});
assert.equal(storage.activityHistory.length,200);
assert.equal(storage.activityHistory[0].id,'download-1214');

class Element {
  constructor(tag='div') {this.tag=tag;this.children=[];this.handlers={};this.textContent='';
    this.value='';this.disabled=false;this.className='';}
  addEventListener(event,fn){this.handlers[event]=fn;}
  replaceChildren(...children){this.children=children;}
  append(...children){this.children.push(...children);}
}
const html=fs.readFileSync('extension/common/manager.html','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
elements['history-filter'].value='all'; // Real select defaults to its first option.
const copied=[];
const context=vm.createContext({
  browser:api,
  AIGNative:{async request({action}){assert.equal(action,'getHostLog');return {ok:true,entries:[
    {at:'2026-11-12 12:00:00,000',level:'WARNING',detail:'Gear Lever returned 1: permission denied'}]};}},
  AIGI18n:{translate:v=>v, locale:'pt-BR'},
  document:{getElementById:id=>elements[id], createElement:tag=>new Element(tag)},
  window:{confirm:()=>true}, navigator:{clipboard:{async writeText(value){copied.push(value);}}},
  console, Date, Promise
});
context.globalThis=context;
vm.runInContext(fs.readFileSync('extension/common/activity-history.js','utf8'),context);
context.AIGActivityUI.activate();
await new Promise(resolve=>setTimeout(resolve,30));
assert.equal(elements['history-list'].children.length,200);
assert.equal(elements['host-log-list'].children.length,1);
elements['history-filter'].value='error';
elements['history-filter'].handlers.change();
assert.equal(elements['history-list'].children.length,1, 'old error dropped due to history limit');
await elements['history-copy'].handlers.click();
await new Promise(resolve=>setTimeout(resolve,10));
assert.ok(copied[0].includes('host.log'));
await elements['history-clear'].handlers.click();
await new Promise(resolve=>setTimeout(resolve,20));
assert.equal(storage.activityHistory.length,0);
assert.equal(elements['host-log-list'].children.length,1,'clearing browser history leaves host log alone');
console.log('Activity logging, privacy, bounded history, filters, host diagnostics and copy tests passed.');
