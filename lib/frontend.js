'use strict';
const fs = require('fs');
const path = require('path');

const MANIFEST = path.join(__dirname, '../public/app/.vite/manifest.json');

let manifest = null;

function load() {
  // in production the build never changes under a running server
  if (manifest && process.env.NODE_ENV === 'production') return manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    manifest = {};
  }
  return manifest;
}

/**
 * Files a page loads for one Vite entry: its script, the chunks it imports
 * (preloaded) and the stylesheets of all of them.
 */
function entry(name) {
  const m = load();
  const chunk = m[`src/${ name }.js`];
  if (!chunk) return { js: null, css: [], preload: [] };
  const css = new Set(chunk.css || []);
  const preload = new Set();
  const walk = keys => {
    for (const key of keys || []) {
      const c = m[key];
      if (!c || preload.has(c.file)) continue;
      preload.add(c.file);
      (c.css || []).forEach(f => css.add(f));
      walk(c.imports);
    }
  };
  walk(chunk.imports);
  return { js: chunk.file, css: [...css], preload: [...preload] };
}

module.exports = { entry };
