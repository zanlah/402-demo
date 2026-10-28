import { sessions } from './store.js';
import { sendJson } from './http.js';

export function authorizeRequest(req, res, url) {
  const token = req.headers.cookie?.match(/(?:^|; )ca_session=([^;]+)/)?.[1];
  req.session = sessions.get(token);
  if (!url.pathname.startsWith('/api/') || url.pathname === '/api/session') return true;
  if (!req.session) {
    sendJson(res, 401, { error: 'Najprej izberite predstavitveno prijavo.' });
    return false;
  }
  const learnerRoute = /^\/api\/messages(?:\/|$)/.test(url.pathname) || url.pathname === '/api/learning/next';
  if (req.session.role === 'employee' && !learnerRoute && url.pathname !== '/api/state') {
    sendJson(res, 403, { error: 'Dostop je dovoljen samo IT-skrbniku.' });
    return false;
  }
  if (req.session.role === 'admin' && learnerRoute) {
    sendJson(res, 403, { error: 'Osebni učni rezultati so dostopni samo zaposlenemu.' });
    return false;
  }
  return true;
}
