// JSON calls to /api with the CSRF token of the session
let csrf = null;

export function setCsrf(token) {
  csrf = token || null;
}

export function getCsrf() {
  return csrf;
}

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.message) || `HTTP ${ status }`);
    this.status = status;
    this.code = (body && body.error) || 'error';
    this.body = body || {};
  }
}

export async function api(method, path, body) {
  const headers = { 'Accept': 'application/json' };
  if (csrf) headers['x-csrf-token'] = csrf;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch('api/' + path, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { message: text };
    }
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const get = path => api('GET', path);
export const post = (path, body = {}) => api('POST', path, body);
export const patch = (path, body = {}) => api('PATCH', path, body);
export const del = path => api('DELETE', path);

export function query(params) {
  const parts = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === '' || v === null || v === undefined) continue;
    parts.push(`${ encodeURIComponent(k) }=${ encodeURIComponent(v) }`);
  }
  return parts.length ? '?' + parts.join('&') : '';
}
