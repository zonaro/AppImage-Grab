/* Gear Lever-like management flow in an extension tab. No shell or arbitrary paths. */
const api = globalThis.browser || globalThis.chrome;
const state = { apps: [], updatePaths: new Set(), checked: false, filter: 'all',
                query: '', busy: false, editor: null };
const $ = id => document.getElementById(id);

function node(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function notice(message = '', type = '') {
  $('notice').textContent = message;
  $('notice').className = 'notice' + (type ? ' ' + type : '');
}

function summary() {
  $('total-count').textContent = String(state.apps.length);
  $('sources-count').textContent = String(state.apps.filter(app => app.manager).length);
  $('updates-count').textContent = state.checked ? String(state.updatePaths.size) : '—';
  $('list-subtitle').textContent = state.apps.length + ' aplicativo(s) integrados ao Gear Lever';
}

function filters() {
  $('filter-all').classList.toggle('active', state.filter === 'all');
  $('filter-updates').classList.toggle('active', state.filter === 'updates');
  $('nav-installed').classList.toggle('active', state.filter === 'all');
  $('nav-updates').classList.toggle('active', state.filter === 'updates');
  $('breadcrumb').textContent = state.filter === 'updates' ? 'Atualizações' : 'Instalados';
  $('catalog-title').textContent = state.filter === 'updates' ? 'Atualizações disponíveis' : 'Aplicativos instalados';
}

function addButton(holder, label, action, style = 'secondary', disabled = false) {
  const button = node('button', 'button small ' + style, label);
  button.type = 'button';
  button.disabled = disabled || state.busy;
  button.addEventListener('click', action);
  holder.append(button);
  return button;
}

function render() {
  filters();
  summary();
  const content = $('apps');
  content.replaceChildren();
  const search = state.query.toLocaleLowerCase('pt-BR');
  const apps = state.apps
    .filter(app => state.filter !== 'updates' || state.updatePaths.has(app.path))
    .filter(app => ((app.name || '') + ' ' + (app.path || '') + ' ' + (app.manager || '')).toLocaleLowerCase('pt-BR').includes(search))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));

  if (!apps.length) {
    const message = state.filter === 'updates' && !state.checked
      ? 'Clique em "Verificar atualizações" para consultar o Gear Lever.'
      : state.filter === 'updates' ? 'Nenhuma atualização encontrada para este filtro.'
      : state.query ? 'Nenhum aplicativo corresponde à sua busca.'
      : 'Nenhuma AppImage integrada ao Gear Lever.';
    content.append(node('div', 'empty', message));
    return;
  }

  for (const app of apps) {
    const card = node('article', 'app-card');
    const avatar = node('span', 'app-icon', (app.name || '?').trim().charAt(0).toUpperCase());
    avatar.setAttribute('aria-hidden', 'true');
    const description = node('div', 'app-main');
    const title = node('div', 'app-title');
    title.append(node('strong', '', app.name || 'AppImage'));
    if (state.updatePaths.has(app.path)) title.append(node('span', 'badge update', 'Nova versão'));
    if (app.running === true) title.append(node('span', 'badge', 'Em execução'));
    description.append(title);

    const details = [app.current_version ? 'Versão: ' + app.current_version : 'Versão não informada',
      app.manager ? 'Fonte: ' + app.manager.replace('Updater', '') : 'Sem fonte de atualização'];
    description.append(node('div', 'app-details', details.join(' • ')));
    const file = node('div', 'app-path', app.path);
    file.title = app.path;
    description.append(file);

    const actions = node('div', 'app-actions');
    if (app.manager) {
      addButton(actions, 'Atualizar', () => updateApp(app), 'primary', app.running === true);
    }
    addButton(actions, app.embedded_source ? 'Fonte embutida' : 'Fonte', () => editSource(app),
      'secondary', Boolean(app.embedded_source));
    addButton(actions, 'Remover', () => removeApp(app), 'danger-outline', app.running === true);
    card.append(avatar, description, actions);
    content.append(card);
  }
}

async function withBusy(operation, label) {
  if (state.busy) return;
  state.busy = true;
  $('refresh').disabled = true;
  $('check-updates').disabled = true;
  notice(label);
  render();
  try {
    await operation();
  } catch (error) {
    notice(error?.message || String(error), 'error');
  } finally {
    state.busy = false;
    $('refresh').disabled = false;
    $('check-updates').disabled = false;
    render();
  }
}

async function fetchApps({ keepNotice = false } = {}) {
  const reply = await GLGNative.request({ action: 'listInstalled' });
  state.apps = Array.isArray(reply.apps) ? reply.apps : [];
  if (!keepNotice) notice('Aplicativos carregados.', 'success');
}

function refreshApps() {
  return withBusy(() => fetchApps(), 'Consultando aplicativos instalados…');
}

function checkUpdates() {
  return withBusy(async () => {
    const reply = await GLGNative.request({ action: 'listUpdates' });
    state.updatePaths = new Set((reply.apps || []).map(app => app.path).filter(Boolean));
    state.checked = true;
    notice(state.updatePaths.size + ' atualização(ões) encontrada(s).', 'success');
  }, 'Verificando atualizações no Gear Lever…');
}

async function updateApp(app) {
  if (!window.confirm('Atualizar "' + app.name + '" pelo Gear Lever? O download pode demorar.')) return;
  return withBusy(async () => {
    await GLGNative.request({ action: 'updateApp', path: app.path, confirmed: true });
    state.checked = false;
    state.updatePaths.clear();
    await fetchApps({ keepNotice: true });
    notice('Atualização concluída: ' + app.name, 'success');
  }, 'Atualizando ' + app.name + '…');
}

async function removeApp(app) {
  if (!window.confirm('Mover "' + app.name + '" para a lixeira usando o Gear Lever?')) return;
  return withBusy(async () => {
    await GLGNative.request({ action: 'removeApp', path: app.path, confirmed: true });
    state.updatePaths.delete(app.path);
    await fetchApps({ keepNotice: true });
    notice('Removido pelo Gear Lever: ' + app.name, 'success');
  }, 'Removendo ' + app.name + '…');
}

function syncEditor() {
  const manager = $('source-manager').value;
  $('repo-fields').hidden = manager === 'StaticFileUpdater';
  $('static-fields').hidden = manager !== 'StaticFileUpdater';
  $('pre-release-label').hidden = !['GithubUpdater', 'CodebergUpdater'].includes(manager);
  $('repo-label').firstChild.textContent =
    manager === 'GitlabUpdater' ? 'URL do projeto GitLab' : 'Repositório (usuário/repositório)';
  $('source-repo').placeholder = manager === 'GitlabUpdater'
    ? 'https://gitlab.com/grupo/projeto' : 'usuario/repositorio';
  $('dialog-error').hidden = true;
}

function editSource(app) {
  if (state.busy || app.embedded_source) return;
  state.editor = app;
  $('source-app').textContent = app.name + ' · ' + app.path;
  $('source-manager').value = ['GithubUpdater','GitlabUpdater','CodebergUpdater','StaticFileUpdater'].includes(app.manager)
    ? app.manager : 'GithubUpdater';
  $('source-repo').value = '';
  $('source-pattern').value = app.path.split('/').pop() || '';
  $('source-url').value = '';
  $('source-prerelease').checked = false;
  $('unset-source').hidden = !app.manager;
  $('dialog-error').hidden = true;
  syncEditor();
  $('source-dialog').showModal();
}

function editorOptions() {
  const manager = $('source-manager').value;
  if (manager === 'StaticFileUpdater') return { manager, options: { url: $('source-url').value.trim() } };
  const options = {
    repo_filename: $('source-pattern').value.trim(),
  };
  if (manager === 'GitlabUpdater') options.repo_url = $('source-repo').value.trim();
  else {
    options.repo = $('source-repo').value.trim();
    options.allow_prereleases = $('source-prerelease').checked ? 'true' : 'false';
  }
  return { manager, options };
}

async function saveSource(event) {
  event.preventDefault();
  const app = state.editor;
  if (!app || state.busy) return;
  const { manager, options } = editorOptions();
  if (app.manager && !window.confirm('Substituir a fonte de atualização de "' + app.name + '"?')) return;
  $('save-source').disabled = true;
  $('dialog-error').hidden = true;
  try {
    await GLGNative.request({ action: 'setSource', path: app.path, manager, options, confirmed: true });
    $('source-dialog').close();
    await fetchApps({ keepNotice: true });
    notice('Fonte salva no Gear Lever para ' + app.name, 'success');
    render();
  } catch (error) {
    $('dialog-error').textContent = error?.message || String(error);
    $('dialog-error').hidden = false;
  } finally {
    $('save-source').disabled = false;
  }
}

async function unsetSource() {
  const app = state.editor;
  if (!app || !window.confirm('Remover a fonte personalizada de "' + app.name + '"?')) return;
  $('unset-source').disabled = true;
  try {
    await GLGNative.request({ action: 'unsetSource', path: app.path, confirmed: true });
    $('source-dialog').close();
    await fetchApps({ keepNotice: true });
    notice('Fonte personalizada removida de ' + app.name, 'success');
    render();
  } catch (error) {
    $('dialog-error').textContent = error?.message || String(error);
    $('dialog-error').hidden = false;
  } finally {
    $('unset-source').disabled = false;
  }
}

function showUpdates() {
  state.filter = 'updates';
  render();
  if (!state.checked) void checkUpdates();
}

$('refresh').addEventListener('click', refreshApps);
$('check-updates').addEventListener('click', checkUpdates);
$('nav-installed').addEventListener('click', () => { state.filter = 'all'; render(); });
$('filter-all').addEventListener('click', () => { state.filter = 'all'; render(); });
$('nav-updates').addEventListener('click', showUpdates);
$('filter-updates').addEventListener('click', showUpdates);
$('search').addEventListener('input', event => { state.query = event.target.value; render(); });
$('source-manager').addEventListener('change', syncEditor);
$('source-form').addEventListener('submit', saveSource);
$('unset-source').addEventListener('click', unsetSource);
$('close-source').addEventListener('click', () => $('source-dialog').close());
$('cancel-source').addEventListener('click', () => $('source-dialog').close());

const toggle = $('enabled');
api.storage.local.get('enabled').then(settings => { toggle.checked = Boolean(settings.enabled); });
toggle.addEventListener('change', () => { void api.storage.local.set({ enabled: toggle.checked }); });
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enabled) toggle.checked = Boolean(changes.enabled.newValue);
});
void refreshApps();


// Separate app updates from Gear Lever Grab's own Git commit updates.
function renderGrabUpdate(update) {
  const banner = $('grab-update-banner');
  banner.hidden = !(update?.updateAvailable || update?.needsReload);
  if (banner.hidden) return;
  $('grab-update-title').textContent = update.updateAvailable
    ? 'A new Gear Lever Grab commit is available' : 'Reload the browser extension';
  $('grab-update-description').textContent =
    'Latest main: ' + (update.latestCommit?.slice(0, 12) || 'unknown') +
    ' • Extension: ' + (update.bundleCommit?.slice(0, 12) || 'unknown') +
    ' • Python bridge: ' + (update.hostCommit?.slice(0, 12) || 'unknown') +
    '. Re-run the installer, then reload the extension if it was loaded unpacked.';
}
$('grab-update-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(GLGUpdate.COMMAND);
    $('grab-update-copy').textContent = 'Copied!';
  } catch {
    window.prompt('Copy and run in your terminal:', GLGUpdate.COMMAND);
  }
});
api.storage.local.get('updateStatus').then(data => renderGrabUpdate(data.updateStatus));
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.updateStatus) renderGrabUpdate(changes.updateStatus.newValue);
});
void GLGUpdate.check();
