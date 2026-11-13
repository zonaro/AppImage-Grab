const api = globalThis.browser || globalThis.chrome;
const tr = globalThis.AIGI18n?.translate || (message => message);
const manifest = api.runtime.getManifest();
const versionLabel = document.querySelector('.version-label');
const buildCommit = typeof globalThis.AIG_BUILD_COMMIT === 'string' &&
  /^[0-9a-f]{40}$/i.test(globalThis.AIG_BUILD_COMMIT) ? globalThis.AIG_BUILD_COMMIT : '';
versionLabel.textContent = 'v' + (manifest.version_name || manifest.version) +
  (buildCommit ? ' · ' + buildCommit.slice(0, 12) : '');
versionLabel.title = buildCommit ? 'Build commit: ' + buildCommit : 'Build commit unavailable';
const toggle = document.getElementById('enabled');
const description = document.getElementById('description');
const activity = document.getElementById('activity');
const appsList = document.getElementById('apps-list');
const appsStatus = document.getElementById('apps-status');
const refreshButton = document.getElementById('refresh');
const popupError = document.getElementById('popup-error');
const backendSelect = document.getElementById('integration-backend');
const backendStatus = document.getElementById('backend-status');
const backendName = () => backendSelect.value === 'shelly' ? 'Shelly' : 'Gear Lever';

async function loadBackend() {
  const stored = await api.storage.local.get('integrationBackend');
  backendSelect.value = stored.integrationBackend === 'shelly' ? 'shelly' : 'gearlever';
  try {
    const info = await AIGNative.request({action: 'getBackends'});
    const available = info.available || {};
    // Preserve existing Gear Lever users. If unconfigured and only Shelly
    // exists, select Shelly on first popup opening.
    if (!stored.integrationBackend && !available.gearlever && available.shelly) {
      await api.storage.local.set({integrationBackend: 'shelly'});
      backendSelect.value = 'shelly';
    }
    backendStatus.textContent = available[backendSelect.value]
      ? backendName() + ' disponível. Os dois gerenciadores mantêm bibliotecas separadas.'
      : backendName() + ' não encontrado. Instale o gerenciador escolhido antes de integrar.';
  } catch (error) {
    backendStatus.textContent = 'Não foi possível detectar os gerenciadores: ' +
      String(error?.message || error).slice(0, 140);
  }
}
backendSelect.addEventListener('change', async () => {
  try {
    await api.storage.local.set({integrationBackend: backendSelect.value});
    await loadBackend();
    await loadApps();
    clearPopupError();
  } catch (error) {
    reportPopupError('Não foi possível trocar de gerenciador', error);
  }
});
void loadBackend().catch(error => reportPopupError('Preferência de gerenciador', error));

function reportPopupError(label, error) {
  const message = String(error?.message || error);
  // Unpacked extensions can be reloaded while their old popup is still open.
  // That popup is obsolete; warning in the old context only creates noise.
  if (/Extension context invalidated|context has been invalidated/i.test(message)) return;
  popupError.textContent = label + ': ' + message.slice(0, 400);
  popupError.hidden = false;
}

function clearPopupError() {
  popupError.hidden = true;
  popupError.textContent = '';
}

function render(data = {}) {
  toggle.checked = Boolean(data.enabled);
  description.textContent = toggle.checked ? 'ON · aguardando downloads' : 'OFF · downloads normais';
  const event = data.lastResult;
  if (!event) activity.textContent = 'Nenhuma atividade ainda.';
  else {
    const status = { working: 'Processando', success: 'Concluído', error: 'Erro' }[event.status] || event.status;
    const date = event.at ? new Date(event.at).toLocaleString(globalThis.AIGI18n?.locale || 'en') : '';
    activity.textContent = tr(status) + ' · ' + date + '\n' + tr(event.detail || '');
  }
}

async function loadApps() {
  refreshButton.disabled = true;
  appsStatus.textContent = 'Consultando ' + backendName() + '…';
  appsList.replaceChildren();
  try {
    const reply = await AIGNative.request({ action: 'listInstalled' });
    const apps = Array.isArray(reply.apps) ? reply.apps : [];
    appsStatus.textContent = apps.length ? apps.length + ' integrado(s) no ' + backendName()
      : 'Nenhuma AppImage integrada no ' + backendName();
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

void api.storage.local.get(['enabled', 'lastResult']).then(render)
  .catch(error => reportPopupError('Não foi possível carregar as preferências', error));
toggle.addEventListener('change', async () => {
  const requested = toggle.checked;
  try {
    await api.storage.local.set({enabled: requested});
    render(await api.storage.local.get(['enabled', 'lastResult']));
    clearPopupError();
  } catch (error) {
    toggle.checked = !requested;
    reportPopupError('Não foi possível alterar a integração automática', error);
  }
});
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.integrationBackend) {
    backendSelect.value = changes.integrationBackend.newValue === 'shelly' ? 'shelly' : 'gearlever';
    void loadBackend().catch(error => reportPopupError('Preferência de gerenciador', error));
    void loadApps();
  }
  if (area === 'local' && (changes.enabled || changes.lastResult)) {
    void api.storage.local.get(['enabled', 'lastResult']).then(render)
      .catch(error => reportPopupError('Falha ao atualizar o estado', error));
    if (changes.lastResult?.newValue?.status === 'success') void loadApps();
  }
});
refreshButton.addEventListener('click', loadApps);
async function openManager(path = '') {
  try {
    await api.tabs.create({url: api.runtime.getURL('manager.html') + path});
  } catch (error) {
    reportPopupError('Não foi possível abrir o gerenciador', error);
  }
}
document.getElementById('manage').addEventListener('click', () => {
  void openManager();
});
document.getElementById('manage-notifications').addEventListener('click', () => {
  void openManager('?view=notifications');
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
    ? 'New AppImage Grab commit available' : 'Reload your browser extension';
  const short = value => value ? value.slice(0, 12) : 'unknown';
  document.getElementById('update-details').textContent =
    'Extension: ' + short(status.bundleCommit) +
    ' · Native bridge: ' + short(status.hostCommit) +
    ' · Latest main: ' + short(status.latestCommit) +
    (status.needsReload ? '\nReload the extension after running the installer.' : '');
  document.getElementById('update-command').textContent = AIGUpdate.COMMAND;
}

void api.storage.local.get('updateStatus')
  .then(data => showGrabUpdate(data?.updateStatus))
  .catch(error => reportPopupError('Não foi possível ler as atualizações', error));
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.updateStatus) showGrabUpdate(changes.updateStatus.newValue);
});
document.getElementById('copy-updater').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(AIGUpdate.COMMAND);
    document.getElementById('copy-updater').textContent = 'Copied!';
  } catch {
    window.prompt(tr('Copy this command into your Linux terminal:'), AIGUpdate.COMMAND);
  }
});
// DOM Event.currentTarget is only valid while the event is being dispatched.
// Keep a stable button reference across await/finally, including failed checks.
const recheckButton = document.getElementById('recheck-updates');
recheckButton.addEventListener('click', async () => {
  if (recheckButton.disabled) return;
  recheckButton.disabled = true;
  try {
    showGrabUpdate(await AIGUpdate.check({force: true}));
    clearPopupError();
  } catch (error) {
    reportPopupError('Não foi possível verificar atualizações', error);
  } finally {
    recheckButton.disabled = false;
  }
});
void AIGUpdate.check().catch(error => reportPopupError('Falha na verificação de atualizações', error));


// The active repository suggestion is independent from automatic downloads.
// The user selects an asset, then the Install click is the installation consent.
let currentPageOffer = null;
const offerBox = document.getElementById('page-offer');
const offerSelect = document.getElementById('offer-asset');
const offerStatus = document.getElementById('offer-status');
const installOffer = document.getElementById('install-offer');
const suggestionsToggle = document.getElementById('suggestions-enabled');

function openOfferInManager() {
  if (!currentPageOffer) return;
  void openManager('?source=' + encodeURIComponent(currentPageOffer.source));
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
    // Unavailable background/native host is a recoverable popup condition.
    // Keep the regular controls usable and explain the failure without an
    // uncaught rejection or a noisy console warning on every popup open.
    reportPopupError('Não foi possível consultar sugestões de AppImage', error);
  }
}

installOffer.addEventListener('click',async () => {
  const asset=currentPageOffer?.choices?.[Number(offerSelect.value)];
  if (!asset || !currentPageOffer) return;
  installOffer.disabled=true;
  offerStatus.textContent='Iniciando download…';
  try {
    const result=await api.runtime.sendMessage({
      action:'startManagedDownload', link:currentPageOffer.source, assetUrl:asset.url
    });
    if (!result?.ok) throw Error(result?.error || 'Não foi possível iniciar o download');
    offerStatus.textContent='Download iniciado: '+result.name+
      '. Você receberá uma notificação após a confirmação do '+backendName()+'.';
  } catch(error) {
    offerStatus.textContent=error?.message || String(error);
  } finally {
    installOffer.disabled=false;
  }
});
document.getElementById('open-offer-manager').addEventListener('click',openOfferInManager);
void api.storage.local.get('suggestionsEnabled').then(data => {
  suggestionsToggle.checked=data?.suggestionsEnabled!==false;
}).catch(error => reportPopupError('Não foi possível ler as sugestões', error));
suggestionsToggle.addEventListener('change', () => {
  const requested = suggestionsToggle.checked;
  void (async () => {
    const {notificationPreferences = {}} = await api.storage.local.get('notificationPreferences');
    await api.storage.local.set({suggestionsEnabled: requested,
      notificationPreferences: {...notificationPreferences, suggestions: requested}});
    clearPopupError();
  })().catch(error => {
    suggestionsToggle.checked = !requested;
    reportPopupError('Não foi possível salvar as sugestões', error);
  });
});
// The suggestions toggle controls passive notifications, not the explicit
// install action shown for the current repository.
void loadPageOffer();
