import { S, refreshState } from '../core/state.js';
import { api } from '../core/api.js';
import { $, esc } from '../core/format.js';
import { render } from '../core/router.js';
import { toast } from '../core/ui.js';
import { on } from '../core/events.js';

const SAMPLE_CSV = `ime;e-pošta;vloga;oddelek
Luka Horvat;luka.horvat@podjetje.si;Razvijalec;Razvoj
Nina Zupan;nina.zupan@podjetje.si;DevOps inženir;Razvoj
Maja Kos;maja.kos@podjetje.si;Računovodja;Finance
Tomaž Golob;tomaz.golob@podjetje.si;Finančni analitik;Finance
Petra Mlakar;petra.mlakar@podjetje.si;Prodajni svetovalec;Prodaja
Rok Vidmar;rok.vidmar@podjetje.si;Sistemski administrator;IT
Eva Kralj;eva.kralj@podjetje.si;Kadrovnica;Kadrovska služba
Marko Novak;marko.novak@podjetje.si;Direktor;Uprava`;

export async function loadUsers() {
  S.data.users = await api('/api/users');
}

export function usersView() {
  const list = S.data.users;
  const depts = [...new Set(list.map((u) => u.department))].sort((a, b) => a.localeCompare(b, 'sl'));
  const included = list.filter((u) => u.included).length;
  return `
    <h1>Zaposleni in uvoz</h1>
    <p class="sub">Uvoz zaposlenih in izbira, kdo je vključen v program simulacij. Ime in e-pošta ostaneta v organizaciji. Zunanji ponudnik prejme le vlogo, oddelek, jezik in parametre vaje. Osebni učni rezultati niso del imenika. Koga vključiti v posamezen test, izberete na strani <a href="#/agent">Kampanje</a>.</p>
    <div class="grid cols-4">
      <div class="card stat"><div class="label">Uporabnikov</div><div class="value">${list.length}</div></div>
      <div class="card stat"><div class="label">Vključenih v program</div><div class="value">${included}</div><div class="hint">${list.length - included} izključenih</div></div>
      <div class="card stat"><div class="label">Oddelkov</div><div class="value">${depts.length}</div></div>
      <div class="card stat"><div class="label">Simulacij na osebo</div><div class="value">${S.state.sims.max} / mesec</div><div class="hint">nastavite v Pravilih</div></div>
    </div>
    ${importFormHtml()}
    <div class="card" style="margin-top:16px">
      <h2>Vključenost po oddelkih</h2>
      <div class="dept-chips">
        ${depts.map((d) => {
          const all = list.filter((u) => u.department === d);
          const on = all.filter((u) => u.included).length;
          return `<span class="dept"><b>${esc(d)}</b> <span class="muted">${on}/${all.length}</span>
            <button class="btn sm" data-dept="${esc(d)}" data-on="1" ${on === all.length ? 'disabled' : ''}>Vključi</button>
            <button class="btn sm" data-dept="${esc(d)}" data-on="0" ${on === 0 ? 'disabled' : ''}>Izključi</button></span>`;
        }).join('')}
      </div>
      <p class="small muted" style="margin-bottom:0">Izključite npr. osebe na daljši odsotnosti, nove zaposlene v prvem mesecu ali varnostno ekipo. Izključenim se prekličejo še nedostavljene simulacije.</p>
    </div>
    <div class="card" style="margin-top:16px">
      <h2>Seznam uporabnikov</h2>
      <div class="table-wrap"><table>
        <tr><th>Vključen</th><th>Psevdonim</th><th>Ime</th><th>E-pošta</th><th>Vloga</th><th>Oddelek</th></tr>
        ${list.map((u) => `<tr class="${u.included ? '' : 'rejected'}">
          <td><label class="switch"><input type="checkbox" data-include="${esc(u.id)}" ${u.included ? 'checked' : ''}></label></td>
          <td class="mono">${esc(u.id)}</td><td><b>${esc(u.name)}</b></td><td class="muted">${esc(u.email)}</td><td>${esc(u.role)}</td><td>${esc(u.department)}</td>

        </tr>`).join('')}
      </table></div>
    </div>`;
}

async function setIncluded(body) {
  S.data.users = await api('/api/users/include', { method: 'POST', body });
  await refreshState();
  render(false);
}
function importFormHtml() {
  return `<form class="card" id="import-form" style="margin-top:16px"><span class="eyebrow">1. DATOTEKA → 2. PRESLIKAVA → 3. POTRDITEV</span><h2>Uvoz zaposlenih</h2><p class="muted">Naložite CSV ali XLSX (prvi delovni list). Pred shranjevanjem preverite preslikavo, nove vnose in podvojene e-naslove. Obstoječi e-naslov pomeni posodobitev imenika.</p><label class="file-upload">Izberite datoteko CSV ali XLSX<input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" id="csv-file"></label><div class="field"><label for="csv-text">Ali prilepite vsebino CSV</label><textarea id="csv-text" name="csv" placeholder="ime;e-pošta;vloga;oddelek"></textarea></div><div class="row-actions"><button type="button" class="btn" data-sample-csv>Vstavi primer</button><button class="btn primary">Preveri podatke →</button><label class="switch"><input type="checkbox" name="includeNew" checked>Nove zaposlene vključi v program</label></div><div id="import-preview"></div></form>`;
}
const IMPORT_LABELS = { name: 'Ime in priimek *', email: 'E-pošta *', role: 'Vloga *', department: 'Oddelek *', language: 'Jezik' };
async function previewDirectory(mapping) {
  if (!S.importSource?.xlsx) S.importSource = { csv: $('#csv-text').value };
  S.importPreview = await api('/api/users/preview', { method: 'POST', body: { ...S.importSource, mapping } });
  const p = S.importPreview;
  $('#import-preview').innerHTML = `<hr><h3>Preslikava stolpcev</h3><div class="mapping-grid">${Object.entries(IMPORT_LABELS).map(([k, title]) => `<label>${title}<select data-map="${k}"><option value="-1">Izberite stolpec</option>${p.headers.map((h, i) => `<option value="${i}" ${p.mapping[k] === i ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`).join('')}</div><p class="${p.errors.length ? 'error-text' : 'muted'}">${p.errors.length ? p.errors.map(esc).join(' ') : `${p.added} novih · ${p.updated} posodobitev · ${p.invalid} neveljavnih ali podvojenih`}</p>${p.rows.length ? `<div class="table-wrap import-table"><table><tr><th>Vrstica</th><th>Ime</th><th>E-pošta</th><th>Oddelek</th><th>Preverjanje</th></tr>${p.rows.slice(0, 100).map(r => `<tr><td>${r.row}</td><td>${esc(r.record.name)}</td><td>${esc(r.record.email)}</td><td>${esc(r.record.department)}</td><td><span class="chip ${r.status === 'invalid' ? 'bad' : r.status === 'new' ? 'ok' : 'blue'}">${r.status === 'new' ? 'Nov vnos' : r.status === 'update' ? 'Posodobitev obstoječega' : esc(r.problem)}</span></td></tr>`).join('')}</table></div>${p.rows.length > 100 ? '<p class="small muted">Predogled prvih 100 vrstic; uvoz zajame vse veljavne vrstice.</p>' : ''}` : ''}<button type="button" class="btn primary" data-commit-import ${p.errors.length || !(p.added + p.updated) ? 'disabled' : ''}>Potrdi uvoz ${p.added + p.updated} zaposlenih</button>${p.invalid ? '<p class="small muted">Neveljavne in ponovljene vrstice bodo preskočene; prvi veljavni vnos za e-naslov se ohrani.</p>' : ''}`;
}
async function commitImport(button) {
  button.disabled = true;
  try {
    const r = await api('/api/users/import', { method: 'POST', body: { ...S.importSource, mapping: S.importPreview.mapping, includeNew: $('#import-form [name=includeNew]').checked } });
    S.importSource = S.importPreview = null;
    await render();
    toast(`Uvoz končan: ${r.added} novih, ${r.updated} posodobljenih, ${r.skipped.length} preskočenih.`);
  } finally { button.disabled = false; }
}

export function bindUsersEvents() {
  on('submit', '#import-form', (_, event) => { event.preventDefault(); return previewDirectory(); });
  on('click', '[data-commit-import]', commitImport);
  on('click', '[data-sample-csv]', () => {
    S.importSource = S.importPreview = null;
    $('#import-form textarea').value = SAMPLE_CSV;
    $('#import-preview').innerHTML = '';
  });
  on('click', '[data-dept]', button => setIncluded({ department: button.dataset.dept, included: button.dataset.on === '1' }));
  on('change', '[data-include]', input => setIncluded({ ids: [input.dataset.include], included: input.checked }));
  on('change', '[data-map]', () => {
    const mapping = Object.fromEntries([...document.querySelectorAll('[data-map]')].map(input => [input.dataset.map, Number(input.value)]));
    return previewDirectory(mapping);
  });
  on('input', '#csv-text', () => { S.importSource = S.importPreview = null; $('#import-preview').innerHTML = ''; });
  on('change', '#csv-file', async input => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) throw new Error('Največja velikost datoteke je 5 MB.');
    if (file.name.toLowerCase().endsWith('.xlsx')) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      S.importSource = { xlsx: btoa(binary) };
      $('#csv-text').value = '';
      $('#csv-text').placeholder = `Naložena datoteka: ${file.name}`;
    } else { S.importSource = null; $('#csv-text').value = await file.text(); }
    return previewDirectory();
  });
}
