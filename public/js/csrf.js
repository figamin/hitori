window.getCsrfToken = function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
};

window.csrfHeaders = function csrfHeaders(extra) {
  const headers = Object.assign({}, extra || {});
  const token = window.getCsrfToken();
  if (token) headers['X-CSRF-Token'] = token;
  return headers;
};

window.nativeFetch = window.fetch.bind(window);

window.refreshCsrfToken = async function refreshCsrfToken() {
  try {
    const response = await window.nativeFetch('/api/csrf', {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return '';
    const data = await response.json().catch(() => ({}));
    return data.token || window.getCsrfToken();
  } catch (error) {
    return '';
  }
};

function sameOrigin(input) {
  try {
    const url = typeof input === 'string' ? input : input && input.url;
    return Boolean(url) && new URL(url, window.location.href).origin === window.location.origin;
  } catch (error) {
    return false;
  }
}

function replayable(init) {
  const body = init && init.body;
  if (!body) return true;
  return (
    typeof body === 'string' ||
    body instanceof URLSearchParams ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer
  );
}

window.fetch = function csrfFetch(input, init) {
  const local = sameOrigin(input);
  const options = Object.assign({}, init || {});
  if (local) options.headers = window.csrfHeaders(options.headers || {});
  return window.nativeFetch(input, options).then(async (response) => {
    if (!local || response.status !== 403 || !replayable(options)) return response;
    const body = await response.clone().text().catch(() => '');
    if (!/csrf/i.test(body)) return response;
    const token = await window.refreshCsrfToken();
    if (!token) return response;
    const retry = Object.assign({}, options, { headers: window.csrfHeaders(options.headers || {}) });
    return window.nativeFetch(input, retry);
  });
};
