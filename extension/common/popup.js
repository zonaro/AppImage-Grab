const api = globalThis.browser || globalThis.chrome;
const tr = globalThis.GLGI18n?.translate || (message => message);
const manifest = api.runtime.getManifest();
const versionLabel = document.querySelector('.version-label');
const buildCommit = typeof globalThis.GLG_BUILD_COMMIT === 'string' &&
  /^[0-9a-f]{40}$/i.test(globalThis.GLG_BUILD_COMMIT) ? globalThis.GLG_BUILD_COMMIT : '';
versionLabel.textContent = 'v' + (manifest.version_name || manifest.version) +
  (buildCommit ? ' · ' + buildCommit.slice(0, 12) : '');
versionLabel.title = buildCommit ? 'Build commit: ' + buildCommit : 'Build commit unavailable';
const toggle = document.getElementById('enabled');
const description = document.getElementById('description');
const activity = document.getElementById('activity');
const appsList = document.getElementById('apps-list');
const appsStatus = document.getElementById('apps-status');
const refreshButton = document.getElementById('refresh');

function render(data) {
  toggle.checked = Boolean(data.enabled);
  description.textContent = toggle.checked ? 'ON · aguardando downloads' : 'OFF · downloads normais';
  const event = data.lastResult;
  if (!event) activity.textContent = 'Nenhuma atividade ainda.';
  else {
    const status = { working: 'Processando', success: 'Concluído', error: 'Erro' }[event.status] || event.status;
    const date = event.at ? new Date(event.at).toLocaleString(globalThis.GLGI18n?.locale || 'en') : '';
    activity.textContent = tr(status) + ' · ' + date + '\n' + tr(event.detail || '');
  }
}

async function loadApps() {
  refreshButton.disabled = true;
  appsStatus.textContent = 'Consultando o Gear Lever…';
  appsList.replaceChildren();
  try {
    const reply = await GLGNative.request({ action: 'listInstalled' });
    const apps = Array.isArray(reply.apps) ? reply.apps : [];
    appsStatus.textContent = apps.length ? apps.length + ' integrado(s)' : 'Nenhuma AppImage integrada';
    for (const app of apps.slice(0, 4)) {
      const li = document.createElement('li');
      const avatar = document.createElement('span');
      avatar.className = 'app-avatar';
      avatar.textContent = (app.name || '?').trim()[0]?.toUpperCase() || '?';
      const info = document.createElement('div');
      info.className = 'app-info';
      const name = document.createElement('strong');
      name.textContent = app.name || 'AppImage';
      const version = document.createElement('span');
      version.textContent = [app.current_version, app.manager || 'Sem fonte de atualização'].filter(Boolean).join(' · ');
      info.append(name, version);
      li.append(avatar, info);
      appsList.append(li);
    }
    if (apps.length > 4) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = 'Mais ' + (apps.length - 4) + ' no gerenciador…';
      appsList.append(li);
    }
  } catch (error) {
    appsStatus.textContent = error?.message || String(error);
  } finally {
    refreshButton.disabled = false;
  }
}

api.storage.local.get(['enabled', 'lastResult']).then(render);
toggle.addEventListener('change', async () => {
  await api.storage.local.set({ enabled: toggle.checked });
  render(await api.storage.local.get(['enabled', 'lastResult']));
});
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.enabled || changes.lastResult)) {
    void api.storage.local.get(['enabled', 'lastResult']).then(render);
    if (changes.lastResult?.newValue?.status === 'success') void loadApps();
  }
});
refreshButton.addEventListener('click', loadApps);
document.getElementById('manage').addEventListener('click', () => {
  void api.tabs.create({ url: api.runtime.getURL('manager.html') });
});
document.getElementById('manage-notifications').addEventListener('click', () => {
  void api.tabs.create({url: api.runtime.getURL('manager.html') + '?view=notifications'});
});
void loadApps();


// Commit-based update notices operate regardless of the AppImage automation toggle.
function showGrabUpdate(status) {
  const panel = document.getElementById('update-notice');
  if (!status) return;
  const available = Boolean(status.updateAvailable || status.needsReload);
  panel.hidden = !available;
  if (!available) return;
  document.getElementById('update-title').textContent = status.updateAvailable
    ? 'New Gear Lever Grab commit available' : 'Reload your browser extension';
  const short = value => value ? value.slice(0, 12) : 'unknown';
  document.getElementById('update-details').textContent =
    'Extension: ' + short(status.bundleCommit) +
    ' · Native bridge: ' + short(status.hostCommit) +
    ' · Latest main: ' + short(status.latestCommit) +
    (status.needsReload ? '\nReload the extension after running the installer.' : '');
  document.getElementById('update-command').textContent = GLGUpdate.COMMAND;
}

api.storage.local.get('updateStatus').then(({ updateStatus }) => showGrabUpdate(updateStatus));
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.updateStatus) showGrabUpdate(changes.updateStatus.newValue);
});
document.getElementById('copy-updater').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(GLGUpdate.COMMAND);
    document.getElementById('copy-updater').textContent = 'Copied!';
  } catch {
    window.prompt(tr('Copy this command into your Linux terminal:'), GLGUpdate.COMMAND);
  }
});
document.getElementById('recheck-updates').addEventListener('click', async event => {
  event.currentTarget.disabled = true;
  try { showGrabUpdate(await GLGUpdate.check({force: true})); }
  finally { event.currentTarget.disabled = false; }
});
void GLGUpdate.check();


// The active repository suggestion is independent from automatic downloads.
// The user must select the asset and confirm each installation.
let currentPageOffer = null;
const offerBox = document.getElementById('page-offer');
const offerSelect = document.getElementById('offer-asset');
const offerStatus = document.getElementById('offer-status');
const installOffer = document.getElementById('install-offer');
const suggestionsToggle = document.getElementById('suggestions-enabled');

function openOfferInManager() {
  if (!currentPageOffer) return;
  void api.tabs.create({
    url:api.runtime.getURL('manager.html') + '?source=' +
      encodeURIComponent(currentPageOffer.source)
  });
}

async function loadPageOffer() {
  offerBox.hidden = true;
  currentPageOffer = null;
  try {
    const reply = await api.runtime.sendMessage({action:'getPageOffer'});
    if (!reply?.ok || !reply.offer?.choices?.length) return;
    currentPageOffer = reply.offer;
    document.getElementById('offer-provider').textContent =
      currentPageOffer.provider + ' · ' + currentPageOffer.repository;
    document.getElementById('offer-description').textContent =
      currentPageOffer.choices.length === 1
        ? 'Uma AppImage disponível nesta página.'
        : currentPageOffer.choices.length + ' AppImages disponíveis neste repositório.';
    offerSelect.replaceChildren();
    currentPageOffer.choices.forEach((asset,index) => {
      const option=document.createElement('option');
      option.value=String(index);
      option.textContent=asset.name + ' · ' + (asset.architecture || 'arquitetura não identificada');
      offerSelect.append(option);
    });
    offerStatus.textContent='Escolha a arquitetura correta antes de instalar.';
    offerBox.hidden=false;
  } catch (error) {
    // No host / unsupported page: don't replace the normal popup with an error.
    console.warn('Gear Lever Grab page suggestion unavailable:',error);
  }
}

installOffer.addEventListener('click',async () => {
  const asset=currentPageOffer?.choices?.[Number(offerSelect.value)];
  if (!asset || !currentPageOffer) return;
  const description = asset.name + ' (' +
    (asset.architecture || 'arquitetura não identificada') + ')';
  if (!window.confirm(tr('Baixar '+description+' e integrar ao Gear Lever?\n' +
      'Confirme que você confia em '+currentPageOffer.provider+'.'))) return;
  installOffer.disabled=true;
  offerStatus.textContent='Iniciando download…';
  try {
    const result=await api.runtime.sendMessage({
      action:'startManagedDownload', link:currentPageOffer.source, assetUrl:asset.url
    });
    if (!result?.ok) throw Error(result?.error || 'Não foi possível iniciar o download');
    offerStatus.textContent='Download iniciado: '+result.name+
      '. Você receberá uma notificação após a confirmação do Gear Lever.';
  } catch(error) {
    offerStatus.textContent=error?.message || String(error);
  } finally {
    installOffer.disabled=false;
  }
});
document.getElementById('open-offer-manager').addEventListener('click',openOfferInManager);
api.storage.local.get('suggestionsEnabled').then(data => {
  suggestionsToggle.checked=data.suggestionsEnabled!==false;
});
suggestionsToggle.addEventListener('change',() => {
  void (async () => {
    const {notificationPreferences = {}} = await api.storage.local.get('notificationPreferences');
    await api.storage.local.set({suggestionsEnabled: suggestionsToggle.checked,
      notificationPreferences: {...notificationPreferences, suggestions: suggestionsToggle.checked}});
  })();
});
// The suggestions toggle controls passive notifications, not the explicit
// install action shown for the current repository.
void loadPageOffer();
