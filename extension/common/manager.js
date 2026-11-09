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
    if (state.checked && state.updatePaths.has(app.path)) title.append(node('span', 'badge update', 'Nova versão'));
    if (app.running === true) title.append(node('span', 'badge', 'Em execução'));
    description.append(title);

    const details = [app.current_version ? 'Versão: ' + app.current_version : 'Versão não informada',
      app.manager ? 'Fonte: ' + app.manager.replace('Updater', '') : 'Sem fonte de atualização'];
    description.append(node('div', 'app-details', details.join(' • ')));
    // Gear Lever's list-installed JSON includes the manager name, but not
    // existing source options. Those are loaded read-only by the Python host.
    const config = app.source_options || {};
    const origin = config.repo || config.repo_url || config.url || '';
    const pattern = config.repo_filename || config.filename || '';
    if (origin || pattern) {
      description.append(node('div', 'app-details source-details',
        [origin, pattern].filter(Boolean).join(' • ')));
    } else if (app.manager && app.source_status === 'embedded') {
      description.append(node('div', 'app-details', 'Fonte incorporada ao AppImage'));
    } else if (app.manager && app.source_status !== 'loaded') {
      description.append(node('div', 'app-details source-warning',
        'Configuração da fonte não pôde ser recuperada; somente leitura'));
    }
    const file = node('div', 'app-path', app.path);
    file.title = app.path;
    description.append(file);

    const actions = node('div', 'app-actions');
    // Only Gear Lever's --list-updates --json can confirm an available update.
    // Having a manager (GitHub, GitLab, etc.) does NOT imply a new version.
    if (state.checked && state.updatePaths.has(app.path)) {
      addButton(actions, 'Atualizar', () => updateApp(app), 'primary', app.running === true);
    }
    addButton(actions, app.embedded_source ? 'Fonte embutida' : 'Fonte', () => editSource(app),
      'secondary');
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
  // A refresh can change the files and their sources. Old update results must
  // not survive a manual refresh or a source edit.
  state.checked = false;
  state.updatePaths.clear();
  if (!keepNotice) notice('Aplicativos carregados.', 'success');
}

function refreshApps() {
  return withBusy(() => fetchApps(), 'Consultando aplicativos instalados…');
}

function checkUpdates() {
  return withBusy(async () => {
    state.checked = false;
    state.updatePaths.clear();
    const reply = await GLGNative.request({ action: 'listUpdates' });
    if (!Array.isArray(reply.apps)) throw new Error('A lista de atualizações do Gear Lever é inválida.');
    const installed = new Set(state.apps.map(app => app.path));
    state.updatePaths = new Set(reply.apps.map(app => app.path).filter(path => installed.has(path)));
    state.checked = true;
    notice(state.updatePaths.size + ' atualização(ões) confirmada(s) pelo Gear Lever.', 'success');
  }, 'Verificando atualizações no Gear Lever…');
}

async function updateApp(app) {
  if (!state.checked || !state.updatePaths.has(app.path)) return;
  if (!window.confirm('Atualizar "' + app.name + '" pelo Gear Lever? Uma nova verificação será feita antes de atualizar.')) return;
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

const EDITABLE_MANAGERS = new Set([
  'GithubUpdater', 'GitlabUpdater', 'CodebergUpdater', 'StaticFileUpdater'
]);

function editSource(app) {
  if (state.busy) return;
  state.editor = app;
  const existing = Boolean(app.manager);
  const loaded = app.source_status === 'loaded' && app.source_options;
  const editable = !app.embedded_source &&
    (!existing || (loaded && EDITABLE_MANAGERS.has(app.manager)));
  const config = loaded ? app.source_options : {};
  $('source-app').textContent = app.name + ' · ' + app.path;
  $('source-summary').textContent = existing
    ? 'Gerenciador existente no Gear Lever: ' + app.manager
    : 'Nenhuma fonte configurada no Gear Lever.';
  $('source-manager').value = EDITABLE_MANAGERS.has(app.manager)
    ? app.manager : 'GithubUpdater';
  $('source-repo').value = config.repo || config.repo_url || '';
  $('source-pattern').value = config.repo_filename || app.path.split('/').pop() || '';
  $('source-url').value = config.url || '';
  $('source-prerelease').checked = ['true', '1', 'yes', 'on']
    .includes(String(config.allow_prereleases || '').toLowerCase());
  $('source-manager').disabled = !editable;
  for (const id of ['source-repo', 'source-pattern', 'source-url', 'source-prerelease']) {
    $(id).disabled = !editable;
  }
  $('source-manager-row').hidden = !editable;
  $('repo-fields').hidden = !editable;
  $('static-fields').hidden = !editable;
  $('source-warning').hidden = editable;
  $('source-warning').textContent = app.embedded_source
    ? 'O Gear Lever usa uma fonte embutida neste AppImage, que não pode ser editada por aqui.'
    : !EDITABLE_MANAGERS.has(app.manager) && existing
      ? 'Este gerenciador não tem editor nesta extensão. As informações existentes permanecem preservadas.'
      : 'Não foi possível recuperar com segurança a configuração já existente do Gear Lever. Edição e remoção estão bloqueadas para evitar perda de dados.';
  $('unset-source').hidden = !editable || !existing;
  $('save-source').hidden = !editable;
  $('dialog-error').hidden = true;
  if (editable) syncEditor();
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
  if (!app || state.busy || $('save-source').hidden) return;
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
  if (!app || $('unset-source').hidden || !window.confirm('Remover a fonte personalizada de "' + app.name + '"?')) return;
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


// Explicit user-initiated downloads are independent from the automatic ON/OFF toggle.
let resolvedLink = '';
let resolvedAssets = [];
$('link-form').addEventListener('submit', async event => {
  event.preventDefault();
  const url = $('link-url').value.trim();
  $('link-resolve').disabled = true;
  $('link-choices').hidden = true;
  resolvedAssets = [];
  resolvedLink = '';
  $('link-feedback').textContent = 'Consultando a fonte…';
  try {
    const reply = await GLGNative.request({action: 'resolveLink', url});
    if (!Array.isArray(reply.choices) || !reply.choices.length) throw Error('Nenhuma AppImage compatível');
    resolvedAssets = reply.choices;
    resolvedLink = url;
    $('link-asset').replaceChildren();
    for (let i = 0; i < resolvedAssets.length; i++) {
      const option = document.createElement('option');
      option.value = String(i);
      option.textContent = resolvedAssets[i].name +
        (resolvedAssets[i].architecture ? ' · ' + resolvedAssets[i].architecture : ' · arquitetura não identificada');
      $('link-asset').append(option);
    }
    $('link-choices').hidden = false;
    $('link-feedback').textContent = resolvedAssets.length + ' AppImage(s) encontrada(s). Confira a arquitetura antes de baixar.';
  } catch (error) {
    $('link-feedback').textContent = 'Não foi possível identificar a fonte: ' + (error?.message || String(error));
  } finally {
    $('link-resolve').disabled = false;
  }
});
$('link-download').addEventListener('click', async () => {
  const choice = resolvedAssets[Number($('link-asset').value)];
  if (!choice || !resolvedLink) return;
  if (!window.confirm('Baixar "' + choice.name + '" de ' + choice.source +
      ' e adicionar ao Gear Lever? Confirme que você confia nesta origem.')) return;
  $('link-download').disabled = true;
  $('link-feedback').textContent = 'Iniciando download no navegador…';
  try {
    const result = await api.runtime.sendMessage({
      action:'startManagedDownload', link:resolvedLink, assetUrl:choice.url
    });
    if (!result?.ok) throw Error(result?.error || 'Falha ao iniciar download');
    $('link-feedback').textContent = 'Download iniciado: ' + result.name +
      '. Uma notificação confirmará quando o Gear Lever concluir a integração.';
  } catch (error) {
    $('link-feedback').textContent = 'Não foi possível baixar: ' + (error?.message || String(error));
  } finally {
    $('link-download').disabled = false;
  }
});
