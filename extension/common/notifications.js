/* Local WebExtensions notifications. No remote push service or page access. */
globalThis.GLGNotifications = (() => {
  const api = globalThis.browser || globalThis.chrome;
  const tr = globalThis.GLGI18n?.translate || (value => value);
  const DEFAULTS = Object.freeze({
    suggestions: true, integrationSuccess: true, integrationError: true,
    updatesAvailable: true, updatesCompleted: true, updatesError: true
  });
  const MAX_HISTORY = 50;
  let writing = Promise.resolve();

  async function preferences() {
    const saved = await api.storage.local.get(['notificationPreferences', 'suggestionsEnabled']);
    const values = {...DEFAULTS, ...(saved.notificationPreferences || {})};
    // Preserve the setting used by releases before the unified preferences UI.
    if (saved.notificationPreferences?.suggestions === undefined &&
        saved.suggestionsEnabled === false) values.suggestions = false;
    return values;
  }

  async function setPreference(kind, enabled) {
    if (!Object.hasOwn(DEFAULTS, kind)) throw new Error('Unknown notification category');
    const values = await preferences();
    values[kind] = Boolean(enabled);
    const next = {notificationPreferences: values};
    if (kind === 'suggestions') next.suggestionsEnabled = values.suggestions;
    await api.storage.local.set(next);
    return values;
  }

  function safe(value, length) {
    return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, length);
  }

  function record(entry) {
    writing = writing.catch(() => {}).then(async () => {
      const {notificationHistory = []} = await api.storage.local.get('notificationHistory');
      const history = Array.isArray(notificationHistory) ? notificationHistory : [];
      const old = history.find(item => item.id === entry.id);
      const merged = {...old, ...entry};
      if (old?.status === 'shown' && entry.status === 'requested') merged.status = 'shown';
      await api.storage.local.set({notificationHistory: [merged,
        ...history.filter(item => item.id !== entry.id)].slice(0, MAX_HISTORY)});
    });
    return writing;
  }

  async function permission() {
    try {
      if (typeof api.notifications?.getPermissionLevel === 'function') {
        return await api.notifications.getPermissionLevel();
      }
    } catch { /* Some browsers omit this optional API. */ }
    return 'unknown';
  }

  async function emit({kind, id, title, message, buttons, force = false}) {
    if (!Object.hasOwn(DEFAULTS, kind) && !force) throw new Error('Unknown notification category');
    if (!force && !(await preferences())[kind]) return {status: 'disabled'};
    const notificationId = safe(id, 450);
    const entry = {id: notificationId, kind, title: safe(title, 120),
      message: safe(message, 240), at: new Date().toISOString(), status: 'requested'};
    if (!notificationId) throw new Error('Notification ID required');
    const level = await permission();
    if (level === 'denied' || !api.notifications?.create) {
      await record({...entry, status: 'blocked'});
      return {status: 'blocked'};
    }
    await record(entry);
    const options = {type: 'basic', iconUrl: api.runtime.getURL('icons/icon-48.png'),
      title: tr(entry.title), message: tr(entry.message)};
    if (buttons?.length) options.buttons = buttons.map(button => ({title: tr(safe(button.title, 64))}));
    try {
      try { await api.notifications.create(notificationId, options); }
      catch (error) {
        if (!options.buttons) throw error;
        delete options.buttons; // Firefox/desktop backends may not support buttons.
        await api.notifications.create(notificationId, options);
      }
      // 'requested' deliberately does not claim the OS displayed the toast.
      return {status: 'requested', id: notificationId};
    } catch (error) {
      await record({...entry, status: 'error', error: safe(error?.message || error, 140)});
      console.warn('Gear Lever Grab notification unavailable:', error);
      return {status: 'error'};
    }
  }

  async function diagnostics() {
    const [settings, level] = await Promise.all([
      api.storage.local.get(['notificationHistory', 'lastAppUpdateCheck',
        'updateStatus', 'suggestedRepositories', 'lastSuggestionStatus']), permission()
    ]);
    let host = 'unavailable';
    try {
      if (globalThis.GLGNative?.request) {
        const reply = await GLGNative.request({action: 'ping'});
        host = reply?.ok ? 'ready' : 'unavailable';
      }
    } catch { /* Report state without exposing local service errors. */ }
    return {permission: level, host,
      history: Array.isArray(settings.notificationHistory) ? settings.notificationHistory : [],
      lastAppUpdateCheck: settings.lastAppUpdateCheck || null,
      lastSuggestionStatus: settings.lastSuggestionStatus || null,
      buildCommit: globalThis.GLG_BUILD_COMMIT || null,
      preferences: await preferences()};
  }

  api.notifications?.onShown?.addListener(id => {
    void (async () => {
      const {notificationHistory = []} = await api.storage.local.get('notificationHistory');
      const previous = notificationHistory.find(item => item.id === id);
      if (previous) await record({...previous, status: 'shown'});
    })().catch(() => {});
  });

  function openManager(id) {
    if (!/^glg-(integrated-|integration-error-|app-update-|update-completed-|update-error-)/.test(id)) return;
    const view = id.startsWith('glg-app-update-') ? '?view=updates' : '';
    void api.tabs.create({url: api.runtime.getURL('manager.html') + view});
  }
  api.notifications?.onClicked?.addListener(openManager);
  api.notifications?.onButtonClicked?.addListener(openManager);

  return Object.freeze({DEFAULTS, preferences, setPreference, emit, diagnostics,
    test: () => emit({kind: 'test', id: 'glg-test-' + Date.now(), force: true,
      title: 'Teste de notificação Gear Lever Grab',
      message: 'Se você está vendo esta mensagem, os avisos do navegador estão aparecendo.'})});
})();
