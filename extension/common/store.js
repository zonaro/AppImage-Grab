/* AppImage store: metadata is untrusted; downloads require a second validation. */
globalThis.GLGStore = (() => {
  const api = globalThis.browser || globalThis.chrome;
  const tr = globalThis.GLGI18n?.translate || (message => message);
  const C = GLGCatalog;
  const $ = id => document.getElementById(id);
  const PAGE_SIZE = 24;
  const CACHE_MS = 15 * 60 * 1000;
  const s = {
    active: false, pool: [], hub: [], shownPool: PAGE_SIZE, shownHub: PAGE_SIZE, page: 0, moreHub: true,
    query: '', source: 'all', category: 'all', sort: 'name',
    poolLoading: false, hubLoading: false, poolError: '', hubError: '',
    selected: null, choices: [], selectionToken: 0, hubToken: 0, hubController: null,
    categories: [], categoriesPromise: null, poolCacheAt: 0, hubCache: new Map()
  };

  function elem(tag, className = '', value = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value;
    return element;
  }

  function attrImage(url, className, alt) {
    const img = elem('img', className);
    img.src = url;
    img.alt = alt;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { img.hidden = true; });
    return img;
  }

  function text(id, value) { $(id).textContent = value; }

  async function requestJson(url, signal, maxLength = 7_000_000) {
    const response = await fetch(url, {signal, cache: 'no-cache', credentials: 'omit'});
    if (!response.ok) throw Error('HTTP ' + response.status);
    const body = await response.text();
    if (body.length > maxLength) throw Error('Catálogo maior que o permitido');
    return JSON.parse(body);
  }

  function matches(app) {
    if (s.source !== 'all' && s.source !== app.source) return false;
    if (s.category !== 'all' && !app.categories.includes(s.category)) return false;
    if (!s.query) return true;
    const searchable = [app.name, app.description, app.author, ...app.categories].join(' ').toLocaleLowerCase(globalThis.GLGI18n?.locale || 'en');
    return searchable.includes(s.query.toLocaleLowerCase(globalThis.GLGI18n?.locale || 'en'));
  }

  function sorted(items) {
    if (s.sort === 'score') return items.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name, globalThis.GLGI18n?.locale || 'en'));
    if (s.sort === 'recent') return items.sort((a, b) => (b.changed || '').localeCompare(a.changed || '') || a.name.localeCompare(b.name, globalThis.GLGI18n?.locale || 'en'));
    return items.sort((a, b) => a.name.localeCompare(b.name, globalThis.GLGI18n?.locale || 'en'));
  }

  function renderCategories() {
    const category = $('store-category');
    const available = new Set([...s.pool, ...s.hub].flatMap(app => app.categories));
    if (s.category !== 'all' && !available.has(s.category)) s.category = 'all';
    category.replaceChildren();
    const all = elem('option', '', 'Todas as categorias'); all.value = 'all'; category.append(all);
    [...available].filter(Boolean).sort((a, b) => a.localeCompare(b, globalThis.GLGI18n?.locale || 'en')).forEach(name => {
      const option = elem('option', '', name); option.value = name; category.append(option);
    });
    category.value = s.category;
  }

  function openCard(app) {
    const card = elem('article', 'store-card');
    const image = elem('div', 'store-card-icon');
    if (app.image) image.append(attrImage(app.image, '', 'Ícone de ' + app.name));
    else image.append(elem('span', '', app.name.charAt(0).toUpperCase()));
    const body = elem('div', 'store-card-body');
    const badge = elem('span', 'store-badge', app.source === 'pool' ? 'AppImage Catalog' : 'AppImageHub');
    const title = elem('h3', '', app.name);
    const meta = elem('p', 'store-meta', app.categories.join(' · ') || 'AppImage');
    const description = elem('p', 'store-description', app.description || 'Sem descrição disponível.');
    const button = elem('button', 'button secondary', 'Ver detalhes');
    button.type = 'button';
    button.addEventListener('click', () => { void openDetails(app); });
    body.append(badge, title, meta, description, button);
    card.append(image, body);
    return card;
  }

  function render() {
    if (!s.active) return;
    text('store-pool-status', 'AppImage Catalog: ' + (s.poolLoading ? 'carregando…' : s.poolError ? 'erro · ' + s.poolError : s.pool.length + ' aplicativos'));
    text('store-hub-status', 'AppImageHub: ' + (s.hubLoading ? 'carregando…' : s.hubError ? 'erro · ' + s.hubError : s.hub.length + ' AppImages carregados'));
    renderCategories();
    const pool = s.pool.filter(matches);
    const hub = s.hub.filter(matches);
    const items = sorted([...pool.slice(0, s.shownPool), ...hub.slice(0, s.shownHub)]);
    const result = $('store-results');
    result.replaceChildren();
    for (const app of items) result.append(openCard(app));
    if (!items.length) {
      result.append(elem('div', 'store-empty', s.poolLoading || s.hubLoading
        ? 'Carregando aplicativos…' : s.poolError && s.hubError
          ? 'Não foi possível carregar os catálogos. Tente novamente.'
          : 'Nenhuma AppImage encontrada. Experimente outra busca ou fonte.'));
    }
    text('store-count', items.length + ' resultado(s) exibido(s) · ' + (pool.length + hub.length) + ' correspondência(s) carregada(s)');
    $('store-more').hidden = !(pool.length > s.shownPool || (s.source !== 'pool' && (hub.length > s.shownHub || s.moreHub)));
    $('store-more').disabled = s.hubLoading;
  }

  async function loadPool(force = false) {
    if (!force && s.pool.length && Date.now() - s.poolCacheAt < CACHE_MS) return;
    s.poolLoading = true; s.poolError = ''; render();
    try {
      const response = await requestJson(C.POOL_FEED);
      if (!response || !Array.isArray(response.items)) throw Error('Formato de feed inválido');
      s.pool = response.items.map(C.normalizePool).filter(Boolean);
      s.poolCacheAt = Date.now();
    } catch (error) { s.poolError = error?.message || String(error); }
    finally { s.poolLoading = false; render(); }
  }

  async function loadCategories() {
    if (!s.categoriesPromise) {
      s.categoriesPromise = requestJson(C.HUB_API + 'content/categories?format=json')
        .then(C.hubCategories)
        .then(categories => {
          if (!categories.length) throw Error('Categorias do AppImageHub indisponíveis');
          return categories;
        })
        .catch(error => { s.categoriesPromise = null; throw error; });
    }
    return s.categoriesPromise;
  }

  async function loadHub(reset = false, force = false) {
    if (reset) {
      s.hubController?.abort();
      s.hub = []; s.page = 0; s.shownHub = PAGE_SIZE; s.moreHub = true; s.hubError = '';
      if (force) s.hubCache.clear();
    }
    if (s.hubLoading && !reset) return;
    const token = ++s.hubToken;
    const controller = new AbortController();
    s.hubController = controller;
    s.hubLoading = true; render();
    try {
      const categories = await loadCategories();
      if (token !== s.hubToken) return;
      const url = C.hubPageUrl(categories, s.page, s.query);
      const cached = s.hubCache.get(url);
      const data = !force && cached && Date.now() - cached.at < CACHE_MS
        ? cached.data : C.unwrap(await requestJson(url, controller.signal));
      if (token !== s.hubToken) return;
      s.hubCache.set(url, {at: Date.now(), data});
      const apps = data.map(C.normalizeHub).filter(Boolean);
      const seen = new Set(s.hub.map(app => app.id));
      for (const app of apps) if (!seen.has(app.id)) { s.hub.push(app); seen.add(app.id); }
      s.moreHub = data.length >= 100;
      s.page += 1;
    } catch (error) {
      if (!controller.signal.aborted && token === s.hubToken) s.hubError = error?.message || String(error);
    } finally {
      if (token === s.hubToken) { s.hubLoading = false; render(); }
    }
  }

  function activate() {
    s.active = true;
    render();
    if (!s.pool.length && !s.poolLoading) void loadPool();
    if (!s.hub.length && !s.hubLoading) void loadHub(true);
  }

  function refresh() {
    s.shownPool = PAGE_SIZE;
    s.shownHub = PAGE_SIZE;
    return Promise.all([loadPool(true), loadHub(true, true)]);
  }

  async function more() {
    s.shownPool += PAGE_SIZE;
    s.shownHub += PAGE_SIZE;
    render();
    if (s.source !== 'pool' && s.moreHub && s.shownHub > s.hub.filter(matches).length) await loadHub();
  }

  function setChoices(choices, info = '') {
    s.choices = choices;
    const select = $('store-file');
    select.replaceChildren();
    for (let i = 0; i < choices.length; i++) {
      const choice = choices[i];
      const option = elem('option', '', choice.name + ' · ' + (choice.architecture || C.architecture(choice.name)));
      option.value = String(i);
      select.append(option);
    }
    select.disabled = !choices.length;
    $('store-detail-download').disabled = !choices.length;
    text('store-detail-status', info || (choices.length ? 'Selecione a arquitetura correta antes de baixar.' : 'Não há arquivo compatível para download direto. Abra a página de origem.'));
  }

  function detailsContent(app) {
    const body = $('store-detail-body'); body.replaceChildren();
    body.append(elem('p', 'store-detail-description', app.description || 'Sem descrição disponível.'));
    const facts = elem('div', 'store-facts');
    if (app.author) facts.append(elem('span', '', 'Autor: ' + app.author));
    if (app.license) facts.append(elem('span', '', 'Licença: ' + app.license));
    if (app.score !== null) facts.append(elem('span', '', 'Pontuação no catálogo: ' + app.score));
    body.append(facts);
    if (app.screenshots.length) {
      const gallery = elem('div', 'store-gallery');
      for (const url of app.screenshots) gallery.append(attrImage(url, '', 'Imagem de ' + app.name));
      body.append(gallery);
    }
  }

  function hubSupported(choice) {
    if (!choice || !C.httpsUrl(choice.url)) return false;
    const url = new URL(choice.url);
    let basename = '';
    try { basename = decodeURIComponent(url.pathname.split('/').pop()); } catch { return false; }
    if (basename !== choice.name) return false;
    return (/^files\d+\.pling\.com$/.test(url.hostname) &&
      url.pathname.startsWith('/api/files/download/j/') && String(choice.hosted) !== '0' &&
      !url.search && !url.hash) ||
      (Boolean(C.releaseSource(choice.url)) && /\.appimage$/i.test(url.pathname));
  }

  async function openDetails(app) {
    s.selected = app;
    const token = ++s.selectionToken;
    text('store-detail-title', app.name);
    text('store-detail-source', app.source === 'pool' ? 'APPIMAGE CATALOG / APPIMAGEPOOL' : 'APPIMAGEHUB');
    text('store-detail-category', app.categories.join(' · ') || 'AppImage');
    detailsContent(app);
    const external = $('store-detail-external');
    external.href = C.httpsUrl(app.sourceUrl) || 'https://appimage.github.io/';
    setChoices([], app.releaseUrl ? 'Buscando arquivos de release e arquiteturas…' : 'Consultando arquivos disponíveis…');
    $('store-dialog').showModal();
    if (app.source === 'hub') {
      setChoices(app.files.filter(hubSupported), 'Arquivos AppImage publicados no AppImageHub. Escolha a arquitetura e confirme a origem.');
      return;
    }
    if (!app.releaseUrl) { setChoices([]); return; }
    try {
      const response = await GLGNative.request({action: 'resolveLink', url: app.releaseUrl});
      if (token !== s.selectionToken) return;
      const files = Array.isArray(response.choices) ? response.choices.filter(choice =>
        typeof choice.name === 'string' && /\.appimage$/i.test(choice.name) && C.httpsUrl(choice.url)) : [];
      setChoices(files);
    } catch (error) {
      if (token === s.selectionToken) setChoices([], 'Não foi possível verificar o release: ' + (error?.message || String(error)));
    }
  }

  async function download() {
    const app = s.selected;
    const choice = s.choices[Number($('store-file').value)];
    if (!app || !choice) return;
    const button = $('store-detail-download');
    button.disabled = true;
    text('store-detail-status', 'Iniciando download no navegador…');
    try {
      const message = app.source === 'hub'
        ? {action: 'startCatalogDownload', contentId: app.hubId, fileName: choice.name, confirmed: true}
        : {action: 'startManagedDownload', link: app.releaseUrl, assetUrl: choice.url};
      const reply = await api.runtime.sendMessage(message);
      if (!reply?.ok) throw Error(reply?.error || 'Download não iniciado');
      text('store-detail-status', 'Download iniciado: ' + reply.name + '. A integração será confirmada pelo Gear Lever após concluir.');
    } catch (error) {
      text('store-detail-status', 'Falha ao baixar: ' + (error?.message || String(error)));
    } finally { button.disabled = false; }
  }

  $('store-retry').addEventListener('click', () => { void refresh(); });
  $('store-search').addEventListener('input', event => {
    s.query = event.target.value.trim().slice(0, 100);
    s.shownPool = PAGE_SIZE;
    render();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { void loadHub(true); }, 450);
  });
  $('store-source').addEventListener('change', event => { s.source = event.target.value; render(); });
  $('store-category').addEventListener('change', event => { s.category = event.target.value; render(); });
  $('store-sort').addEventListener('change', event => { s.sort = event.target.value; render(); });
  $('store-more').addEventListener('click', () => { void more(); });
  $('store-detail-close').addEventListener('click', () => { $('store-dialog').close(); ++s.selectionToken; });
  $('store-detail-download').addEventListener('click', () => { void download(); });
  let searchTimer;

  return Object.freeze({activate, refresh});
})();
