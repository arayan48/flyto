export { humanFileSize } from '../Upload/store/upload';

function pad(d) {
  return d < 10 ? '0' + d : d;
}

export function formatDate(value, withTime = true) {
  if (value === null || value === undefined || value === '') return '–';
  const dt = new Date(+value);
  if (isNaN(dt.getTime())) return '–';
  const day = `${ dt.getFullYear() }-${ pad(dt.getMonth() + 1) }-${ pad(dt.getDate()) }`;
  return withTime ? `${ day } ${ pad(dt.getHours()) }:${ pad(dt.getMinutes()) }` : day;
}

export function formatDuration(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor(seconds % 86400 / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  if (d) return `${ d }d ${ h }h`;
  if (h) return `${ h }h ${ m }m`;
  return `${ m }m`;
}

// "1.5 GB" or "1536 MB" style input back to bytes
export const UNITS = { MB: Math.pow(2, 20), GB: Math.pow(2, 30), TB: Math.pow(2, 40) };

export function splitBytes(bytes) {
  if (!bytes) return { value: '', unit: 'GB' };
  for (const unit of ['TB', 'GB', 'MB']) {
    const v = bytes / UNITS[unit];
    if (v >= 1 && Math.round(v * 100) / 100 === v) return { value: v, unit };
  }
  return { value: Math.round(bytes / UNITS.MB * 100) / 100, unit: 'MB' };
}

/**
 * Nested translation lookup with {placeholders}, falls back to the key.
 */
export function translate(lang, key, vars = {}) {
  let value = key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), lang);
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}

/**
 * Message for an API error, from lang.errors by code.
 */
export function errorMessage(lang, e) {
  if (!e) return '';
  const errors = (lang && lang.errors) || {};
  if (e.code && errors[e.code]) {
    return errors[e.code].replace(/\{(\w+)\}/g, (m, k) => (e.body && e.body[k] !== undefined ? e.body[k] : m));
  }
  return e.message || String(e);
}

export function userAgentLabel(ua) {
  if (!ua) return '–';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : /curl|wget|python|go-http/i.test(ua) ? ua.split(' ')[0] : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${ browser } · ${ os }` : browser;
}
