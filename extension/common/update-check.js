/* Commit-based update discovery for Gear Lever Grab. No automatic code execution. */
globalThis.GLGUpdate = (() => {
  const api = globalThis.browser || globalThis.chrome;
  const URL = 'https://api.github.com/repos/zonaro/gear-lever-grab/commits/main';
  const COMMAND = 'curl -fsSL https://raw.githubusercontent.com/zonaro/gear-lever-grab/main/install.sh | bash';
  const INTERVAL = 12 * 60 * 60 * 1000;
  const isSha = value => typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
  let inFlight = null;

  async function getBundleCommit() {
    if (isSha(globalThis.GLG_BUILD_COMMIT)) return globalThis.GLG_BUILD_COMMIT.toLowerCase();
    try {
      const response = await fetch(api.runtime.getURL('version.json'));
      if (response.ok) {
        const info = await response.json();
        if (isSha(info.commit)) return info.commit.toLowerCase();
      }
    } catch {
      // Pre-update or corrupted package: leave unknown rather than invent an ID.
    }
    return null;
  }

  async function getHostCommit() {
    try {
      if (!globalThis.GLGNative?.request) return null;
      const info = await globalThis.GLGNative.request({ action: 'getVersion' });
      return isSha(info.commit) ? info.commit.toLowerCase() : null;
    } catch {
      return null;
    }
  }

  function calculate(bundle, host, latest, checkedAt, error = '') {
    const newerBundle = Boolean(bundle && latest && bundle !== latest);
    const newerHost = Boolean(host && latest && host !== latest);
    const mismatch = Boolean(bundle && host && bundle !== host);
    return {
      bundleCommit: bundle, hostCommit: host, latestCommit: latest,
      checkedAt, updateAvailable: newerBundle || newerHost,
      needsReload: mismatch && !newerHost,
      bridgeUnavailable: !host, error
    };
  }

  async function check({ force = false } = {}) {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const bundle = await getBundleCommit();
      const { updateStatus: saved } = await api.storage.local.get('updateStatus');
      const now = Date.now();
      const shouldFetch = force || !saved?.checkedAt || now - saved.checkedAt >= INTERVAL;
      let latest = isSha(saved?.latestCommit) ? saved.latestCommit : null;
      let checkedAt = saved?.checkedAt || null;
      let error = '';
      if (shouldFetch) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 12000);
          let response;
          try {
            response = await fetch(URL, {
              headers: { 'Accept': 'application/vnd.github+json' },
              signal: controller.signal,
              cache: 'no-store'
            });
          } finally {
            clearTimeout(timeout);
          }
          if (!response.ok) throw new Error('GitHub HTTP ' + response.status);
          const payload = await response.json();
          if (!isSha(payload?.sha)) throw new Error('Unexpected GitHub commit response');
          latest = payload.sha.toLowerCase();
          checkedAt = now;
        } catch (problem) {
          error = String(problem?.message || problem);
          // Keep the last successful remote check, but do not clear an existing
          // update warning when a temporary network error occurs.
        }
      }
      const host = await getHostCommit();
      const status = calculate(bundle, host, latest, checkedAt, error);
      await api.storage.local.set({ updateStatus: status });
      return status;
    })();
    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  return Object.freeze({ check, calculate, COMMAND, INTERVAL });
})();
