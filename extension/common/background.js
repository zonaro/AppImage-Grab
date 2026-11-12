// Background revision is loaded once when the browser starts the extension.
if (typeof importScripts === 'function' && !globalThis.GLGUpdate) {
  importScripts('build-revision.js', 'i18n.js', 'native-client.js', 'update-check.js',
    'notifications.js', 'activity-log.js',
    'page-offers.js', 'page-offer-background.js');
}
/* Chromium MV3 / Firefox MV3: observe completed downloads, never intercept. */
const api = globalThis.browser || globalThis.chrome;
const tr = globalThis.GLGI18n?.translate || (message => message);
const HOST = 'br.com.redclaw.gear_lever_grab';
const working = new Set();
const SUCCESSFUL_INTEGRATIONS = new Set([
  'integrated_by_gearlever', // The CLI alone accepts or rejects the AppImage.
  'integrated_with_source', 'integrated_without_source',
  'embedded_source_preserved', 'existing_source_preserved',
  'integrated_unlisted' // Gear Lever confirmed the copied file but CLI list is stale.
]);

async function logActivity(data) {
  try { await globalThis.GLGActivity?.record(data); }
  catch (error) { console.warn('Activity history unavailable:', error); }
}

async function notifyIntegrated(download, reply) {
  if (!SUCCESSFUL_INTEGRATIONS.has(reply.status)) return;
  const name = ((reply.installedPath || download.filename || '').split('/').pop() || 'AppImage').slice(0, 100);
  const unlisted = reply.status === 'integrated_unlisted';
  try {
    await GLGNotifications.emit({kind: 'integrationSuccess', id: 'glg-integrated-' + download.id,
      title: unlisted ? 'AppImage integrada; listagem pendente' : 'AppImage adicionada ao Gear Lever',
      message: unlisted
        ? name + ': o Gear Lever confirmou a integração, mas ainda não listou o aplicativo.'
        : name + ' foi integrada com sucesso.'});
  } catch (error) {
    // Notification/storage failures must not turn a real integration into an error.
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
  await logActivity({id: 'download-' + id, phase: 'download', status: 'downloading',
    filename: asset.name, detail: 'Download iniciado pelo usuário.', source: 'manual'});
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
    .catch(async error => {
      await logActivity({id: 'operation-' + Date.now() + '-' + Math.random().toString(36).slice(2),
        phase: 'download', status: 'error',
        filename: message?.fileName || 'AppImage',
        detail: 'Falha ao iniciar download: ' + String(error?.message || error),
        source: 'manual'});
      sendResponse({ok:false, error:tr(String(error?.message || error))});
    });
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
  await logActivity({id: 'download-' + item.id, phase: 'download', status: 'downloading',
    filename: item.filename, detail: 'Download detectado; aguardando conclusão.',
    source: 'automatic'});
}

async function finished(delta) {
  if (delta.state?.current === 'interrupted') {
    const {pending = {}} = await api.storage.local.get('pending');
    if (pending[delta.id]) {
      const manual = Boolean(pending[delta.id].manual);
      await logActivity({id: 'download-' + delta.id, phase: 'download',
        status: 'cancelled', filename: pending[delta.id].sourceName || 'AppImage',
        detail: 'Download interrompido ou cancelado.', source: manual ? 'manual' : 'automatic'});
      delete pending[delta.id];
      await api.storage.local.set({pending});
      if (manual) await result('error', 'Download da AppImage interrompido ou cancelado');
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
    await logActivity({id: 'download-' + delta.id, phase: 'integration',
      status: 'integrating', filename: item.filename,
      detail: 'Download concluído; aguardando resultado do Gear Lever.',
      source: manual ? 'manual' : 'automatic'});
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
    const details = reply.status === 'integrated_by_gearlever'
      ? 'Integração concluída pelo Gear Lever.'
      : reply.status === 'integrated_unlisted'
      ? 'Gear Lever confirmou a integração, mas ainda não listou o aplicativo; confira o gerenciador.'
      : reply.status === 'integrated_with_source'
      ? 'Integrado com atualizações: ' + reply.sourceOrigin
      : reply.status === 'embedded_source_preserved' || reply.status === 'existing_source_preserved'
        ? 'Integrado; fonte existente preservada'
        : reply.status === 'already_processed'
          ? 'Arquivo já processado'
          : 'Integrado sem fonte automática (origem não identificada)';
    await result('success', details);
    await logActivity({id: 'download-' + delta.id, phase: 'integration',
      status: reply.status === 'integrated_unlisted' ? 'warning'
        : reply.status === 'already_processed' ? 'skipped' : 'success',
      filename: item.filename, detail: details,
      source: manual ? 'manual' : 'automatic'});
    await notifyIntegrated(item, reply);
  } catch (error) {
    await result('error', item.filename + ': ' + (error?.message || String(error)));
    await logActivity({id: 'download-' + delta.id, phase: 'integration',
      status: 'error', filename: item.filename,
      detail: String(error?.message || error),
      source: manual ? 'manual' : 'automatic'});
    const name = (item.filename.split('/').pop() || 'AppImage').slice(0, 100);
    const partial = String(error?.message || '').includes('Integrado em ');
    void GLGNotifications.emit({kind: 'integrationError',
      id: 'glg-integration-error-' + delta.id,
      title: partial ? 'Integração parcial da AppImage' : 'Erro ao integrar AppImage',
      message: partial
        ? name + ': confira a fonte de atualização no gerenciador.'
        : name + ': abra o gerenciador para conferir o erro.'}).catch(() => {});
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

let appUpdateScan = null;
function checkAppUpdates(force = false) {
  if (appUpdateScan) return appUpdateScan;
  appUpdateScan = (async () => {
    if (!(await GLGNotifications.preferences()).updatesAvailable) return {status: 'disabled'};
    try {
      const [updates, installed] = await Promise.all([
        GLGNative.request({action: 'listUpdates'}),
        GLGNative.request({action: 'listInstalled'})
      ]);
      if (!Array.isArray(updates.apps) || !Array.isArray(installed.apps)) {
        throw new Error('Invalid Gear Lever update result');
      }
      const known = new Map(installed.apps.filter(app => typeof app.path === 'string')
        .map(app => [app.path, app]));
      const available = new Map();
      for (const app of updates.apps) {
        if (typeof app?.path !== 'string' || !known.has(app.path)) continue;
        const version = String(app.available_version || '').slice(0, 80);
        available.set(app.path, {name: known.get(app.path).name || 'AppImage',
          fingerprint: version || 'available', version});
      }
      const {appUpdateAlerts = {}} = await api.storage.local.get('appUpdateAlerts');
      const next = {};
      for (const [path, app] of available) {
        next[path] = app.fingerprint;
        if (appUpdateAlerts[path] === app.fingerprint) continue;
        const id = 'glg-app-update-' + await digestPath(path, app.fingerprint);
        await GLGNotifications.emit({kind: 'updatesAvailable', id,
          title: 'Atualização de AppImage disponível',
          message: String(app.name).slice(0, 100) +
            (app.version ? ': versão ' + app.version : ': nova versão confirmada pelo Gear Lever.')})
          .catch(error => console.warn('Update notification unavailable:', error));
      }
      await api.storage.local.set({appUpdateAlerts: Object.fromEntries(
        Object.entries(next).slice(-250)),
        lastAppUpdateCheck: {at: new Date().toISOString(), count: available.size, status: 'success'}});
      return {status: 'success', count: available.size};
    } catch (error) {
      await api.storage.local.set({lastAppUpdateCheck: {
        at: new Date().toISOString(), status: 'error', error: 'Gear Lever unavailable'}});
      return {status: 'error'};
    }
  })().finally(() => { appUpdateScan = null; });
  return appUpdateScan;
}

async function digestPath(path, version) {
  const bytes = new TextEncoder().encode(path + '\0' + version);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest).slice(0, 12),
    value => value.toString(16).padStart(2, '0')).join('');
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!['notificationDiagnostics', 'testNotification', 'checkAppUpdates',
    'startAppUpdate'].includes(message?.action)) return false;
  if (sender?.id !== api.runtime.id) return false;
  const operation = message.action === 'notificationDiagnostics'
    ? GLGNotifications.diagnostics()
    : message.action === 'testNotification'
      ? GLGNotifications.test()
      : message.action === 'checkAppUpdates'
        ? checkAppUpdates(true)
        : (async () => {
            if (typeof sender.url !== 'string' ||
                !sender.url.startsWith(api.runtime.getURL('manager.html'))) {
              throw new Error('Only the manager can update AppImages');
            }
            if (message.confirmed !== true || typeof message.path !== 'string') {
              throw new Error('Explicit confirmation and app path required');
            }
            const name = String(message.name || 'AppImage').slice(0, 100)
              .replace(/[\r\n]/g, ' ');
            const operationId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
            const activityId = 'operation-' + operationId;
            await logActivity({id: activityId, phase: 'update',
              status: 'integrating', filename: name,
              detail: 'Atualização manual iniciada.', source: 'update'});
            try {
              const reply = await GLGNative.request({action: 'updateApp',
                path: message.path, confirmed: true});
              if (reply.status !== 'updated' || reply.path !== message.path) {
                throw new Error('Gear Lever did not confirm the requested update');
              }
              await logActivity({id: activityId, phase: 'update',
                status: 'success', filename: name,
                detail: 'Atualização concluída pelo Gear Lever.', source: 'update'});
              await GLGNotifications.emit({kind: 'updatesCompleted',
                id: 'glg-update-completed-' + operationId,
                title: 'AppImage atualizada', message: name + ' foi atualizada com sucesso.'})
                .catch(error => console.warn('Update notification unavailable:', error));
              return {status: 'updated'};
            } catch (error) {
              await logActivity({id: activityId, phase: 'update',
                status: 'error', filename: name,
                detail: String(error?.message || error), source: 'update'});
              await GLGNotifications.emit({kind: 'updatesError',
                id: 'glg-update-error-' + operationId,
                title: 'Falha ao atualizar AppImage',
                message: name + ': confira os detalhes no gerenciador.'})
                .catch(() => {});
              throw error;
            }
          })();
  void operation.then(data => sendResponse({ok: true, ...data}))
    .catch(error => sendResponse({ok: false, error: String(error?.message || error)}));
  return true;
});

api.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'grab-commit-check') void checkGrabUpdates();
  if (alarm.name === 'grab-app-update-check') void checkAppUpdates();
});
api.runtime.onInstalled.addListener(() => {
  void api.alarms.create('grab-commit-check', { periodInMinutes: 720, delayInMinutes: 1 });
  void api.alarms.create('grab-app-update-check', { periodInMinutes: 720, delayInMinutes: 3 });
  void checkGrabUpdates();
});
api.runtime.onStartup?.addListener(() => {
  void api.alarms.create('grab-commit-check', { periodInMinutes: 720, delayInMinutes: 1 });
  void api.alarms.create('grab-app-update-check', { periodInMinutes: 720, delayInMinutes: 3 });
  void checkGrabUpdates();
});
// In MV3 the worker may start for a download rather than onStartup.
void api.alarms.create('grab-commit-check', { periodInMinutes: 720, delayInMinutes: 1 });
void api.alarms.create('grab-app-update-check', { periodInMinutes: 720, delayInMinutes: 3 });
void checkGrabUpdates();
