/* Notification preferences and local diagnostics in manager.html. */
globalThis.AIGNotificationUI = (() => {
  const api = globalThis.browser || globalThis.chrome;
  const tr = globalThis.AIGI18n?.translate || (value => value);
  const keys = ['suggestions', 'integrationSuccess', 'integrationError',
    'updatesAvailable', 'updatesCompleted', 'updatesError'];
  const inputs = Array.from(document.querySelectorAll('[data-notification]'));
  const $ = id => document.getElementById(id);

  function feedback(message, error = false) {
    $('notification-feedback').textContent = tr(message);
    $('notification-feedback').className = 'notice' + (error ? ' error' : ' success');
  }

  function renderHistory(history) {
    const holder = $('notification-history');
    holder.replaceChildren();
    if (!history.length) {
      const empty = document.createElement('li');
      empty.textContent = tr('Nenhuma notificação registrada.');
      holder.append(empty);
      return;
    }
    for (const event of history.slice(0, 50)) {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = tr(event.title || event.kind || 'Notificação');
      const message = document.createElement('span');
      message.textContent = tr(event.message || '');
      const info = document.createElement('small');
      const stamp = event.at && !Number.isNaN(Date.parse(event.at))
        ? new Date(event.at).toLocaleString(globalThis.AIGI18n?.locale || 'en') : '';
      info.textContent = stamp + ' · ' + tr({requested: 'Solicitada ao navegador',
        shown: 'Exibida (confirmada pela API)', blocked: 'Bloqueada',
        error: 'Erro ao solicitar'}[event.status] || event.status || '');
      if (event.error) info.textContent += ' · ' + event.error;
      item.append(title, message, info);
      holder.append(item);
    }
  }

  async function refresh() {
    try {
      const reply = await api.runtime.sendMessage({action: 'notificationDiagnostics'});
      if (!reply?.ok) throw new Error(reply?.error || 'Diagnostic unavailable');
      for (const input of inputs) input.checked = reply.preferences?.[input.dataset.notification] !== false;
      const level = reply.permission === 'denied' ? 'Bloqueada pelo navegador'
        : reply.permission === 'granted' ? 'Autorizada no navegador'
          : 'Permissão não consultável';
      const host = reply.host === 'ready' ? 'Conectado' : 'Indisponível';
      const last = reply.lastAppUpdateCheck;
      const scan = last ? (last.status === 'success'
        ? last.count + ' atualização(ões) na última checagem'
        : 'Última checagem falhou') : 'Nenhuma checagem de AppImages registrada';
      const suggestion = reply.lastSuggestionStatus?.status;
      const suggestionLabels = {disabled: 'Sugestões desativadas',
        cooldown: 'Sugestão já exibida nas últimas 24 horas',
        'no-assets': 'Nenhuma AppImage verificada nesse repositório',
        inactive: 'Você saiu da aba antes da sugestão',
        requested: 'Sugestão enviada ao navegador',
        blocked: 'Sugestão bloqueada pelo navegador',
        error: 'Erro ao verificar sugestão'};
      $('notification-diagnostics').textContent =
        tr('Permissão') + ': ' + tr(level) + ' · ' + tr('Serviço local') + ': ' + tr(host) + '\n' +
        tr('Build') + ': ' + String(reply.buildCommit || tr('desconhecido')).slice(0, 12) +
        ' · ' + tr(scan) + (suggestion ? '\n' + tr('Sugestões') + ': ' +
          tr(suggestionLabels[suggestion] || suggestion) : '');
      renderHistory(reply.history || []);
    } catch (error) { feedback('Diagnóstico indisponível: ' + (error?.message || error), true); }
  }

  for (const input of inputs) input.addEventListener('change', async () => {
    const kind = input.dataset.notification;
    if (!keys.includes(kind)) return;
    input.disabled = true;
    try {
      const {notificationPreferences = {}, suggestionsEnabled} = await api.storage.local.get(
        ['notificationPreferences', 'suggestionsEnabled']);
      const values = {...notificationPreferences};
      if (values.suggestions === undefined && suggestionsEnabled === false) values.suggestions = false;
      values[kind] = input.checked;
      const setting = {notificationPreferences: values};
      if (kind === 'suggestions') setting.suggestionsEnabled = input.checked;
      await api.storage.local.set(setting);
      feedback('Preferências salvas.');
    } catch (error) {
      input.checked = !input.checked;
      feedback('Não foi possível salvar as preferências.', true);
    } finally { input.disabled = false; }
  });

  $('notification-test').addEventListener('click', async () => {
    $('notification-test').disabled = true;
    try {
      const reply = await api.runtime.sendMessage({action: 'testNotification'});
      if (!reply?.ok || !reply.status) throw new Error(reply?.error || 'Test failed');
      feedback(reply.status === 'blocked' ? 'Notificações bloqueadas pelo navegador.'
        : reply.status === 'error' ? 'Falha ao solicitar a notificação.'
          : 'Aviso solicitado. Confira as notificações do seu desktop.', reply.status !== 'requested');
      await refresh();
    } catch (error) { feedback('Falha no teste: ' + (error?.message || error), true); }
    finally { $('notification-test').disabled = false; }
  });

  $('notification-check-updates').addEventListener('click', async () => {
    $('notification-check-updates').disabled = true;
    try {
      const reply = await api.runtime.sendMessage({action: 'checkAppUpdates'});
      if (!reply?.ok || reply.status === 'error') throw new Error(reply?.error || 'Gear Lever indisponível');
      feedback(reply.status === 'disabled' ? 'Ative avisos de atualização para verificar.'
        : reply.count + ' atualização(ões) confirmada(s) pelo Gear Lever.');
      await refresh();
    } catch (error) { feedback('Não foi possível verificar atualizações: ' + (error?.message || error), true); }
    finally { $('notification-check-updates').disabled = false; }
  });

  $('notification-clear-history').addEventListener('click', async () => {
    await api.storage.local.set({notificationHistory: []});
    feedback('Histórico limpo.');
    await refresh();
  });

  return Object.freeze({refresh, activate() {void refresh();}});
})();
