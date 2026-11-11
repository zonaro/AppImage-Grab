// Background revision is loaded once when the browser starts the extension.
if (typeof importScripts === 'function' && !globalThis.GLGUpdate) {
  importScripts('build-revision.js', 'i18n.js', 'native-client.js', 'update-check.js',
    'page-offers.js', 'page-offer-background.js');
}
/* Chromium MV3 / Firefox MV3: observe completed downloads, never intercept. */
const api = globalThis.browser || globalThis.chrome;
const tr = globalThis.GLGI18n?.translate || (message => message);
const HOST = 'br.com.redclaw.gear_lever_grab';
const working = new Set();
const SUCCESSFUL_INTEGRATIONS = new Set([
  'integrated_with_source', 'integrated_without_source',
  'embedded_source_preserved', 'existing_source_preserved'
]);

async function notifyIntegrated(download, reply) {
  if (!SUCCESSFUL_INTEGRATIONS.has(reply.status) || !reply.installedPath) return;
  const name = (reply.installedPath.split('/').pop() || 'AppImage').slice(0, 100);
  try {
    await api.notifications.create('glg-integrated-' + download.id, {
      type: 'basic',
      iconUrl: api.runtime.getURL('icons/icon-48.png'),
      title: tr('AppImage adicionada ao Gear Lever'),
      message: tr(name + ' foi integrada com sucesso.')
    });
  } catch (error) {
    // Notifications can be blocked by browser/OS; integration already succeeded.
    console.warn('Gear Lever Grab notification unavailable:', error);
  }
}

async function enqueueManualDownload(asset, filename = '') {
  const options = {url: asset.url, saveAs: false, conflictAction: 'uniquify'};
  if (filename) options.filename = filename;
  const id = await api.downloads.download(options);
  if (!Number.isInteger(id)) throw new Error('O navegador não iniciou o download');
  const {pending = {}} = await api.storage.local.get('pending');
  pending[id] = {manual: true, url: asset.url, sourceName: asset.name};
  await api.storage.local.set({pending});
  // The download can finish before storage.local.set returns.
  const downloads = await api.downloads.search({id});
  if (downloads[0]?.state === 'complete') void finished({id, state:{current:'complete'}});
  return {downloadId: id, name: asset.name};
}

async function startManagedDownload(request) {
  const link = String(request.link || '');
  const selected = String(request.assetUrl || '');
  // Revalidate in the privileged background, not just in the manager UI.
  const resolution = await GLGNative.request({action: 'resolveLink', url: link});
  const asset = (resolution.choices || []).find(candidate => candidate.url === selected);
  if (!asset || !asset.name || !/\.appimage$/i.test(asset.name)) {
    throw new Error('Arquivo não pertence à fonte selecionada');
  }
  return enqueueManualDownload(asset);
}

// Pling URLs are short-lived, so never accept one from the UI. Look up the
// exact AppImage filename again in the official OCS API immediately on click.
async function startCatalogDownload(request) {
  if (request.confirmed !== true) throw new Error('Confirmação de download obrigatória');
  const contentId = Number(request.contentId);
  const name = request.fileName;
  if (!Number.isSafeInteger(contentId) || contentId < 1 || contentId > 9999999999 ||
      typeof name !== 'string' || name.length > 200 ||
      !/^[\w .()+\-]+\.appimage$/i.test(name)) {
    throw new Error('Arquivo do catálogo inválido');
  }
  const url = 'https://api.opendesktop.org/ocs/v1/content/data/' + contentId + '?format=json';
  const response = await fetch(url, {redirect: 'error', cache: 'no-store', credentials: 'omit'});
  if (!response.ok) throw new Error('Não foi possível conferir o registro no AppImageHub');
  const body = await response.text();
  if (body.length > 500000) throw new Error('Resposta do catálogo muito grande');
  const detail = JSON.parse(body);
  if (detail.status !== 'ok' || !Array.isArray(detail.data)) throw new Error('Dados do AppImageHub inválidos');
  const entry = detail.data.find(item => Number(item.id) === contentId);
  if (!entry) throw new Error('Registro não encontrado no catálogo');
  let downloadUrl = '';
  let downloadWay;
  for (let i = 1; i <= 10; i++) {
    if (entry['downloadname' + i] === name && typeof entry['downloadlink' + i] === 'string') {
      downloadUrl = entry['downloadlink' + i];
      downloadWay = entry['downloadway' + i];
      break;
    }
  }
  if (!downloadUrl) throw new Error('AppImage não está mais disponível no catálogo');
  let parsed;
  try { parsed = new URL(downloadUrl); } catch { throw new Error('URL de download inválida'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port ||
      parsed.search || parsed.hash) throw new Error('Origem do AppImageHub não é segura');
  let basename = '';
  try { basename = decodeURIComponent(parsed.pathname.split('/').pop()); } catch { /* Refuse malformed encoding. */ }
  if (basename !== name) throw new Error('O nome do arquivo não corresponde ao download');
  const pling = /^files\d+\.pling\.com$/.test(parsed.hostname) &&
    /^\/api\/files\/download\/j\/[^/]+\/[^/]+\.appimage$/i.test(parsed.pathname) &&
    String(downloadWay) !== '0';
  if (!pling) {
    // Other hosts are accepted only if the existing native provider resolver
    // independently recognizes the exact asset and its trusted release.
    if (!['github.com', 'gitlab.com', 'codeberg.org'].includes(parsed.hostname)) {
      throw new Error('Arquivo em origem externa não validada. Abra a página do AppImageHub.');
    }
    const resolved = await GLGNative.request({action:'resolveLink', url:downloadUrl});
    if (!(resolved.choices || []).some(item => item.url === downloadUrl && item.name === name)) {
      throw new Error('O release do provedor não confirmou este arquivo');
    }
  }
  return enqueueManualDownload({url: downloadUrl, name}, name);
}

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!['startManagedDownload', 'startCatalogDownload'].includes(message?.action)) return false;
  void (message.action === 'startCatalogDownload' ? startCatalogDownload(message) : startManagedDownload(message))
    .then(data => sendResponse({ok:true, ...data}))
    .catch(error => sendResponse({ok:false, error:tr(String(error?.message || error))}));
  return true;
});

async function badge() {
  const { enabled = false, updateStatus } = await api.storage.local.get(['enabled', 'updateStatus']);
  const newer = Boolean(updateStatus?.updateAvailable || updateStatus?.needsReload);
  await api.action.setBadgeText({ text: newer ? 'NEW' : enabled ? 'ON' : 'OFF' });
  await api.action.setBadgeBackgroundColor({ color: newer ? '#a96b22' : enabled ? '#28876c' : '#777782' });
}

async function result(status, detail) {
  await api.storage.local.set({
    // Store the source text, not a locale snapshot: the UI may reopen in another language.
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
  if (pending[item.id]?.manual) return;
  pending[item.id] = {
    url: item.url || '', finalUrl: item.finalUrl || '',
    referrer: item.referrer || ''
  };
  const keys = Object.keys(pending);
  for (const id of keys.slice(0, Math.max(0, keys.length - 120))) delete pending[id];
  await api.storage.local.set({ pending });
}

async function finished(delta) {
  if (delta.state?.current === 'interrupted') {
    const {pending = {}} = await api.storage.local.get('pending');
    if (pending[delta.id]?.manual) {
      delete pending[delta.id];
      await api.storage.local.set({pending});
      await result('error', 'Download da AppImage interrompido ou cancelado');
    }
    return;
  }
  if (delta.state?.current !== 'complete') return;
  const settings = await api.storage.local.get(['enabled', 'pending', 'processed']);
  const manual = Boolean(settings.pending?.[delta.id]?.manual);
  if ((!settings.enabled && !manual) || working.has(delta.id) ||
      (settings.processed || []).includes(delta.id)) return;
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
    if (!SUCCESSFUL_INTEGRATIONS.has(reply.status) && reply.status !== 'already_processed') {
      throw new Error('O Gear Lever não confirmou uma integração concluída');
    }

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
    await notifyIntegrated(item, reply);
  } catch (error) {
    await result('error', item.filename + ': ' + (error?.message || String(error)));
  } finally {
    working.delete(delta.id);
  }
}

api.downloads.onCreated.addListener(item => { void created(item); });
api.downloads.onChanged.addListener(delta => { void finished(delta); });
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.enabled || changes.updateStatus)) void badge();
});

async function checkGrabUpdates() {
  if (globalThis.GLGUpdate) {
    try { await globalThis.GLGUpdate.check(); } catch { /* Offline or host unavailable. */ }
  }
  await badge();
}

api.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'grab-commit-check') void checkGrabUpdates();
});
api.runtime.onInstalled.addListener(() => {
  void api.alarms.create('grab-commit-check', { periodInMinutes: 720, delayInMinutes: 1 });
  void checkGrabUpdates();
});
api.runtime.onStartup?.addListener(() => {
  void api.alarms.create('grab-commit-check', { periodInMinutes: 720, delayInMinutes: 1 });
  void checkGrabUpdates();
});
// In MV3 the worker may start for a download rather than onStartup.
void api.alarms.create('grab-commit-check', { periodInMinutes: 720, delayInMinutes: 1 });
void checkGrabUpdates();
