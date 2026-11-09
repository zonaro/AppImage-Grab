const api = globalThis.browser || globalThis.chrome;
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
    const date = event.at ? new Date(event.at).toLocaleString('pt-BR') : '';
    activity.textContent = status + ' · ' + date + '\n' + (event.detail || '');
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
    window.prompt('Copy this command into your Linux terminal:', GLGUpdate.COMMAND);
  }
});
document.getElementById('recheck-updates').addEventListener('click', async event => {
  event.currentTarget.disabled = true;
  try { showGrabUpdate(await GLGUpdate.check({force: true})); }
  finally { event.currentTarget.disabled = false; }
});
void GLGUpdate.check();
