import { S } from './state.js';
import { $, esc, usdc } from './format.js';

export function renderChrome(viewName) {
  const st = S.state;
  if (!st) return;
  const employee = st.session.role === 'employee';
  const entries = employee
    ? [['nabiralnik', '01', 'Moje vaje'], ['napredek', '02', 'Moj napredek']]
    : [['organizacija', '01', 'Pregled in poročila'], ['uporabniki', '02', 'Zaposleni in uvoz'], ['skupine', '03', 'Skupine'], ['agent', '04', 'Kampanje'], ['trznica', '05', 'Tržnica agentov'], ['placila', '06', 'Plačila x402'], ['pravila', '07', 'Pravila in zasebnost']];
  document.body.classList.remove('signed-out');
  document.body.dataset.role = st.session.role;
  $('#identity').innerHTML = `<span class="identity-label">${employee ? 'UČNI PORTAL' : 'IT-KONZOLA'}</span><strong>${employee ? esc(st.user.name) : 'IT-skrbnik'}</strong><span>${employee ? 'Vaš prostor za varno učenje' : 'Upravljanje varnostnega usposabljanja'}</span>`;
  $('.nav').innerHTML = entries.map(([id, icon, title]) => `<a href="#/${id}" data-view="${id}" ${viewName === id ? 'class="active" aria-current="page"' : ''}><span class="ico" aria-hidden="true">${icon}</span>${title}</a>`).join('');
  const activeLabel = entries.find(([id]) => id === viewName)?.[2] || '';
  $('#workspace-path').innerHTML = `<span class="path-root">cyberagent</span><span class="path-separator" aria-hidden="true">/</span><span>${employee ? 'učni portal' : 'IT-konzola'}</span><span class="path-separator" aria-hidden="true">/</span><span class="path-current">${esc(activeLabel)}</span>`;
  if (employee) {
    $('#wallet').innerHTML = '<b>Vaš napredek je oseben.</b><p>Podjetje vidi skupne rezultate dovolj velikih skupin.</p>';
    return;
  }
  const used = st.budget.limit ? st.budget.spent / st.budget.limit : 0;
  $('#wallet').innerHTML = `<b>Proračun organizacije</b><div class="row"><span>Poraba ta mesec</span><b>${usdc(st.budget.spent)}</b></div><div class="meter"><i style="width:${Math.min(100, used * 100)}%"></i></div><div class="row"><span>Mesečna omejitev</span><span>${usdc(st.budget.limit)}</span></div><div class="row"><span>Sredstva v denarnici</span><span>${usdc(st.wallet.balance)}</span></div>`;
}
