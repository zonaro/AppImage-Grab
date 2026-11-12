#!/usr/bin/env node
// A failed Native Messaging host, storage API or update check must not create
// unhandled rejections or render the popup unusable after an extension reload.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class Element {
  constructor() {
    this.value=''; this.checked=false; this.hidden=true;
    this.disabled=false; this.className=''; this.children=[];
    this.handlers={}; this.writes=[]; this._textContent='';
  }
  set textContent(value) {this._textContent=String(value);this.writes.push(this._textContent);}
  get textContent() {return this._textContent;}
  addEventListener(type, listener) {this.handlers[type]=listener;}
  replaceChildren(...items) {this.children=items;}
  append(...items) {this.children.push(...items);}
}
const html=fs.readFileSync('extension/common/popup.html','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
const versionLabel=new Element();
const api={
  runtime: {
    getManifest:()=>({version:'26.316.1200'}),
    getURL:path=>'chrome-extension://test/'+path,
    async sendMessage(){throw Error('Could not establish connection. Receiving end does not exist.');}
  },
  storage: {
    local: {
      async get(key) {
        if(Array.isArray(key) && key.includes('enabled')) throw Error('storage unavailable');
        return {};
      },
      async set() {throw Error('write denied');}
    },
    onChanged:{addListener(){}}
  },
  tabs:{async create(){throw Error('browser tab unavailable');}}
};
const context=vm.createContext({
  browser:api, Date, Number, String, Error, console,
  GLGNative:{async request(){throw Error('native host unavailable');}},
  GLGUpdate:{COMMAND:'install command',async check(){throw Error('update check offline');}},
  GLGI18n:{translate:value=>value,locale:'pt-BR'},
  document:{
    querySelector:()=>versionLabel,
    getElementById:id=>{assert.ok(elements[id], 'Missing DOM node '+id);return elements[id];},
    createElement:()=>new Element()
  },
  navigator:{clipboard:{async writeText(){throw Error('clipboard denied');}}},
  window:{prompt(){}}
});
context.globalThis=context;
vm.runInContext(fs.readFileSync('extension/common/popup.js','utf8'),context);
await new Promise(resolve=>setTimeout(resolve,30));
const errors=elements['popup-error'].writes.filter(Boolean).join('\n');
assert.match(errors,/Não foi possível carregar as preferências: storage unavailable/);
assert.match(errors,/Falha na verificação de atualizações: update check offline/);
assert.match(errors,/Não foi possível consultar sugestões de AppImage:/);
assert.equal(elements['popup-error'].hidden,false);
assert.match(elements['apps-status'].textContent,/native host unavailable/);
assert.ok(versionLabel.textContent.startsWith('v26.316.1200'));

elements['enabled'].checked=true;
await elements['enabled'].handlers.change();
assert.equal(elements['enabled'].checked,false,'failed preference write is rolled back');
assert.match(elements['popup-error'].textContent,/Não foi possível alterar a integração automática: write denied/);

// Browser event.currentTarget becomes null immediately after the synchronous
// event dispatch returns. Simulate this instead of keeping a fake event alive.
const expiredEvent={currentTarget:elements['recheck-updates']};
const failedCheck=elements['recheck-updates'].handlers.click(expiredEvent);
assert.equal(elements['recheck-updates'].disabled,true,'disable during pending check');
expiredEvent.currentTarget=null;
await failedCheck;
assert.equal(elements['recheck-updates'].disabled,false,'failed update check must reenable button');
assert.match(elements['popup-error'].textContent,/Não foi possível verificar atualizações: update check offline/);

// Also guard the success branch against the same expired event reference.
context.GLGUpdate.check=async()=>({updateAvailable:false,needsReload:false});
const successEvent={currentTarget:elements['recheck-updates']};
const successfulCheck=elements['recheck-updates'].handlers.click(successEvent);
successEvent.currentTarget=null;
await successfulCheck;
assert.equal(elements['recheck-updates'].disabled,false,'successful update check must reenable button');
assert.equal(elements['popup-error'].hidden,true,'successful check clears previous transient error');

elements['suggestions-enabled'].checked=true;
elements['suggestions-enabled'].handlers.change();
await new Promise(resolve=>setTimeout(resolve,5));
assert.equal(elements['suggestions-enabled'].checked,false);
assert.match(elements['popup-error'].textContent,/Não foi possível salvar as sugestões: write denied/);

elements['manage'].handlers.click();
await new Promise(resolve=>setTimeout(resolve,5));
assert.match(elements['popup-error'].textContent,/Não foi possível abrir o gerenciador: browser tab unavailable/);
console.log('Popup error handling tests passed: storage, updates, native messaging, suggestions, navigation.');
