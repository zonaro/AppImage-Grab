/* Recognize repository/release pages from supported, explicit providers.
 * Only the URL is inspected; no page contents, cookies or tokens are read.
 * Keep matching narrowly scoped to paths supported by the native resolver.
 */
globalThis.AIGPageOffers = (() => {
  const PART = /^[A-Za-z0-9_.-]+$/;
  const valid = token => PART.test(token) && token !== '.' && token !== '..';
  const partsOf = path => path.split('/').filter(Boolean);

  function parse(value) {
    if (typeof value !== 'string' || value.length > 4096) return null;
    let parsed;
    try { parsed = new URL(value); } catch { return null; }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
        (parsed.port && parsed.port !== '443')) return null;
    let host = parsed.hostname.toLowerCase();
    if (host === 'www.github.com') host = 'github.com';
    if (!['github.com', 'gitlab.com', 'codeberg.org'].includes(host)) return null;
    // Never send URL parameters, fragments or embedded secrets to the host.
    const parts = partsOf(parsed.pathname);
    if (!parts.length || parts.some(part => !valid(part))) return null;

    if (host === 'github.com' || host === 'codeberg.org') {
      if (parts.length < 2) return null;
      const [owner, repo, ...rest] = parts;
      if (!valid(owner) || !valid(repo)) return null;
      const reserved = host === 'github.com'
        ? ['settings','login','logout','notifications','new','search','explore','topics','orgs','marketplace','apps']
        : ['explore','user','admin','issues','pulls','notifications'];
      if (reserved.includes(owner.toLowerCase())) return null;
      const isReleasePage = rest.length && (
        (rest.length === 1 && rest[0] === 'releases') ||
        (host === 'github.com' && rest.length === 2 &&
          rest[0] === 'releases' && rest[1] === 'latest') ||
        (rest.length === 3 && rest[0] === 'releases' &&
          rest[1] === 'tag' && valid(rest[2]))
      );
      const sections = host === 'github.com'
        ? ['tree','blob','issues','pull','pulls','actions','discussions','wiki','projects','commits','tags']
        : ['src','issues','pulls','actions','wiki','commits','projects'];
      if (rest.length && !isReleasePage && !sections.includes(rest[0])) return null;
      const base = 'https://' + host + '/' + owner + '/' + repo;
      return {
        // Internal repository pages always resolve the repository's latest
        // release; dedicated release pages preserve their selected version.
        source: base + (isReleasePage ? '/' + rest.join('/') : ''),
        key: host + ':' + owner.toLowerCase() + '/' + repo.toLowerCase(),
        provider: host === 'github.com' ? 'GitHub' : 'Codeberg',
        repository: owner + '/' + repo
      };
    }

    // GitLab supports nested groups and optionally /-/releases/<tag>.
    const separator = parts.indexOf('-');
    const projectParts = separator === -1 ? parts : parts.slice(0, separator);
    const extra = separator === -1 ? [] : parts.slice(separator + 1);
    if (projectParts.length < 2 || !projectParts.every(valid)) return null;
    if (['explore','users','dashboard','search','groups','help','admin','public'].includes(projectParts[0].toLowerCase())) return null;
    const releasePage = separator !== -1 && (
      (extra.length === 1 && extra[0] === 'releases') ||
      (extra.length === 2 && extra[0] === 'releases' && valid(extra[1]))
    );
    const gitlabSections = ['tree','blob','issues','merge_requests','pipelines','commits','tags','jobs','wikis'];
    if (separator !== -1 && !releasePage && !gitlabSections.includes(extra[0])) return null;
    const project = projectParts.join('/');
    return {
      source: 'https://gitlab.com/' + project +
        (releasePage ? '/-/' + extra.join('/') : ''),
      key: 'gitlab.com:' + project.toLowerCase(),
      provider: 'GitLab',
      repository: project
    };
  }

  return Object.freeze({parse});
})();
