/* Public catalogs are metadata, never an authority to execute an AppImage. */
globalThis.GLGCatalog = (() => {
  const POOL_FEED = 'https://appimage.github.io/feed.json';
  const DATABASE = 'https://raw.githubusercontent.com/AppImage/appimage.github.io/master/database/';
  const HUB_API = 'https://api.opendesktop.org/ocs/v1/';
  const HUB_SITE = 'https://www.appimagehub.com/p/';
  const APPIMAGE = /\.appimage$/i;

  function httpsUrl(value) {
    if (typeof value !== 'string' || value.length > 4096) return '';
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }

  function releaseSource(value) {
    let url = value;
    if (typeof url !== 'string') return '';
    if (/^[\w.-]+\/[\w.-]+\/?$/.test(url)) url = 'https://github.com/' + url;
    const safe = httpsUrl(url);
    if (!safe) return '';
    const parsed = new URL(safe);
    if (!['github.com', 'gitlab.com', 'codeberg.org'].includes(parsed.hostname)) return '';
    if (parsed.port || parsed.search || parsed.hash) return '';
    return safe;
  }

  function image(value, source) {
    if (source === 'pool') {
      if (typeof value !== 'string' || value.length > 300 ||
          value.split('/').some(part => !part || part === '..' || part === '.') ||
          !/^[\w.\-+/ ]+$/.test(value)) return '';
      return DATABASE + value.split('/').map(encodeURIComponent).join('/');
    }
    const safe = httpsUrl(value);
    if (!safe) return '';
    const host = new URL(safe).hostname;
    return host === 'images.pling.com' || host === 'www.opendesktop.org' ? safe : '';
  }

  function architecture(file) {
    const name = String(file || '').toLowerCase();
    if (/(?:^|[^a-z0-9])(aarch64|arm64)(?:[^a-z0-9]|$)/.test(name)) return 'ARM64';
    if (/(?:^|[^a-z0-9])(x86_64|amd64|x64)(?:[^a-z0-9]|$)/.test(name)) return 'x86_64';
    if (/(?:^|[^a-z0-9])(i386|i686|x86)(?:[^a-z0-9]|$)/.test(name)) return 'x86';
    return 'Não identificada';
  }

  function readable(value, max = 1500) {
    return typeof value === 'string'
      ? value.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, ' ')
        .replace(/\s+/g, ' ').trim().slice(0, max) : '';
  }

  function normalizePool(item, index) {
    if (!item || typeof item !== 'object' || !readable(item.name)) return null;
    const links = Array.isArray(item.links) ? item.links : [];
    const download = links.find(link => link?.type === 'Download');
    const github = links.find(link => link?.type === 'GitHub');
    const preferred = releaseSource(download?.url) || releaseSource(github?.url);
    const external = httpsUrl(download?.url) || releaseSource(github?.url) ||
      'https://appimage.github.io/';
    const pictures = Array.isArray(item.screenshots) ? item.screenshots : [];
    const icons = Array.isArray(item.icons) ? item.icons : [];
    return {
      id: 'pool:' + index, source: 'pool', name: readable(item.name, 140),
      description: readable(item.description),
      categories: (Array.isArray(item.categories) ? item.categories : []).filter(x => typeof x === 'string').map(x => readable(x, 70)).slice(0, 8),
      author: (Array.isArray(item.authors) ? item.authors : []).map(x => readable(x?.name, 80)).filter(Boolean).join(', '),
      license: readable(item.license, 100), image: image(icons[0], 'pool'),
      screenshots: pictures.slice(0, 6).map(pic => image(pic, 'pool')).filter(Boolean),
      sourceUrl: external, releaseUrl: preferred, files: [], score: null, changed: ''
    };
  }

  function hubFiles(item) {
    const files = [];
    for (let i = 1; i <= 10; i++) {
      const name = item?.['downloadname' + i];
      const url = httpsUrl(item?.['downloadlink' + i]);
      if (typeof name !== 'string' || name.length > 200 || !APPIMAGE.test(name) ||
          !/^[\w .()+\-]+\.appimage$/i.test(name) || !url) continue;
      files.push({ name, url, architecture: architecture(name), hosted: item['downloadway' + i] });
    }
    return files;
  }

  function normalizeHub(item) {
    if (!item || typeof item !== 'object' || !/^\d+$/.test(String(item.id))) return null;
    const files = hubFiles(item);
    if (!files.length || !readable(item.name)) return null;
    const categories = [readable(item.typename, 70)].filter(Boolean);
    const shots = [];
    for (let i = 1; i <= 5; i++) {
      const pic = image(item['previewpic' + i] || item['smallpreviewpic' + i], 'hub');
      if (pic && !shots.includes(pic)) shots.push(pic);
    }
    const score = Number(item.score);
    return {
      id: 'hub:' + item.id, hubId: Number(item.id), source: 'hub',
      name: readable(item.name, 140), description: readable(item.summary || item.description),
      categories, author: readable(item.personid, 80), license: readable(item.license, 100),
      image: image(item.smallpreviewpic1 || item.previewpic1, 'hub'), screenshots: shots,
      sourceUrl: HUB_SITE + item.id, releaseUrl: '', files,
      score: Number.isFinite(score) ? score : null, changed: typeof item.changed === 'string' ? item.changed : ''
    };
  }

  function unwrap(response) {
    if (!response || response.status !== 'ok' || !Array.isArray(response.data)) {
      throw Error('Resposta inválida do catálogo AppImageHub');
    }
    return response.data;
  }

  function hubCategories(response) {
    return unwrap(response).filter(item => item.xdg_type === 'bin' && /^\d+$/.test(String(item.id))).map(item => String(item.id));
  }

  function hubPageUrl(categories, page, query = '') {
    const url = new URL('content/data', HUB_API);
    url.searchParams.set('format', 'json');
    url.searchParams.set('sortmode', 'high');
    url.searchParams.set('pagesize', '100');
    url.searchParams.set('page', String(page)); // OCS pagination starts at zero.
    if (categories.length) url.searchParams.set('categories', categories.join(','));
    // Without a term OpenDesktop returns thousands of non-AppImage binaries;
    // its own "AppImage" search yields a focused, paginated starting catalog.
    url.searchParams.set('search', query.trim().slice(0, 100) || 'AppImage');
    return url.href;
  }

  return Object.freeze({POOL_FEED, HUB_API, httpsUrl, releaseSource, architecture,
    normalizePool, normalizeHub, hubFiles, unwrap, hubCategories, hubPageUrl});
})();
