import { sendJson, readBody } from '../http.js';
import { randomBytes } from 'node:crypto';
import { users, sessions } from '../store.js';
import { publicState } from '../public-state.js';
import { refreshBalance } from '../wallet.js';

export function registerSessionRoutes(route) {
  route('GET', '/api/session', (req, res) => sendJson(res, 200, { session: req.session || null }));
  route('POST', '/api/session', async (req, res) => {
    const { role, email } = await readBody(req);
    if (!['admin', 'employee'].includes(role)) return sendJson(res, 400, { error: 'Izberite vlogo.' });
    const u = role === 'employee' ? users.find(u => u.email.toLowerCase() === String(email || '').trim().toLowerCase()) : null;
    if (role === 'employee' && !u) return sendJson(res, 400, { error: 'E-naslova ni v imeniku. Za vzorčni račun uporabite luka.horvat@podjetje.si.' });
    const old = req.headers.cookie?.match(/(?:^|; )ca_session=([^;]+)/)?.[1];
    if (old) sessions.delete(old);
    const token = randomBytes(32).toString('hex');
    const session = { role, userId: u?.id || null };
    sessions.set(token, session);
    res.setHeader('Set-Cookie', `ca_session=${token}; HttpOnly; SameSite=Strict; Path=/`);
    req.session = session;
    sendJson(res, 200, publicState(req));
  });
  route('DELETE', '/api/session', (req, res) => {
    const token = req.headers.cookie?.match(/(?:^|; )ca_session=([^;]+)/)?.[1];
    sessions.delete(token);
    res.setHeader('Set-Cookie', 'ca_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    sendJson(res, 200, { ok: true });
  });
  route('GET', '/api/state', async (req, res) => {
    await refreshBalance();
    sendJson(res, 200, publicState(req));
  });
}
