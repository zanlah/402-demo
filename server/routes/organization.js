import { sendJson, readBody } from '../http.js';
import { CHANNELS } from '../../scenarios.js';
import { policy, audit, log } from '../store.js';
import { orgAnalytics, campaignReports } from '../analytics.js';

export function registerOrganizationRoutes(route) {
  route('GET', '/api/org', (req, res) => sendJson(res, 200, orgAnalytics()));
  route('GET', '/api/policy', (req, res) => sendJson(res, 200, policy));
  route('PUT', '/api/policy', async (req, res) => {
    const body = await readBody(req);
    for (const [key, max] of Object.entries({ monthlyBudget: 1000000, maxPerTx: 1000000, minRating: 5, maxSimsPerMonth: 100, retentionDays: 365 })) {
      if (body[key] !== undefined && (!Number.isFinite(Number(body[key])) || Number(body[key]) < (key === 'retentionDays' ? 1 : 0) || Number(body[key]) > max || (['retentionDays', 'maxSimsPerMonth'].includes(key) && !Number.isInteger(Number(body[key]))))) return sendJson(res, 400, { error: `Neveljavna vrednost: ${key}` });
    }
    for (const k of ['monthlyBudget', 'maxPerTx', 'minRating', 'maxSimsPerMonth', 'retentionDays']) if (body[k] !== undefined) policy[k] = Number(body[k]);
    policy.requireApproval = true;
    policy.allowlistOnly = policy.verifiedOnly = policy.dataMinimization = true;
    if (body.channels) for (const k of Object.keys(CHANNELS)) if (typeof body.channels[k] === 'boolean') policy.channels[k] = body.channels[k];
    if (Array.isArray(body.blockedTopics)) policy.blockedTopics = body.blockedTopics.map(String).filter(Boolean);
    log('skrbnik', 'Pravila posodobljena', JSON.stringify(body).slice(0, 140));
    sendJson(res, 200, policy);
  });
  route('GET', '/api/audit', (req, res) => sendJson(res, 200, audit));
  route('GET', '/api/campaign-reports', (req, res) => sendJson(res, 200, campaignReports()));
}
