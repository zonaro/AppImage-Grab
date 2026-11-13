/* Read-only installation history and Native Messaging diagnostics UI. */
globalThis.AIGActivityUI = (() => {
  const api = globalThis.browser || globalThis.chrome;
  const tr = globalThis.AIGI18n?.translate || (value => value);
  const $ = id => document.getElementById(id);
  let entries = [];
  let hostEntries = [];
  let loaded = false;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = tr(String(text));
    return node;
  }

  function date(value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toLocaleString(
      globalThis.AIGI18n?.locale || 'pt-BR') : String(value || '');
  }

  const statusNames = {
    queued: 'Aguardando', downloading: 'Baixando', integrating: 'Integrando',
    success: 'Concluído', warning: 'Pendente', error: 'Erro',
    cancelled: 'Cancelado', skipped: 'Já processado'
  };
  const phaseNames = {download: 'Download', integration: 'Integração', update: 'Atualização'};

  function filtered() {
    const query = $('history-search').value.trim().toLocaleLowerCase();
    const filter = $('history-filter').value;
    return entries.filter(item => {
      const matches = filter === 'all' ||
        (filter === 'progress' && ['queued','downloading','integrating'].includes(item.status)) ||
        item.status === filter;
      return matches && (!query || [item.name, item.detail, item.phase]
        .join(' ').toLocaleLowerCase().includes(query));
    });
  }

  function render() {
    const list = $('history-list');
    list.replaceChildren();
    const visible = filtered();
    $('history-status').textContent = tr('{{count}} registro(s) encontrado(s).'
      .replace('{{count}}', visible.length));
    if (!visible.length) {
      list.append(element('div', 'empty', 'Nenhum registro encontrado para este filtro.'));
      return;
    }
    for (const item of visible) {
      const card = element('details', 'activity-entry');
      const summary = element('summary', 'activity-summary');
      const tag = element('span', 'activity-status ' + String(item.status || ''), statusNames[item.status] || item.status);
      const info = element('div', 'activity-info');
      info.append(element('strong', '', item.name || 'AppImage'),
        element('small', '', (phaseNames[item.phase] || item.phase || 'Integração') + ' · ' + date(item.at)));
      summary.append(tag, info, element('span', 'activity-expand', 'Detalhes'));
      card.append(summary);
      const detail = element('pre', 'activity-detail', item.detail || 'Sem detalhes adicionais.');
      card.append(detail);
      list.append(card);
    }
  }

  function renderHost() {
    const list = $('host-log-list');
    list.replaceChildren();
    $('host-log-status').textContent = tr('{{count}} erro(s) do serviço local.'
      .replace('{{count}}', hostEntries.length));
    if (!hostEntries.length) {
      list.append(element('div', 'empty', 'Nenhum erro anterior encontrado no log local.'));
      return;
    }
    for (const item of [...hostEntries].reverse()) {
      const row = element('article', 'activity-host-row');
      const head = element('div', 'activity-host-meta');
      head.append(element('strong', '', item.level === 'ERROR' ? 'Erro' : 'Aviso'),
        element('small', '', String(item.at || '')));
      row.append(head, element('pre', 'activity-detail', item.detail || ''));
      list.append(row);
    }
  }

  async function refresh() {
    try {
      const data = await api.storage.local.get('activityHistory');
      entries = (Array.isArray(data.activityHistory) ? data.activityHistory : [])
        .filter(item => item && typeof item === 'object')
        .sort((a,b) => Date.parse(b.at || '') - Date.parse(a.at || '')).slice(0, 200);
      render();
    } catch (error) {
      $('history-status').textContent = tr('Não foi possível ler o histórico: ') + String(error?.message || error);
    }
  }

  async function refreshHost() {
    $('host-log-refresh').disabled = true;
    try {
      const result = await globalThis.AIGNative.request({action: 'getHostLog'});
      hostEntries = Array.isArray(result.entries) ? result.entries.slice(-80) : [];
      renderHost();
    } catch (error) {
      $('host-log-status').textContent = tr('Serviço local indisponível: ') + String(error?.message || error);
      hostEntries = [];
      $('host-log-list').replaceChildren();
    } finally { $('host-log-refresh').disabled = false; }
  }

  async function copyReport() {
    const lines = ['AppImage Grab — histórico local',
      ...filtered().map(item =>
        [date(item.at), item.status, item.phase, item.name, item.detail].join(' | ')),
      '', 'Log do serviço local (host.log; não é log interno do Gear Lever)',
      ...hostEntries.map(item => [item.at, item.level, item.detail].join(' | '))];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      $('history-status').textContent = tr('Relatório copiado.');
    } catch (error) {
      $('history-status').textContent = tr('Não foi possível copiar: ') + String(error?.message || error);
    }
  }

  async function clearHistory() {
    if (!window.confirm(tr('Limpar os registros de instalação deste navegador? O log do serviço local será preservado.'))) return;
    await api.storage.local.set({activityHistory: []});
    await refresh();
    $('history-status').textContent = tr('Histórico limpo.');
  }

  $('history-search').addEventListener('input', render);
  $('history-filter').addEventListener('change', render);
  $('history-refresh').addEventListener('click', () => {void refresh();});
  $('host-log-refresh').addEventListener('click', () => {void refreshHost();});
  $('history-copy').addEventListener('click', () => {void copyReport();});
  $('history-clear').addEventListener('click', () => {void clearHistory();});
  api.storage.onChanged?.addListener((changes, area) => {
    if (area === 'local' && changes.activityHistory && loaded) void refresh();
  });

  return Object.freeze({activate() {
    loaded = true;
    void refresh();
    void refreshHost();
  }, refresh() {
    void refresh();
    void refreshHost();
  }});
})();
