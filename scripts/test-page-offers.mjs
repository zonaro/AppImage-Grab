#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const helper = fs.readFileSync('extension/common/page-offers.js','utf8');
const controller = fs.readFileSync('extension/common/page-offer-background.js','utf8');
const notificationHelper = fs.readFileSync('extension/common/notifications.js','utf8');
const parsed = vm.createContext({URL,console});
parsed.globalThis = parsed;
vm.runInContext(helper,parsed);
const parse = parsed.GLGPageOffers.parse;

const examples = [
  ['https://github.com/acme/widget','https://github.com/acme/widget','GitHub'],
  ['https://www.github.com/acme/widget/releases/latest?utm_source=news#assets','https://github.com/acme/widget/releases/latest','GitHub'],
  ['https://github.com/acme/widget/releases/tag/v1.2','https://github.com/acme/widget/releases/tag/v1.2','GitHub'],
  ['https://github.com/acme/widget/tree/main/src','https://github.com/acme/widget','GitHub'],
  ['https://github.com/acme/widget/issues/123','https://github.com/acme/widget','GitHub'],
  ['https://gitlab.com/group/subgroup/widget/-/releases','https://gitlab.com/group/subgroup/widget/-/releases','GitLab'],
  ['https://gitlab.com/group/subgroup/widget/-/releases/v1.2','https://gitlab.com/group/subgroup/widget/-/releases/v1.2','GitLab'],
  ['https://gitlab.com/group/subgroup/widget/-/tree/main','https://gitlab.com/group/subgroup/widget','GitLab'],
  ['https://codeberg.org/group/widget/releases/tag/v1.2','https://codeberg.org/group/widget/releases/tag/v1.2','Codeberg'],
  ['https://codeberg.org/group/widget','https://codeberg.org/group/widget','Codeberg'],
  ['https://codeberg.org/group/widget/src/branch/main','https://codeberg.org/group/widget','Codeberg']
];
for (const [url,expected,provider] of examples) {
  const result = parse(url);
  assert.ok(result,'expected provider: '+url);
  assert.equal(result.source,expected);
  assert.equal(result.provider,provider);
}
const invalid = [
  'http://github.com/acme/widget','https://github.com/acme/widget/not-a-repo-section',
  'https://github.com/acme/widget/settings','https://github.com/acme',
  'https://example.org/acme/widget','https://gist.github.com/acme/widget',
  'https://gitlab.com/a/b/-/not-a-repo-section','https://codeberg.org/a/b/admin/secret',
  'https://gitlab.com/a/b/-/releases/v1/downloads/app.AppImage',
  'https://user:password@github.com/acme/widget',
  'https://github.com:9999/acme/widget'
];
for (const url of invalid) assert.equal(parse(url),null,'must reject unsupported page: '+url);
assert.equal(parse('https://github.com/a/b?token=private').source,'https://github.com/a/b');
assert.equal(parse('https://github.com/a/b/releases').key,parse('https://github.com/a/b').key);

const waiting = ms => new Promise(resolve => setTimeout(resolve,ms));
async function scenario({suggestionsEnabled=true}={}) {
  const url='https://github.com/acme/widget';
  const anotherUrl='https://codeberg.org/acme/another';
  const notifications=[];
  const opened=[];
  const listeners={};
  const storage={suggestionsEnabled,suggestedRepositories:{},offerNotifications:{}};
  const tabsById=new Map([[1,{id:1,url,active:true,incognito:false}]]);
  let requests=0;
  const api={
    runtime:{
      getURL:x=>'chrome-extension://test/'+x,
      onMessage:{addListener:fn=>{listeners.message=fn;}},
      onStartup:{addListener:fn=>{listeners.startup=fn;}}
    },
    storage:{local:{
      async get(keys) {
        if (typeof keys==='string') return {[keys]:storage[keys]};
        return Object.fromEntries(keys.map(k=>[k,storage[k]]));
      },
      async set(obj) {Object.assign(storage,obj);}
    }},
    tabs:{
      async query() {return [...tabsById.values()];},
      async get(id) {return tabsById.get(id);},
      async create(options) {opened.push(options);},
      onUpdated:{addListener:fn=>{listeners.tabUpdated=fn;}},
      onActivated:{addListener:fn=>{listeners.tabActivated=fn;}}
    },
    notifications:{
      async create(id,opts){notifications.push({id,opts});return id;},
      async clear(){return true;},
      onClicked:{addListener:fn=>{listeners.clicked=fn;}},
      onButtonClicked:{addListener:fn=>{listeners.buttonClicked=fn;}}
    }
  };
  const context=vm.createContext({
    URL,console,Date,Map,Set,Object,Promise,Number,String,Boolean,
    browser:api,
    GLGNative:{async request(req){
      assert.equal(req.action,'resolveLink');
      requests++;
      const source=parse(req.url);
      assert.ok(source, 'native is called only for supported URL');
      return {choices:[
        {name:'widget-1.2-x86_64.AppImage',
         url:'https://github.com/acme/widget/releases/download/v1.2/widget-1.2-x86_64.AppImage', architecture:'x86_64'},
        {name:'widget-1.2-arm64.AppImage',
         url:'https://github.com/acme/widget/releases/download/v1.2/widget-1.2-arm64.AppImage', architecture:'arm64'}
      ]};
    }}
  });
  context.globalThis=context;
  vm.runInContext(helper,context);
  vm.runInContext(notificationHelper,context);
  vm.runInContext(controller,context);
  assert.equal(typeof listeners.tabUpdated,'function');
  assert.equal(typeof listeners.message,'function');

  listeners.tabUpdated(1,{status:'complete'},tabsById.get(1));
  await waiting(35);
  assert.equal(notifications.length,suggestionsEnabled?1:0);
  if (suggestionsEnabled) {
    assert.equal(notifications[0].opts.buttons[0].title,'Escolher AppImage');
    assert.match(notifications[0].opts.message,/2 AppImages/);
    assert.equal(storage.suggestedRepositories['github.com:acme/widget']>0,true);
    listeners.tabUpdated(1,{status:'complete'},tabsById.get(1));
    await waiting(20);
    assert.equal(notifications.length,1,'revisits do not spam notifications');
    assert.equal(requests,1,'cached repo does not query release twice');

    listeners.buttonClicked(notifications[0].id,0);
    await waiting(20);
    assert.equal(opened.length,1);
    assert.match(opened[0].url,/manager\.html\?source=/);
    assert.equal(decodeURIComponent(opened[0].url.split('source=')[1]),url);
    // A notification only opens a form: no downloads integration has been started.
    assert.equal(requests,1);
  }
  // The popup still offers an explicit install when passive suggestions are OFF.
  const response=await new Promise(resolve => {
    assert.equal(listeners.message({action:'getPageOffer'},null,resolve),true);
  });
  assert.equal(response.ok,true);
  assert.equal(response.offer.choices.length,2);
  assert.equal(response.offer.provider,'GitHub');

  // Unsupported page never sends its full URL to the native host.
  tabsById.set(1,{id:1,url:'https://example.com/private?token=secret',active:true});
  const before=requests;
  listeners.tabUpdated(1,{status:'complete'},tabsById.get(1));
  await waiting(15);
  assert.equal(requests,before);
  const unsupported=await new Promise(resolve=>listeners.message({action:'getPageOffer'},null,resolve));
  assert.equal(unsupported.offer,null);

  tabsById.set(1,{id:1,url:anotherUrl,active:true});
  listeners.tabActivated({tabId:1});
  await waiting(35);
  assert.equal(notifications.length,suggestionsEnabled?2:0);
}
await scenario();
await scenario({suggestionsEnabled:false});
console.log('Repository suggestion and notification tests passed.');
