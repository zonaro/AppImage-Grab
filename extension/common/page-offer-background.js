/* Repository-page suggestions. Never auto-download from page visits.
 * A native resolver confirms release assets before a prompt is displayed.
 * Only explicit user actions in the popup/manager start a download.
 */
(() => {
  const api = globalThis.browser || globalThis.chrome;
  const tr = globalThis.AIGI18n?.translate || (message => message);
  if (!api?.tabs || !api?.notifications || !globalThis.AIGPageOffers ||
      !globalThis.AIGNotifications) return;

  const CACHE_MS = 15 * 60 * 1000;
  const NOTIFY_MS = 24 * 60 * 60 * 1000;
  const MAX_HISTORY = 80;
  const inFlight = new Map();
  const cache = new Map();
  const notifying = new Set();
  const PREFIX = 'aig-repo-offer:';

  function suggestionStatus(status) {
    return api.storage.local.set({lastSuggestionStatus: {
      status, at: new Date().toISOString()
    }});
  }

  async function resolveOffer(url) {
    const page = AIGPageOffers.parse(url);
    if (!page) return null;
    const cached = cache.get(page.source);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.offer;
    if (inFlight.has(page.source)) return inFlight.get(page.source);
    const request = (async () => {
      const reply = await AIGNative.request({action: 'resolveLink', url: page.source});
      const choices = Array.isArray(reply?.choices) ? reply.choices.filter(choice =>
        typeof choice?.url === 'string' && choice.url.startsWith('https://') &&
        typeof choice?.name === 'string' && /\.appimage$/i.test(choice.name)
      ) : [];
      const offer = choices.length ? {...page, choices} : null;
      cache.set(page.source, {at: Date.now(), offer});
      if (cache.size > 80) cache.delete(cache.keys().next().value);
      return offer;
    })();
    inFlight.set(page.source, request);
    try { return await request; }
    finally { inFlight.delete(page.source); }
  }

  async function activeOffer() {
    const tabs = await api.tabs.query({active:true,lastFocusedWindow:true});
    const tab = tabs.find(candidate => candidate.active && !candidate.incognito);
    if (!tab?.url || !AIGPageOffers.parse(tab.url)) return null;
    return resolveOffer(tab.url);
  }

  async function notifyIfAvailable(tab) {
    if (!tab?.active || tab.incognito || !AIGPageOffers.parse(tab.url)) return;
    const page = AIGPageOffers.parse(tab.url);
    if (notifying.has(page.key)) return;
    notifying.add(page.key);
    try {
      const settings = await api.storage.local.get(['suggestionsEnabled','suggestedRepositories']);
      if (settings.suggestionsEnabled === false) {
        await suggestionStatus('disabled'); return;
      }
      const previous = settings.suggestedRepositories || {};
      if (Date.now() - Number(previous[page.key] || 0) < NOTIFY_MS) {
        await suggestionStatus('cooldown'); return;
      }
      const offer = await resolveOffer(tab.url);
      if (!offer?.choices?.length) {await suggestionStatus('no-assets'); return;}
      // Avoid a notification after the user has navigated away.
      const current = await api.tabs.get(tab.id);
      if (!current?.active || AIGPageOffers.parse(current.url)?.key !== page.key) {
        await suggestionStatus('inactive'); return;
      }
      const count = offer.choices.length;
      const id = PREFIX + page.key;
      const options = {
        type:'basic',
        iconUrl:api.runtime.getURL('icons/icon-48.png'),
        title:tr('AppImage disponível neste repositório'),
        message:count === 1
          ? tr(offer.choices[0].name + ' pode ser adicionada ao gerenciador selecionado.')
          : tr(count + ' AppImages encontradas em ' + page.repository + '. Escolha a arquitetura correta.'),
        buttons:[{title: tr(count === 1 ? 'Ver e instalar' : 'Escolher AppImage')}]
      };
      const emitted = await AIGNotifications.emit({kind: 'suggestions', id,
        title: options.title, message: options.message, buttons: options.buttons});
      await suggestionStatus(emitted.status);
      if (!['requested', 'blocked'].includes(emitted.status)) return;
      const {suggestedRepositories = {}, offerNotifications = {}} =
        await api.storage.local.get(['suggestedRepositories','offerNotifications']);
      suggestedRepositories[page.key] = Date.now();
      offerNotifications[id] = {source:offer.source, at:Date.now()};
      const recent = obj => Object.fromEntries(Object.entries(obj)
        .sort((a,b) => Number((b[1]?.at || b[1])) - Number((a[1]?.at || a[1])))
        .slice(0, MAX_HISTORY));
      await api.storage.local.set({
        suggestedRepositories:recent(suggestedRepositories),
        offerNotifications:recent(offerNotifications)
      });
    } catch (error) {
      // Browser notifications are best-effort; never treat a page as installed.
      await suggestionStatus('error').catch(() => {});
      console.warn('AppImage Grab repository suggestion unavailable:', error);
    } finally {
      notifying.delete(page.key);
    }
  }

  async function openSuggestion(notificationId) {
    if (typeof notificationId !== 'string' || !notificationId.startsWith(PREFIX)) return;
    const {offerNotifications = {}} = await api.storage.local.get('offerNotifications');
    const record = offerNotifications[notificationId];
    const parsed = AIGPageOffers.parse(record?.source);
    if (!parsed || Date.now() - Number(record.at || 0) > 7 * NOTIFY_MS) return;
    await api.tabs.create({
      url:api.runtime.getURL('manager.html') + '?source=' + encodeURIComponent(parsed.source)
    });
    try { await api.notifications.clear(notificationId); } catch {}
  }

  api.tabs.onUpdated?.addListener((_id, changes, tab) => {
    if (changes.status === 'complete') void notifyIfAvailable(tab);
  });
  api.tabs.onActivated?.addListener(({tabId}) => {
    void api.tabs.get(tabId).then(notifyIfAvailable).catch(() => {});
  });
  api.notifications.onClicked?.addListener(id => {void openSuggestion(id);});
  api.notifications.onButtonClicked?.addListener(id => {void openSuggestion(id);});
  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action !== 'getPageOffer') return false;
    void activeOffer().then(offer => sendResponse({ok:true,offer}))
      .catch(error => sendResponse({ok:false,error:String(error?.message || error)}));
    return true;
  });

  // Catch an already open repository after installation, startup, or a
  // developer-mode reload (none of these should force a download).
  function scanActiveTab() {
    void api.tabs.query({active:true,lastFocusedWindow:true})
      .then(tabs => tabs.forEach(tab => {void notifyIfAvailable(tab);}))
      .catch(() => {});
  }
  api.runtime.onStartup?.addListener(scanActiveTab);
  api.runtime.onInstalled?.addListener(scanActiveTab);
  scanActiveTab();
})();
