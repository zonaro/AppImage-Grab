#!/usr/bin/env node
// Offline unit and WebExtension flow regressions; no npm dependencies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const catalog = fs.readFileSync('extension/common/store-catalog.js', 'utf8');
const store = fs.readFileSync('extension/common/store.js', 'utf8');
const background = fs.readFileSync('extension/common/background.js', 'utf8');

const catalogContext = vm.createContext({URL, console});
vm.runInContext(catalog, catalogContext);
const C = catalogContext.AIGCatalog;
const samplePool = {
  items: [{name: 'Music', description: '<b>Musical</b> app', categories: ['Audio'],
    authors: [{name:'Developer'}], links:[{type:'Download',url:'https://github.com/org/music/releases'}],
    icons:['Music/icons/music.png'], screenshots:['Music/screenshot.png']},
  {name:'Tool', links:[{type:'Download',url:'javascript:alert(1)'}], icons:['../bad.png']}]
};
const sampleHub = {id:1687212,name:'Spotube',summary:'Listen',typename:'Audio',personid:'author',
  downloadname1:'Spotube-linux-x86_64.AppImage',
  downloadlink1:'https://files06.pling.com/api/files/download/j/token/Spotube-linux-x86_64.AppImage',
  downloadname2:'danger.tar.gz',downloadlink2:'https://files06.pling.com/danger.tar.gz',
  smallpreviewpic1:'https://images.pling.com/icon.png',score:42};
const normalizedPool = samplePool.items.map(C.normalizePool);
const normalizedHub = C.normalizeHub(sampleHub);
assert.equal(normalizedPool[0].releaseUrl, 'https://github.com/org/music/releases');
assert.equal(normalizedPool[0].description, 'Musical app');
assert.match(normalizedPool[0].image, /database\/Music\/icons\/music.png$/);
assert.equal(normalizedPool[1].releaseUrl, '');
assert.equal(normalizedPool[1].image, '');
assert.equal(normalizedHub.files.length, 1);
assert.equal(normalizedHub.files[0].architecture, 'x86_64');
assert.equal(C.normalizeHub({...sampleHub, downloadname1:'bad.tar.gz'}), null);
assert.equal(C.releaseSource('https://evil.example/test.AppImage'), '');
assert.equal(C.releaseSource('https://github.com/org/repo?q=bad'), '');
assert.equal(C.architecture('App-arm64.AppImage'), 'ARM64');
assert.equal(C.hubPageUrl(['237'], 0, 'Spotube').includes('page=0'), true);
assert.equal(C.hubCategories({status:'ok',data:[{id:237,xdg_type:'bin'},{id:10,xdg_type:'theme'}]}).join(''), '237');

class Element {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.handlers = {}; this.value = '';
    this.textContent = ''; this.hidden = false; this.disabled = false; this.className = '';
  }
  append(...nodes) {this.children.push(...nodes);}
  replaceChildren(...nodes) {this.children = [...nodes];}
  addEventListener(type, handler) {this.handlers[type] = handler;}
  showModal() {this.open = true;}
  close() {this.open = false;}
}

const ids = [...new Set([...fs.readFileSync('extension/common/manager.html', 'utf8').matchAll(/\bid="([^"]+)"/g)].map(match => match[1]))];
const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
const sent = [];
const fetchCalls = [];
const context = vm.createContext({
  URL, AbortController, setTimeout, clearTimeout, Date, console,
  window:{confirm:()=>{throw Error('Install must not request extra confirmation');}},
  document:{getElementById(id){assert.ok(elements[id],id);return elements[id];},createElement(tag){return new Element(tag);}},
  browser:{runtime:{async sendMessage(message){sent.push(message);return {ok:true,name:'Spotube-linux-x86_64.AppImage'};}}},
  AIGNative:{async request(){return {choices:[{name:'Music-x86_64.AppImage',url:'https://github.com/org/music/releases/download/v1/Music-x86_64.AppImage',architecture:'x86_64'}]};}},
  async fetch(url) {
    fetchCalls.push(url);
    let payload;
    if (url === C.POOL_FEED) payload = samplePool;
    else if (url.includes('/content/categories?')) payload = {status:'ok',data:[{id:237,xdg_type:'bin'}]};
    else payload = {status:'ok',data:[sampleHub,{id:2,name:'Archive',downloadname1:'Archive.tar.gz',downloadlink1:'https://files06.pling.com/x.tar.gz'}]};
    return {ok:true,async text(){return JSON.stringify(payload);}};
  }
});
vm.runInContext(catalog, context);
vm.runInContext(store, context);
const tick = async () => {await new Promise(resolve => setTimeout(resolve, 15));};
context.AIGStore.activate();
await tick();
assert.equal(elements['store-results'].children.length, 3);
assert.match(elements['store-count'].textContent, /3 resultado/);
assert.ok(fetchCalls.some(url => url.includes('page=0')));
elements['store-source'].handlers.change({target:{value:'hub'}});
assert.equal(elements['store-results'].children.length, 1);
const hubDetails = elements['store-results'].children[0].children[1].children.at(-1);
hubDetails.handlers.click();
await tick();
assert.equal(elements['store-dialog'].open, true);
assert.equal(elements['store-detail-download'].disabled, false);
await elements['store-detail-download'].handlers.click();
await tick();
assert.equal(sent.length, 1);
assert.equal(sent[0].action, 'startCatalogDownload');
assert.equal(sent[0].confirmed, true);
assert.equal(sent[0].contentId, 1687212);

const apiCalls = [];
let pending = {};
const backgroundContext = vm.createContext({
  URL, console,
  browser:{
    runtime:{onMessage:{addListener(){}},onInstalled:{addListener(){}},onStartup:{addListener(){}},getURL:x=>x},
    downloads:{onCreated:{addListener(){}},onChanged:{addListener(){}},
      async download(options){apiCalls.push(options);return 42;},async search(){return [{id:42,state:'in_progress'}];}},
    storage:{local:{async get(){return {pending};},async set(data){pending = data.pending || pending;}},onChanged:{addListener(){}}},
    alarms:{onAlarm:{addListener(){}},async create(){}},
    action:{async setBadgeText(){},async setBadgeBackgroundColor(){}},
    notifications:{async create(){}}
  },
  async fetch(){return {ok:true,async text(){return JSON.stringify({status:'ok',data:[sampleHub]});}};},
  AIGNative:{async request(){throw Error('Pling downloads should not require native resolution');}}
});
vm.runInContext(background, backgroundContext);
const request = {contentId:1687212,fileName:'Spotube-linux-x86_64.AppImage',confirmed:true};
await vm.runInContext('startCatalogDownload', backgroundContext)(request);
assert.equal(apiCalls.length, 1);
assert.equal(apiCalls[0].filename, request.fileName);
assert.equal(pending[42].manual, true);
await assert.rejects(vm.runInContext('startCatalogDownload', backgroundContext)({...request,confirmed:false}),/Confirmação/);
await assert.rejects(vm.runInContext('startCatalogDownload', backgroundContext)({...request,fileName:'other.AppImage'}),/não está mais disponível/);
await assert.rejects(vm.runInContext('startCatalogDownload', backgroundContext)({...request,fileName:'../evil.AppImage'}),/inválido/);
assert.equal(apiCalls.length, 1, 'rejected downloads never reach the browser');
console.log('Store catalog, UI, and privileged download tests passed.');
