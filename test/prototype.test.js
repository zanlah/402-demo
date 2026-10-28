import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { csvRows, previewImport } from '../directory-import.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('CSV handles quoted separators, duplicate addresses and manual mapping', () => {
  const rows = csvRows('\uFEFFFull name;Address;Job;Team\n"Kos; Maja";MAJA@example.si;Analitik;Finance\nMaja;maja@example.si;Analitik;Finance\nBad;wrong;Analitik;Finance');
  const p = previewImport(rows, { name: 0, email: 1, role: 2, department: 3, language: -1 });
  assert.equal(p.added, 1);
  assert.equal(p.invalid, 2);
  assert.equal(p.rows[0].record.name, 'Kos; Maja');
  assert.equal(p.rows[0].record.email, 'maja@example.si');
  assert.throws(() => csvRows('a;b\n"unfinished'));
  assert.ok(previewImport(rows, { name: 0, email: 0, role: 2, department: 3 }).errors.length);
});

test('role isolation, import, campaign approval, payment and aggregate reporting', { timeout: 120000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cyberagent-test-'));
  const port = 14020;
  const child = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), X402_MODE: 'simulacija', USERS_FILE: join(dir, 'users.json'), GROUPS_FILE: join(dir, 'groups.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => output += data);
  child.stderr.on('data', data => output += data);
  t.after(async () => { child.kill(); await rm(dir, { recursive: true, force: true }); });
  const base = `http://localhost:${port}`;
  for (let n = 0; n < 100; n++) {
    if (child.exitCode !== null) throw new Error(output);
    try { if ((await fetch(base + '/api/session')).ok) break; } catch {}
    await delay(50);
  }
  async function request(path, cookie = '', method = 'GET', body) {
    const r = await fetch(base + path, { method, headers: { cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
  }
  const admin = (await request('/api/session', '', 'POST', { role: 'admin' })).cookie;
  const employee = (await request('/api/session', '', 'POST', { role: 'employee', email: 'luka.horvat@podjetje.si' })).cookie;
  await t.test('server restricts both roles and does not leak personal scores', async () => {
    assert.equal((await request('/api/state')).status, 401);
    assert.equal((await request('/api/transactions', employee)).status, 403);
    assert.equal((await request('/api/users', employee)).status, 403);
    assert.equal((await request('/api/messages', admin)).status, 403);
    const state = (await request('/api/state', employee)).data;
    assert.equal(state.user.name, 'Luka Horvat');
    assert.ok(!('wallet' in state));
    assert.ok(!('users' in state));
    const directory = (await request('/api/users', admin)).data;
    assert.ok(!('points' in directory[0]));
    assert.ok(!('reported' in directory[0]));
  });
  await t.test('XLSX preview parses real workbook and import skips duplicate rows', async () => {
    const xlsx = (await readFile(new URL('./fixtures/users.xlsx', import.meta.url))).toString('base64');
    const p = await request('/api/users/preview', admin, 'POST', { xlsx });
    assert.equal(p.status, 200, JSON.stringify(p.data));
    assert.equal(p.data.added, 5);
    assert.equal(p.data.invalid, 1);
    const r = await request('/api/users/import', admin, 'POST', { xlsx, mapping: p.data.mapping });
    assert.equal(r.data.added, 5);
    assert.equal(r.data.skipped.length, 1);
    assert.equal((await request('/api/users/preview', admin, 'POST', { xlsx })).data.updated, 5);
  });
  const users = (await request('/api/users', admin)).data.filter(u => u.id !== 'U-1042');
  const group = await request('/api/groups', admin, 'POST', { name: 'Novi zaposleni', memberIds: users.map(u => u.id), channels: ['sms'], difficulty: 1, frequency: 3 });
  assert.equal(group.status, 200, JSON.stringify(group.data));
  const plan = (await request('/api/agent/plan', admin, 'POST', { groupId: group.data.id, name: 'SMS uvajanje' })).data;
  await t.test('group constraints and explicit approval apply before all payments', async () => {
    assert.equal(plan.status, 'pending');
    assert.equal(plan.items.length, 5);
    assert.ok(plan.items.every(i => i.chosen.channel === 'sms' && i.analysis.difficulty === 1));
    assert.equal(plan.estimatedCost, 0.4);
    assert.equal((await request(`/api/agent/plans/${plan.id}/deliver`, admin, 'POST')).status, 409);
    assert.equal((await request(`/api/agent/plans/${plan.id}/decision`, admin, 'POST', { approve: true })).status, 400);
    await fetch(`${base}/api/agent/plans/${plan.id}/execute`, { headers: { cookie: admin } }).then(r => r.text());
    assert.equal((await request('/api/transactions', admin)).data.transactions.length, 0);
    await request('/api/policy', admin, 'PUT', { monthlyBudget: 0.01 });
    const approval = { approve: true, checklist: { recipients: true, cost: true, privacy: true } };
    assert.equal((await request(`/api/agent/plans/${plan.id}/decision`, admin, 'POST', approval)).status, 409);
    await request('/api/policy', admin, 'PUT', { monthlyBudget: 3 });
    await request('/api/agents/smishlab/allowlist', admin, 'POST', { allowlisted: false });
    assert.equal((await request(`/api/agent/plans/${plan.id}/decision`, admin, 'POST', approval)).status, 409);
    await request('/api/agents/smishlab/allowlist', admin, 'POST', { allowlisted: true });
    assert.equal((await request(`/api/agent/plans/${plan.id}/decision`, admin, 'POST', approval)).status, 200);
    const events = await fetch(`${base}/api/agent/plans/${plan.id}/execute`, { headers: { cookie: admin } }).then(r => r.text());
    assert.ok(events.includes('"status":"done"'), events);
    const payments = (await request('/api/transactions', admin)).data;
    assert.equal(payments.transactions.length, 10);
    assert.equal(payments.budget.spent, 0.4);
    await fetch(`${base}/api/agent/plans/${plan.id}/execute`, { headers: { cookie: admin } }).then(r => r.text());
    assert.equal((await request('/api/transactions', admin)).data.transactions.length, 10);
  });
  await t.test('delivery, private feedback and five-person reporting threshold', async () => {
    const delivered = await request(`/api/agent/plans/${plan.id}/deliver`, admin, 'POST');
    assert.equal(delivered.data.delivered, 5);
    assert.ok((await request('/api/campaign-reports', admin)).data[0].hidden);
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const cookie = (await request('/api/session', '', 'POST', { role: 'employee', email: user.email })).cookie;
      const inbox = (await request('/api/messages', cookie)).data;
      const message = inbox.find(m => m.simulation);
      assert.equal(message.channel, 'sms');
      assert.ok(!('cost' in message));
      assert.ok(!('agentName' in message));
      assert.equal((await request(`/api/messages/${message.id}/action`, employee, 'POST', { action: 'report' })).status, 404);
      const result = await request(`/api/messages/${message.id}/action`, cookie, 'POST', { action: 'report', responseMs: 1200, explanation: 'Preveril sem domeno.' });
      assert.equal(result.data.outcome, 'success');
      assert.equal(result.data.state.user.history[0].explanation, 'Preveril sem domeno.');
      assert.equal((await request(`/api/messages/${message.id}/action`, cookie, 'POST', { action: 'report' })).status, 400);
      if (i < 4) assert.ok((await request('/api/campaign-reports', admin)).data[0].hidden);
    }
    const report = (await request('/api/campaign-reports', admin)).data[0];
    assert.equal(report.hidden, false);
    assert.equal(report.reportRate, 1);
    assert.equal(report.clickRate, 0);
    assert.equal(report.medianSeconds, 1);
    const audit = (await request('/api/audit', admin)).data;
    assert.ok(!audit.some(row => row.action === 'Odziv na simulacijo'));
  });
  await t.test('voluntary practice requires no payment and policy validates limits', async () => {
    const initial = (await request('/api/messages', employee)).data.find(m => m.simulation);
    await request(`/api/messages/${initial.id}/action`, employee, 'POST', { action: 'report' });
    const next = await request('/api/learning/next', employee, 'POST');
    assert.equal(next.status, 200);
    const again = await request('/api/learning/next', employee, 'POST');
    assert.equal(next.data.message.id, again.data.message.id);
    assert.equal((await request('/api/transactions', admin)).data.transactions.length, 10);
    assert.equal((await request('/api/policy', admin, 'PUT', { monthlyBudget: -1 })).status, 400);
    assert.equal((await request('/api/policy', admin, 'PUT', { retentionDays: 0 })).status, 400);
    assert.equal((await request('/api/policy', admin, 'PUT', { requireApproval: false })).data.requireApproval, true);
    await request('/api/session', employee, 'DELETE');
    assert.equal((await request('/api/state', employee)).status, 401);
  });
  await t.test('failed review retains actual charges and prevents further generation', async () => {
    const nextPlan = (await request('/api/agent/plan', admin, 'POST', { groupId: group.data.id, name: 'Prekinjeni pregled' })).data;
    assert.equal(nextPlan.status, 'pending');
    await request(`/api/agent/plans/${nextPlan.id}/decision`, admin, 'POST', { approve: true, checklist: { recipients: true, cost: true, privacy: true } });
    const stream = await fetch(`${base}/api/agent/plans/${nextPlan.id}/execute`, { headers: { cookie: admin } });
    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let events = '', disabled = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      events += decoder.decode(value, { stream: true });
      if (!disabled && events.includes('"kind":"paid"')) {
        disabled = true;
        await request('/api/agents/ethicsguard/allowlist', admin, 'POST', { allowlisted: false });
      }
    }
    const failed = (await request('/api/agent/plans', admin)).data.find(p => p.id === nextPlan.id);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.totalCost, 0.06);
    assert.equal((await request('/api/transactions', admin)).data.transactions.length, 11);
    assert.equal((await request('/api/campaign-reports', admin)).data[0].cost, 0.06);
    assert.equal((await request(`/api/agent/plans/${nextPlan.id}/deliver`, admin, 'POST')).status, 409);
  });

});
