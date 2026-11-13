/* Local installation/activity history, shared by Chromium and Firefox backgrounds.
 * Extension-local only: never synchronize, transmit or retain source URLs.
 */
globalThis.AIGActivity = (() => {
  const api = globalThis.browser || globalThis.chrome;
  const LIMIT = 200;
  let writing = Promise.resolve();

  function safe(value, max = 900) {
    return String(value ?? '')
      .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL omitida]')
      .replace(/\/(?:home|tmp|run|var|mnt)\/[^\s"'<>()[\]]+/g,
        path => '…/' + path.split('/').pop())
      .replace(/\b(?:token|password|authorization|secret|api[_-]?key)\s*[:=]\s*\S+/gi,
        '[credencial omitida]')
      .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ')
      .slice(0, max).trim();
  }

  function name(value) {
    const stripped = String(value ?? '').split(/[\\/]/).pop() || 'AppImage';
    return safe(stripped, 160);
  }

  function record({id, status, phase, filename, detail = '', source = 'automatic'}) {
    const key = safe(id, 120);
    if (!key || !/^(download-\d+|operation-[\w-]+)$/.test(key)) {
      return Promise.reject(new Error('Invalid activity ID'));
    }
    writing = writing.catch(() => {}).then(async () => {
      const {activityHistory = []} = await api.storage.local.get('activityHistory');
      const previous = (Array.isArray(activityHistory) ? activityHistory : [])
        .find(item => item.id === key);
      const at = new Date().toISOString();
      const entry = {
        id: key, at, startedAt: previous?.startedAt || at,
        status: ['queued', 'downloading', 'integrating', 'success', 'warning',
          'error', 'cancelled', 'skipped'].includes(status) ? status : 'error',
        phase: ['download', 'integration', 'update'].includes(phase) ? phase : 'integration',
        name: name(filename || previous?.name), detail: safe(detail),
        source: ['manual', 'automatic', 'update'].includes(source)
          ? source : (previous?.source || 'automatic')
      };
      await api.storage.local.set({activityHistory: [
        entry, ...(Array.isArray(activityHistory) ? activityHistory : [])
          .filter(item => item.id !== key)
      ].slice(0, LIMIT)});
    });
    return writing;
  }

  return Object.freeze({record, safe, name, LIMIT});
})();
