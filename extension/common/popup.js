const api = globalThis.browser || globalThis.chrome;
const toggle = document.getElementById('enabled');
const description = document.getElementById('description');
const activity = document.getElementById('activity');

function render(data) {
  toggle.checked = Boolean(data.enabled);
  description.textContent = toggle.checked ? 'Ativada — aguardando AppImages' : 'Desativada';
  const event = data.lastResult;
  if (!event) {
    activity.textContent = 'Nenhuma atividade ainda.';
  } else {
    const status = { working: 'Processando', success: 'Concluído', error: 'Erro' }[event.status] || event.status;
    const date = event.at ? new Date(event.at).toLocaleString('pt-BR') : '';
    activity.textContent = status + ' · ' + date + '\n' + (event.detail || '');
  }
}
api.storage.local.get(['enabled', 'lastResult']).then(render);
toggle.addEventListener('change', async () => {
  await api.storage.local.set({ enabled: toggle.checked });
  render(await api.storage.local.get(['enabled', 'lastResult']));
});
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.enabled || changes.lastResult))
    void api.storage.local.get(['enabled', 'lastResult']).then(render);
});
