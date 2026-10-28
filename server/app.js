import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { BASE, PUBLIC_DIR } from './config.js';
import { createRouter, sendJson } from './http.js';
import { authorizeRequest } from './auth.js';
import { purgeExpiredLearning } from './learning.js';
import { registerSessionRoutes } from './routes/session.js';
import { registerLearningRoutes } from './routes/learning.js';
import { registerDirectoryRoutes } from './routes/directory.js';
import { registerMarketplaceRoutes } from './routes/marketplace.js';
import { registerCampaignRoutes } from './routes/campaigns.js';
import { registerWalletRoutes } from './routes/wallet.js';
import { registerOrganizationRoutes } from './routes/organization.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

export function createApp() {
  const { route, dispatchRoute } = createRouter();
  for (const register of [registerSessionRoutes, registerLearningRoutes, registerDirectoryRoutes, registerMarketplaceRoutes, registerCampaignRoutes, registerWalletRoutes, registerOrganizationRoutes]) register(route);
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, BASE);
    try {
      purgeExpiredLearning();
      if (!authorizeRequest(req, res, url)) return;
      if (await dispatchRoute(req, res, url)) return;
      if (req.method !== 'GET') return sendJson(res, 404, { error: 'ni najdeno' });
      const file = normalize(join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname));
      if (!file.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'prepovedano' });
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch (err) {
      if (err.code === 'ENOENT') return sendJson(res, 404, { error: 'ni najdeno' });
      console.error(err);
      if (!res.headersSent) sendJson(res, 500, { error: err.message });
    }
  });
}
