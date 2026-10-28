import { S } from '../core/state.js';
import { api } from '../core/api.js';
import { $, esc } from '../core/format.js';
import { render } from '../core/router.js';
import { toast } from '../core/ui.js';
import { on } from '../core/events.js';

export async function loadGroups() {
  [S.data.groups, S.data.users] = await Promise.all([api('/api/groups'), api('/api/users')]);
}
export function groupsView() {
  const group = S.data.groups.find(g => g.id === S.editGroup);
  return `<span class="eyebrow">CILJNO USPOSABLJANJE</span><h1>Skupine zaposlenih</h1><p class="sub">Združite ljudi po oddelku ali učnih potrebah. Vsaka skupina ima svoje kanale, zahtevnost in pogostost.</p><div class="grid cols-3">${S.data.groups.map(g => `<article class="card group-card"><span class="chip blue">${g.memberIds.length} članov</span><h2>${esc(g.name)}</h2><p>Zahtevnost <b>${g.difficulty}/5</b> · do ${g.frequency} vaj/mesec</p><p>${g.channels.map(c => `<span class="chip">${esc(S.state.channels[c])}</span>`).join('')}</p><div class="row-actions"><button class="btn" data-edit-group="${g.id}">Uredi</button><button class="btn primary" data-group-campaign="${g.id}">Nova kampanja →</button></div></article>`).join('') || '<div class="card empty-state"><h2>Pripravite prvo skupino</h2><p>Na primer »Računovodstvo« z zahtevnostjo 3 ali »Novi zaposleni« z zahtevnostjo 1.</p></div>'}</div><form class="card group-form" id="group-form"><h2>${group ? `Uredi: ${esc(group.name)}` : 'Nova skupina'}</h2><div class="form-grid"><div class="field"><label for="group-name">Ime skupine</label><input id="group-name" name="name" type="text" required maxlength="80" value="${esc(group?.name || '')}" placeholder="Npr. Novi zaposleni"></div><div class="field"><label for="group-difficulty">Zahtevnost</label><select id="group-difficulty" name="difficulty">${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${(group?.difficulty || 2) === n ? 'selected' : ''}>${n}/5 · ${['Osnove', 'Lažja', 'Srednja', 'Zahtevna', 'Napredna'][n - 1]}</option>`).join('')}</select></div><div class="field"><label for="group-frequency">Največ vaj na osebo na mesec</label><input id="group-frequency" name="frequency" type="number" min="1" max="${S.state.sims.max}" required value="${group?.frequency || Math.min(3, S.state.sims.max)}"><span class="help">Omejitev organizacije: ${S.state.sims.max}. Odprta vaja prepreči novo dodelitev.</span></div><fieldset class="channel-field"><legend>Kanali</legend>${Object.entries(S.state.channels).map(([k, label]) => `<label><input type="checkbox" name="channels" value="${k}" ${(group?.channels || ['email']).includes(k) ? 'checked' : ''}>${esc(label)}</label>`).join('')}</fieldset></div><fieldset class="members"><legend>Člani skupine</legend><div class="row-actions">${[...new Set(S.data.users.map(u => u.department))].map(d => `<button class="btn sm" type="button" data-group-dept="${esc(d)}">${esc(d)}</button>`).join('')}</div><div class="member-list">${S.data.users.map(u => `<label><input type="checkbox" name="members" value="${u.id}" ${group?.memberIds.includes(u.id) ? 'checked' : ''}><span><b>${esc(u.name)}</b><small>${esc(u.department)} · ${esc(u.role)}${u.included ? '' : ' · izključen iz programa'}</small></span></label>`).join('')}</div></fieldset><div class="row-actions"><button class="btn primary">Shrani skupino</button>${group ? '<button type="button" class="btn" data-new-group>Nova skupina</button>' : ''}<a class="btn" href="#/uporabniki">Uvozi zaposlene</a></div></form>`;
}
async function saveGroup(form) {
  const f = new FormData(form);
  await api('/api/groups', { method: 'POST', body: { id: S.editGroup || undefined, name: f.get('name'), difficulty: Number(f.get('difficulty')), frequency: Number(f.get('frequency')), channels: f.getAll('channels'), memberIds: f.getAll('members') } });
  S.editGroup = null;
  await render();
  toast('Skupina shranjena. Njene nastavitve lahko uporabite v novi kampanji.');
}

export function bindGroupsEvents() {
  on('submit', '#group-form', (form, event) => { event.preventDefault(); return saveGroup(form); });
  on('click', '[data-edit-group]', async button => {
    S.editGroup = button.dataset.editGroup;
    await render(false);
    $('#group-form').scrollIntoView({ behavior: 'smooth' });
  });
  on('click', '[data-new-group]', () => { S.editGroup = null; return render(false); });
  on('click', '[data-group-campaign]', button => {
    S.campaignGroup = button.dataset.groupCampaign;
    S.campaignName = '';
    location.hash = '#/agent';
  });
  on('click', '[data-group-dept]', button => {
    const ids = S.data.users.filter(u => u.department === button.dataset.groupDept).map(u => u.id);
    const inputs = [...document.querySelectorAll('[name=members]')].filter(input => ids.includes(input.value));
    const all = inputs.every(input => input.checked);
    inputs.forEach(input => { input.checked = !all; });
  });
}
