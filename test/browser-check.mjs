// Optional browser smoke test using an installed Chrome; no browser dependencies.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const dir = await mkdtemp(join(tmpdir(), 'cyberagent-browser-'));
const delay = ms => new Promise(r => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: '14021', X402_MODE: 'simulacija', USERS_FILE: join(dir, 'users.json'), GROUPS_FILE: join(dir, 'groups.json') }, stdio: ['ignore', 'ignore', 'pipe'] });
const chrome = spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${join(dir, 'profile')}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let ws;
const errors = [];
let checks = 0;
try {
  const browserUrl = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Chrome launch timeout')), 20000);
    chrome.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    chrome.on('error', reject);
    chrome.on('exit', code => { clearTimeout(timer); if (code) reject(new Error(`Chrome exit ${code}`)); });
  });
  const targets = await (await fetch(`http://127.0.0.1:${new URL(browserUrl).port}/json/list`)).json();
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = event => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  const command = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method, params })); });
  async function evaluate(expression) {
    const r = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async function until(expression) { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50); } throw new Error(`Timeout: ${expression}`); }
  async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); }
  async function fill(selector, value) { await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));})()`); }
  async function check(expression, message) { assert.equal(await evaluate(expression), true, message); checks++; }
  async function route(name, selector) { await evaluate(`location.hash='#/${name}'`); await until(`!!document.querySelector(${JSON.stringify(selector)})`); }
  async function shot(name) { const r = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(join(dir, name + '.png'), Buffer.from(r.data, 'base64')); }
  await command('Page.enable'); await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: 'http://localhost:14021' });
  await until('!!document.querySelector("#login-form")');
  await shot('login');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await check('document.documentElement.scrollWidth <= 390', 'Mobile login has no page overflow');
  await shot('mobile-login');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await click('[data-login-admin]');
  await until('document.body.dataset.role === "admin" && !!document.querySelector(".sample-analytics")');
  await check('!document.querySelector(".nav [data-view=nabiralnik]")', 'Admin menu excludes employee inbox');
  await route('uporabniki', '#import-form');
  await click('[data-sample-csv]');
  await evaluate('document.querySelector("#import-form").requestSubmit()');
  await until('!!document.querySelector("[data-commit-import]")');
  await check('document.querySelectorAll("[data-map]").length === 5', 'CSV mapping has all fields');
  await click('[data-commit-import]');
  await until('document.querySelectorAll("[data-include]").length === 8');
  await route('skupine', '#group-form');
  await fill('#group-name', 'Novi zaposleni');
  await click('[name=members]');
  await evaluate('document.querySelector("#group-form").requestSubmit()');
  await until('!!document.querySelector("[data-group-campaign]")');
  await check('document.querySelector(".group-card h2").textContent === "Novi zaposleni"', 'Group saved through UI');
  await route('agent', '[data-plan]');
  await check('document.querySelector("[data-plan]").disabled === false', 'Eligible imported employees can be selected');
  await click('[data-plan]');
  await until(`!!document.querySelector('[data-decide="1"]')`);
  await check(`document.querySelector('[data-decide="1"]').disabled`, 'Approval starts disabled');
  await evaluate('document.querySelectorAll("[data-approval]").forEach(e=>e.click())');
  await check(`!document.querySelector('[data-decide="1"]').disabled`, 'Approval enables only after checklist');
  await shot('campaign');
  await click('[data-decide="0"]');
  await until(`!document.querySelector('[data-decide="1"]')`);
  for (const [name, selector] of [['placila', '.flow'], ['trznica', '[data-allow]'], ['pravila', '#policy-form'], ['organizacija', '.sample-analytics']]) await route(name, selector);
  await shot('admin');
  await click('[data-logout]');
  await until('!!document.querySelector("#login-form")');
  await evaluate('document.querySelector("#login-form").requestSubmit()');
  await until('document.body.dataset.role === "employee" && !!document.querySelector(".inbox")');
  await check('document.querySelectorAll(".nav a").length === 2', 'Employee has only two learning destinations');
  await check('!document.querySelector(".sidebar").textContent.includes("USDC")', 'No payment information in learner sidebar');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click('[data-next-learning]');
  await until('!!document.querySelector("[data-act=report]")');
  await check('document.documentElement.scrollWidth <= 390', 'Mobile has no page overflow');
  await check('document.querySelector(".actions-bar .btn").getBoundingClientRect().height >= 44', 'Mobile response targets are large enough');
  await shot('mobile-exercise');
  await fill('#reflection', 'Naslov pošiljatelja se ne ujema.');
  await click('[data-act=report]');
  await until('!document.querySelector("#modal").hidden');
  await check('!document.querySelector(".modal").textContent.includes("x402")', 'Feedback excludes financial jargon');
  await check('document.querySelector(".modal").scrollTop === 0', 'Feedback opens at the explanation heading');
  await shot('mobile-feedback');
  await click('.modal [data-next-learning]');
  await until('document.querySelector("#modal").hidden && !!document.querySelector("#reflection")');
  await route('napredek', '.bar-row');
  await check('document.querySelector("#view").textContent.includes("Naslov pošiljatelja se ne ujema.")', 'Private explanation appears in own history');
  await check('document.documentElement.scrollWidth <= 390', 'Mobile progress has no page overflow');
  await evaluate('location.hash="#/placila"');
  await until('location.hash === "#/nabiralnik"');
  assert.deepEqual(errors, [], 'No uncaught browser exceptions');
  console.log(JSON.stringify({ checks, errors, screenshots: dir }, null, 2));
} finally {
  ws?.close(); chrome.kill(); server.kill();
  await delay(500);
  await rm(join(dir, 'profile'), { recursive: true, force: true });
}
