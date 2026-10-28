import { sendJson, readBody } from '../http.js';
import { randomUUID } from 'node:crypto';
import { CHANNELS } from '../../scenarios.js';
import { csvRows, previewImport } from '../../directory-import.js';
import { users, groups, policy, userById, log } from '../store.js';
import { publicUser, importUsers, setIncluded, saveUsers, saveGroups } from '../directory.js';

async function importPreview(body) {
  let rows;
  if (body.xlsx) {
    const { readSheet } = await import('read-excel-file/node');
    rows = await readSheet(Buffer.from(body.xlsx, 'base64'));
  } else rows = csvRows(body.csv);
  return previewImport(rows, body.mapping, users);
}

export function registerDirectoryRoutes(route) {
  route('GET', '/api/users', (req, res) => sendJson(res, 200, users.map(publicUser)));
  route('POST', '/api/users/preview', async (req, res) => {
    try { sendJson(res, 200, await importPreview(await readBody(req))); }
    catch (e) { sendJson(res, 400, { error: e.message }); }
  });
  route('POST', '/api/users/import', async (req, res) => {
    try {
      const body = await readBody(req);
      const preview = await importPreview(body);
      if (preview.errors.length) return sendJson(res, 400, { error: preview.errors.join(' ') });
      const result = importUsers(preview.rows.filter(r => r.status !== 'invalid').map(r => r.record), body.includeNew !== false);
      saveUsers();
      log('skrbnik', 'Uvoz uporabnikov', `${result.added} novih, ${result.updated} posodobljenih, ${preview.invalid} preskočenih`);
      sendJson(res, 200, { ...result, skipped: preview.rows.filter(r => r.problem).map(r => `Vrstica ${r.row}: ${r.problem}`) });
    } catch (e) { sendJson(res, 400, { error: e.message }); }
  });

  route('GET', '/api/groups', (req, res) => sendJson(res, 200, groups));
  route('POST', '/api/groups', async (req, res) => {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const channels = Array.isArray(body.channels) ? [...new Set(body.channels)] : [];
    const memberIds = Array.isArray(body.memberIds) ? [...new Set(body.memberIds)] : [];
    if (!name || name.length > 80 || !memberIds.length || memberIds.some(id => !userById(id)) || !channels.length || channels.some(c => !Object.hasOwn(CHANNELS, c)) || !Number.isInteger(body.difficulty) || body.difficulty < 1 || body.difficulty > 5 || !Number.isInteger(body.frequency) || body.frequency < 1 || body.frequency > policy.maxSimsPerMonth) {
      return sendJson(res, 400, { error: 'Vnesite ime, člane, kanal, zahtevnost 1–5 in pogostost znotraj omejitve organizacije.' });
    }
    if (groups.some(g => g.id !== body.id && g.name.toLowerCase() === name.toLowerCase())) return sendJson(res, 409, { error: 'Skupina s tem imenom že obstaja.' });
    let group = body.id ? groups.find(g => g.id === body.id) : null;
    if (body.id && !group) return sendJson(res, 404, { error: 'Ni skupine.' });
    const data = { name, memberIds, channels, difficulty: body.difficulty, frequency: body.frequency };
    if (group) Object.assign(group, data);
    else { group = { id: randomUUID().slice(0, 8), ...data }; groups.push(group); }
    saveGroups();
    log('skrbnik', 'Shranjena skupina', `${name}, ${memberIds.length} članov`);
    sendJson(res, 200, group);
  });

  route('POST', '/api/users/include', async (req, res) => {
    const { ids = [], department, included } = await readBody(req);
    const targets = department ? users.filter((u) => u.department === department) : users.filter((u) => ids.includes(u.id));
    targets.forEach((u) => setIncluded(u, Boolean(included)));
    saveUsers();
    log('skrbnik', included ? 'Vključeni v program' : 'Izključeni iz programa', department ? `oddelek ${department} (${targets.length})` : targets.map((u) => u.id).join(', '));
    sendJson(res, 200, users.map(publicUser));
  });
}
