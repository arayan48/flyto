const debug = require('debug')('flyto:update');
const { version } = require('../package.json');

const CHECK_INTERVAL = 12 * 3600 * 1000;

const state = {
  current: version,
  latest: null,
  url: null,
  publishedAt: null,
  checkedAt: null,
  updateAvailable: false,
};

function parse(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(v).trim());
  if (!m) return null;
  return { core: [+m[1], +m[2], +m[3]], pre: m[4] ? m[4].split('.') : [] };
}

// SemVer precedence: 1 if a > b, -1 if a < b, 0 if equal or unparsable
function compareVersions(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] > pb.core[i] ? 1 : -1;
  }
  // a release ranks above its own pre-releases
  if (!pa.pre.length && !pb.pre.length) return 0;
  if (!pa.pre.length) return 1;
  if (!pb.pre.length) return -1;
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) return +x > +y ? 1 : -1;
    if (nx !== ny) return nx ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

async function check(repo, fetchImpl = fetch) {
  // /releases/latest skips drafts and pre-releases
  const res = await fetchImpl(`https://api.github.com/repos/${ repo }/releases/latest`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'User-Agent': `flyto/${ state.current }`,
    },
    signal: AbortSignal.timeout(10000),
  });
  state.checkedAt = Date.now();
  if (res.status === 404) {
    debug(`no release published yet for ${ repo }`);
    return state;
  }
  if (!res.ok) throw new Error(`GitHub answered ${ res.status } ${ res.statusText }`);

  const release = await res.json();
  const wasKnown = state.latest === release.tag_name;
  state.latest = release.tag_name;
  state.url = release.html_url;
  state.publishedAt = release.published_at;
  state.updateAvailable = compareVersions(release.tag_name, state.current) > 0;

  if (state.updateAvailable && !wasKnown) {
    console.log(`Flyto ${ state.latest } is available (running v${ state.current }): ${ state.url }`);
  }
  return state;
}

// FLYTO_UPDATE_CHECK=false arrives as a string
function isEnabled(config) {
  return !!config.updateCheck && config.updateCheck !== 'false';
}

function start(config) {
  if (!isEnabled(config)) return;
  const run = () => check(config.updateCheckRepo)
    .catch(e => debug(`update check failed: ${ e.message }`));
  run();
  setInterval(run, CHECK_INTERVAL).unref();
}

module.exports = { state, check, start, isEnabled, compareVersions };
