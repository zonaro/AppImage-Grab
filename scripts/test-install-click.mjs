#!/usr/bin/env node
// Installation is a deliberate button action, not a second window.confirm dialog.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const popup = readFileSync('extension/common/popup.js','utf8');
const source = popup.slice(popup.indexOf("installOffer.addEventListener('click'"));
assert.ok(source.includes("action:'startManagedDownload'"));
assert.ok(!source.includes('window.confirm('), 'popup install must not open a confirmation dialog');

class Element {
  constructor() {
    this.value = ''; this.checked = false; this.hidden = true;
    this.textContent = ''; this.disabled = false; this.children = [];
    this.handlers = {}; this.className = '';
  }
  addEventListener(event, callback) {this.handlers[event] = callback;}
  replaceChildren(...items) {this.children = items;}
  append(...items) {this.children.push(...items);}
}
const ids = [...new Set([...readFileSync('extension/common/popup.html', 'utf8')
  .matchAll(/\bid="([^"]+)"/g)].map(match => match[1]))];
const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
const versionLabel = new Element();
const sent = [];
const offer = {
  provider:'GitHub', repository:'developer/app',
  source:'https://github.com/developer/app',
  choices:[{name:'App-x86_64.AppImage',
    architecture:'x86_64',
    url:'https://github.com/developer/app/releases/download/v1/App-x86_64.AppImage'}]
};
const api = {
  runtime:{
    getManifest:()=>({version:'26.315.431',version_name:'26.315.0431'}),
    getURL:path=>'chrome-extension://test/'+path,
    async sendMessage(message) {
      sent.push(message);
      return message.action === 'getPageOffer' ? {ok:true,offer}
        : {ok:true,name:'App-x86_64.AppImage'};
    }
  },
  storage:{
    local:{async get(){return {};},async set(){}},
    onChanged:{addListener(){}}
  },
  tabs:{async create(){}}
};
const context = vm.createContext({
  browser:api,
  AIGNative:{async request(){return {ok:true,apps:[]};}},
  AIGUpdate:{COMMAND:'test',async check(){return {};}},
  AIGI18n:{translate:value=>value, locale:'pt-BR'},
  window:{confirm(){throw Error('Unexpected confirmation dialog');}},
  document:{
    querySelector(){return versionLabel;},
    getElementById(id){assert.ok(elements[id], 'Missing '+id);return elements[id];},
    createElement(){return new Element();}
  },
  console, Date
});
context.globalThis=context;
vm.runInContext(popup,context);
await new Promise(resolve=>setTimeout(resolve,20));
assert.equal(elements['page-offer'].hidden,false);
elements['offer-asset'].value='0';
await elements['install-offer'].handlers.click();
assert.ok(sent.some(message=>message.action==='startManagedDownload' &&
  message.assetUrl===offer.choices[0].url));
assert.match(elements['offer-status'].textContent,/Download iniciado/);
console.log('Popup installation click works without a second confirmation.');
