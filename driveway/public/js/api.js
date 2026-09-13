/** Thin fetch wrapper. Cookies ride along automatically on same-origin requests. */

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details || {};
  }
}

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong.', res.status, data.details);
  return data;
}

const qs = (params) => {
  const clean = Object.entries(params || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== false);
  return clean.length ? '?' + new URLSearchParams(clean) : '';
};

const send = (method) => (path, body) =>
  fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(handle);

export const api = {
  get: (path, params) => fetch(path + qs(params)).then(handle),
  post: send('POST'),
  patch: send('PATCH'),
  del: send('DELETE'),
  /** Multipart upload — the browser sets its own content-type boundary. */
  upload: (path, formData) => fetch(path, { method: 'POST', body: formData }).then(handle)
};
