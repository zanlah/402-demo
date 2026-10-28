import { S } from '../core/state.js';
import { api } from '../core/api.js';
import { $ } from '../core/format.js';
import { render } from '../core/router.js';
import { toast, closeModal } from '../core/ui.js';
import { on } from '../core/events.js';
import { clearToast } from '../core/ui.js';

export function loginView() {
  document.body.classList.add('signed-out');
  $('#view').innerHTML = `
    <header class="login-header">
      <div class="brand"><span class="logo" aria-hidden="true">{c}</span><div><div class="brand-name">cyberagent<span class="brand-cursor" aria-hidden="true">_</span></div><div class="brand-sub">Varnost skozi prakso</div></div></div>
      <div class="login-edition"><span>Učni prostor</span><b>V.03</b></div>
    </header>
    <div class="login-hero">
      <section class="login-intro">
        <span class="eyebrow">ČLOVEK JE NAJBOLJŠA OBRAMBA</span>
        <h1>Prepoznaj.<br>Premisli.<br><span class="text-accent">Prijavi.<span class="cursor" aria-hidden="true"></span></span></h1>
        <p>Prepoznavanje prevar je veščina.<br>Utrdite jo s kratkimi vajami, ki vas naučijo<br class="desktop-break"> prepoznati prevaro, preden je prepozno.</p>
      </section>
      <div class="learning-terminal" aria-label="Učni pristop: opazuj, preveri, prijavi">
        <div class="terminal-bar"><span class="terminal-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>varnost / učni pristop</span><span aria-hidden="true">&lt;/&gt;</span></div>
        <div class="terminal-body">
          <div class="code-line"><span class="line-number" aria-hidden="true">01</span><span class="code-comment">// En premislek lahko spremeni vse.</span></div>
          <div class="code-line" aria-hidden="true"><span class="line-number">02</span><span>&nbsp;</span></div>
          <div class="code-line"><span class="line-number" aria-hidden="true">03</span><span><span class="code-keyword">opazuj</span><span class="code-symbol">(</span><span class="code-string">"pošiljatelja"</span><span class="code-symbol">);</span></span></div>
          <div class="code-line"><span class="line-number" aria-hidden="true">04</span><span><span class="code-keyword">preveri</span><span class="code-symbol">(</span><span class="code-string">"povezavo"</span><span class="code-symbol">);</span></span></div>
          <div class="code-line"><span class="line-number" aria-hidden="true">05</span><span><span class="code-keyword">prijavi</span><span class="code-symbol">(</span><span class="code-string">"sumljivo sporočilo"</span><span class="code-symbol">);</span></span></div>
          <div class="code-line" aria-hidden="true"><span class="line-number">06</span><span>&nbsp;</span></div>
          <div class="code-line"><span class="line-number" aria-hidden="true">07</span><span class="code-comment">// Vsaka vaja šteje.</span></div>
          <div class="terminal-result">&gt; Manj ugibanja. Več samozavesti.</div>
        </div>
      </div>
    </div>
    <div class="login-divider"><span>IZBERITE SVOJ PROSTOR</span></div>
    <div class="grid cols-2 login-options">
      <form class="card login-card" id="login-form">
        <div class="login-card-top"><span class="role-icon" aria-hidden="true">&gt;_</span><span class="role-index">01 / ZAPOSLENI</span></div>
        <h2>Učni portal</h2>
        <p>Prepoznajte sumljiva sporočila, odkrijte opozorilne znake in spremljajte svoj napredek.</p>
        <label for="login-email">Vaš službeni e-naslov</label>
        <input id="login-email" name="email" type="email" required value="luka.horvat@podjetje.si" autocomplete="email">
        <button class="btn primary">Vstopi kot zaposleni <span aria-hidden="true">↗</span></button>
        <span class="small muted">Vzorčni račun je že vpisan.</span>
      </form>
      <section class="card login-card admin-card">
        <div class="login-card-top"><span class="role-icon admin" aria-hidden="true">{ }</span><span class="role-index">02 / ORGANIZACIJA</span></div>
        <h2>IT-konzola</h2>
        <p>Pripravite ciljno usposabljanje in ostanite na tekočem. Vse ključne odločitve na enem mestu.</p>
        <ul class="role-capabilities"><li>Skupine, kanali in zahtevnost</li><li>Odobritve in omejitve porabe</li><li>Skupinska poročila</li></ul>
        <button class="btn" data-login-admin>Vstopi kot IT-skrbnik <span aria-hidden="true">↗</span></button>
      </section>
    </div>
    <footer class="login-bottom"><p class="login-note">Predstavitvena prijava brez gesla. Za preizkus uporabite izmišljene podatke.</p><span class="login-signature"><span aria-hidden="true">{ }</span> Zasnovano za učenje.</span></footer>`;
}
async function login(role, email) {
  S.state = await api('/api/session', { method: 'POST', body: { role, email } });
  Object.assign(S, { messages: [], selected: null, plan: null, pick: null, data: {} });
  location.hash = role === 'employee' ? '#/nabiralnik' : '#/organizacija';
  await render();
}
async function logout() {
  if (S.running) { toast('Kampanja se še izvaja. Počakajte na zaključek.'); return; }
  await api('/api/session', { method: 'DELETE' });
  S.state = null;
  clearToast();
  $('#statusbar').hidden = true;
  closeModal();
  loginView();
}

export function bindSessionEvents() {
  on('click', '[data-login-admin]', () => login('admin'));
  on('click', '[data-logout]', logout);
  on('submit', '#login-form', (form, event) => {
    event.preventDefault();
    return login('employee', new FormData(form).get('email'));
  });
}
