export function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

export async function readBody(req) {
  if (req._body !== undefined) return req._body;
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 8 * 1024 * 1024) throw new Error('Datoteka je prevelika (največ 8 MB).');
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    req._body = raw ? JSON.parse(raw) : {};
  } catch {
    req._body = {};
  }
  return req._body;
}

export async function postJson(url, body, headers = {}) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: r.status, headers: r.headers, body: await r.json() };
}

export function createRouter() {
  const routes = [];
  function route(method, pattern, handler) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    routes.push({ method, re, keys, handler });
  }

  async function dispatchRoute(req, res, url) {
    for (const route of routes) {
      const match = route.method === req.method && url.pathname.match(route.re);
      if (!match) continue;
      const params = Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]));
      await route.handler(req, res, params);
      return true;
    }
    return false;
  }

  return { route, dispatchRoute };
}
