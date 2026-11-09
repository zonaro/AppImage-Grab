#!/usr/bin/env node
// Browser-independent deterministic checks for commit detection.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('extension/common/update-check.js', 'utf8');
const OLD = 'a'.repeat(40);
const NEW = 'b'.repeat(40);

function setup({host = OLD, remote = NEW, fail = false, saved = null} = {}) {
  const stored = {updateStatus: saved};
  let calls = 0;
  const context = {
    setTimeout: () => 5,
    clearTimeout: () => {},
    AbortController,
    Date,
    fetch: async (url) => {
      calls++;
      if (fail) throw Error('offline');
      assert.match(url, /api\.github\.com\/repos\/zonaro\/gear-lever-grab\/commits\/main/);
      return {ok: true, json: async () => ({sha: remote})};
    },
    globalThis: {
      GLG_BUILD_COMMIT: OLD,
      browser: {
        runtime: {getURL: file => 'moz-extension://test/' + file},
        storage: {local: {
          async get(key) {return {updateStatus: stored.updateStatus};},
          async set(update) {Object.assign(stored, update);}
        }}
      },
      GLGNative: {request: async ({action}) => {
        assert.equal(action, 'getVersion');
        return {commit: host};
      }}
    }
  };
  vm.runInNewContext(code, context);
  return {api: context.globalThis.GLGUpdate, stored, getCalls: () => calls};
}

async function run() {
  const s = setup();
  let result = await s.api.check({force: true});
  assert.equal(result.bundleCommit, OLD);
  assert.equal(result.hostCommit, OLD);
  assert.equal(result.latestCommit, NEW);
  assert.equal(result.updateAvailable, true);
  assert.equal(result.needsReload, false);
  assert.equal(s.getCalls(), 1);
  result = await s.api.check();
  assert.equal(s.getCalls(), 1, 'cached result must not hit GitHub again');
  assert.equal(result.updateAvailable, true);

  const latest = setup({remote: OLD});
  result = await latest.api.check({force: true});
  assert.equal(result.updateAvailable, false);

  const reload = setup({host: NEW, remote: NEW});
  result = await reload.api.check({force: true});
  assert.equal(result.needsReload, true);
  assert.equal(result.updateAvailable, true);

  const offline = setup({fail: true, saved: {
    latestCommit: NEW, checkedAt: Date.now() - 13 * 60 * 60 * 1000
  }});
  result = await offline.api.check({force: true});
  assert.equal(result.updateAvailable, true, 'keep prior warning when GitHub is down');
  assert.equal(result.error, 'offline');

  assert.ok(s.api.COMMAND.includes('install.sh | bash'));
  console.log('Commit-check tests passed.');
}
await run();
