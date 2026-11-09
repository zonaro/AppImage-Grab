/* Chromium MV3 / Firefox MV3: observe completed downloads, never intercept. */
const api = globalThis.browser || globalThis.chrome;
const HOST = 'br.com.redclaw.gear_lever_grab';
const working = new Set();

async function badge() {
  const { enabled = false } = await api.storage.local.get('enabled');
  await api.action.setBadgeText({ text: enabled ? 'ON' : 'OFF' });
  await api.action.setBadgeBackgroundColor({ color: enabled ? '#28876c' : '#777782' });
}

async function result(status, detail) {
  await api.storage.local.set({
    lastResult: { status, detail, at: new Date().toISOString() }
  });
}

function sendNative(download) {
  return new Promise((resolve, reject) => {
    let port;
    try { port = api.runtime.connectNative(HOST); }
    catch (error) { reject(error); return; }
    let finished = false;
    port.onMessage.addListener((response) => {
      if (finished) return;
      finished = true;
      resolve(response);
      port.disconnect();
    });
    port.onDisconnect.addListener(() => {
      if (finished) return;
      finished = true;
      reject(new Error(api.runtime.lastError?.message || 'Serviço local indisponível'));
    });
    port.postMessage({
      action: 'integrate',
      filename: download.filename,
      url: download.url || '',
      finalUrl: download.finalUrl || '',
      referrer: download.referrer || ''
    });
  });
}

function appimage(item) {
  return /\.appimage$/i.test(item.filename || '');
}

// Keep the original URL before redirects. A completed download may point
// to an opaque CDN/signed URL rather than its GitHub Releases source.
async function created(item) {
  if (!appimage(item)) return;
  const state = await api.storage.local.get(['enabled', 'pending']);
  if (!state.enabled) return;
  const pending = state.pending || {};
  pending[item.id] = {
    url: item.url || '', finalUrl: item.finalUrl || '',
    referrer: item.referrer || ''
  };
  const keys = Object.keys(pending);
  for (const id of keys.slice(0, Math.max(0, keys.length - 120))) delete pending[id];
  await api.storage.local.set({ pending });
}

async function finished(delta) {
  if (delta.state?.current !== 'complete') return;
  const settings = await api.storage.local.get(['enabled', 'pending', 'processed']);
  if (!settings.enabled || working.has(delta.id) || (settings.processed || []).includes(delta.id)) return;
  const entries = await api.downloads.search({ id: delta.id });
  const item = entries[0];
  if (!item || !appimage(item) || item.state !== 'complete') return;
  working.add(delta.id);
  try {
    await result('working', item.filename);
    const original = (settings.pending || {})[delta.id] || {};
    const payload = {
      ...item,
      url: original.url || item.url,
      finalUrl: item.finalUrl || original.finalUrl,
      referrer: original.referrer || item.referrer
    };
    const reply = await sendNative(payload);
    if (!reply?.ok) throw new Error(reply?.error || 'Falha não identificada');

    const latest = await api.storage.local.get(['processed', 'pending']);
    const processed = [...(latest.processed || []), delta.id].slice(-250);
    const pending = latest.pending || {};
    delete pending[delta.id];
    await api.storage.local.set({ processed, pending });
    const details = reply.status === 'integrated_with_source'
      ? 'Integrado com atualizações: ' + reply.sourceOrigin
      : reply.status === 'embedded_source_preserved' || reply.status === 'existing_source_preserved'
        ? 'Integrado; fonte existente preservada'
        : reply.status === 'already_processed'
          ? 'Arquivo já processado'
          : 'Integrado sem fonte automática (origem não identificada)';
    await result('success', details);
  } catch (error) {
    await result('error', item.filename + ': ' + (error?.message || String(error)));
  } finally {
    working.delete(delta.id);
  }
}

api.downloads.onCreated.addListener(item => { void created(item); });
api.downloads.onChanged.addListener(delta => { void finished(delta); });
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enabled) void badge();
});
api.runtime.onInstalled.addListener(() => { void badge(); });
api.runtime.onStartup?.addListener(() => { void badge(); });
void badge();
