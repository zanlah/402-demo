import { sendJson, readBody } from '../http.js';
import { generateScenario } from '../../scenarios.js';
import { sessionUser, userMessages, simsThisMonth, addMessage, messages, policy } from '../store.js';
import { learnerMessage, respond } from '../learning.js';
import { analyzeUser } from '../planning.js';
import { publicState } from '../public-state.js';

export function registerLearningRoutes(route) {
  route('POST', '/api/learning/next', (req, res) => {
    const u = sessionUser(req);
    const open = userMessages(u).find(m => m.simulation && !m.resolved);
    if (open) return sendJson(res, 200, { message: learnerMessage(open) });
    if (!u.included) return sendJson(res, 409, { error: 'Trenutno niste vključeni v učni program. Obrnite se na skrbnika.' });
    if (simsThisMonth(u) >= policy.maxSimsPerMonth) return sendJson(res, 409, { error: 'Za ta mesec ste opravili vse predvidene vaje. Svoj napredek lahko še vedno pregledate.' });
    // Voluntary local exercise; no external service, purchase, or campaign delivery.
    const analysis = analyzeUser(u);
    const channel = u.history.length % 2 ? 'sms' : 'email';
    const msg = addMessage({ ...generateScenario({ ...analysis, channel, role: u.role, department: u.department, variant: u.stats[analysis.tactic].seen }), userId: u.id, simulation: true, practice: true });
    sendJson(res, 200, { message: learnerMessage(msg) });
  });
  route('GET', '/api/messages', (req, res) => sendJson(res, 200, userMessages(sessionUser(req)).map(learnerMessage)));
  route('POST', '/api/messages/:id/read', (req, res, p) => {
    const m = messages.find((x) => x.id === p.id && x.userId === req.session.userId);
    if (!m) return sendJson(res, 404, { error: 'Ni sporočila.' });
    m.read = true;
    sendJson(res, 200, { ok: true });
  });
  route('POST', '/api/messages/:id/action', async (req, res, p) => {
    const m = messages.find((x) => x.id === p.id && x.userId === req.session.userId);
    if (!m) return sendJson(res, 404, { error: 'ni sporočila' });
    const { action, responseMs, explanation } = await readBody(req);
    const result = respond(m, action, Math.max(0, Math.min(86400000, Number(responseMs) || 0)), explanation);
    sendJson(res, result.error ? 400 : 200, { ...result, state: publicState(req), item: learnerMessage(m) });
  });
}
