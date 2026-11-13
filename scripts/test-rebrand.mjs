#!/usr/bin/env node
// Prevent accidental resurrection of the legacy Gear Lever Grab identity.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const root=process.cwd();
const excluded=new Set(['.git','dist','node_modules','__pycache__']);
const legacy=[
  /gear[ -]lever[ -]grab/i,
  /gear_lever_grab/i,
  /\bGLG[A-Z_]/,
  /br\.com\.redclaw\.gear_lever_grab/,
  /kcjajemgciajdjgbancfocacaebpmkjh/i,
  /zonaro\/gear-lever-grab/i
];
function visit(folder) {
  for(const ent of fs.readdirSync(folder,{withFileTypes:true})) {
    if (excluded.has(ent.name)) continue;
    const absolute=path.join(folder,ent.name);
    if(ent.isDirectory()) {visit(absolute);continue;}
    if(!ent.isFile()||ent.name==='test-rebrand.mjs'||
       /\.(?:png|jpe?g|ico|gif|webp|zip|AppImage)$/i.test(ent.name))continue;
    const text=fs.readFileSync(absolute,'utf8');
    for(const pattern of legacy) {
      assert.doesNotMatch(text,pattern,'Old identity in '+path.relative(root,absolute));
    }
  }
}
visit(root);

const chromium=JSON.parse(fs.readFileSync('extension/chromium/manifest.json','utf8'));
const firefox=JSON.parse(fs.readFileSync('extension/firefox/manifest.json','utf8'));
const key=Buffer.from(chromium.key,'base64');
const digest=crypto.createHash('sha256').update(key).digest();
const alphabet='abcdefghijklmnop';
const derived=Array.from(digest.subarray(0,16)).map(n=>alphabet[n>>4]+alphabet[n&15]).join('');
const advertised=fs.readFileSync('extension/chromium/id.txt','utf8').trim();
assert.equal(derived,advertised,'Chromium host allowlist ID must match the NEW manifest key');
assert.equal(advertised,'pgokdjflfjpcaanlhbhecgjgienbfbde');
assert.equal(firefox.browser_specific_settings.gecko.id,'appimage-grab@redclaw.com.br');
assert.equal(chromium.action.default_title,'AppImage Grab');
assert.equal(firefox.action.default_title,'AppImage Grab');
const register=fs.readFileSync('scripts/register_hosts.py','utf8');
const native=fs.readFileSync('extension/common/native-client.js','utf8');
for(const content of [register,native]) assert.match(content,/br\.com\.redclaw\.appimage_grab/);
const installer=fs.readFileSync('install.sh','utf8');
assert.match(installer,/zonaro\/AppImage-Grab/);
assert.match(installer,/\.local\/share\/appimage-grab/);
assert.match(installer,/appimage-grab-host/);
const landing=fs.readFileSync('docs/index.html','utf8');
assert.match(landing,/zonaro\.github\.io\/AppImage-Grab/);
assert.match(landing,/Gear Lever.*Shelly/);
console.log('Rebrand and new extension/Native Messaging identity verified.');
