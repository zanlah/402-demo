import { $, esc } from '../core/format.js';
import { showModal } from '../core/ui.js';

export function showFeedback(r, m) {
  if (r.outcome === 'false_positive') {
    return showModal(`
      <div class="hero false_positive"><div class="tag">Pristno sporočilo</div><h2>${esc(r.title)}</h2><p style="margin:0">${esc(r.message)}</p></div>
      <div class="content"><div class="row-actions"><button class="btn primary" data-close>V redu</button></div></div>`);
  }
  const levelTxt = r.levelAfter > r.levelBefore ? `Težavnost naslednjih simulacij se dvigne na ${r.levelAfter}/5.` : r.levelAfter < r.levelBefore ? `Težavnost se zniža na ${r.levelAfter}/5, da utrdite osnove.` : `Težavnost ostaja ${r.levelAfter}/5.`;
  showModal(`
    <div class="hero ${r.outcome}">
      <div class="tag">${r.outcome === 'fail' ? 'To je bila vaja' : r.outcome === 'success' ? 'Prepoznano' : 'Skoraj'}</div>
      <h2>${esc(r.title)}</h2>
      <p style="margin:0">${esc(r.message)}</p>
    </div>
    <div class="content">
      <h3>Uporabljena taktika: ${esc(r.tactic.label)}</h3>
      <p class="muted" style="margin-top:0">${esc(r.tactic.desc)}</p>
      <ol style="padding-left:0;list-style:none;margin:0">
        ${r.redFlags.map((f, i) => `<li style="margin-bottom:8px"><span class="flag-num">${i + 1}</span> <b>${esc(f.title)}</b> – ${esc(f.explanation)}</li>`).join('')}
      </ol>
      <div class="tip"><b>Nasvet:</b> ${esc(r.tactic.tip)}</div>
      <p class="small muted">${r.points ? `+${r.points} točk budnosti. ` : ''}${levelTxt} Rezultat vidite samo vi; organizacija vidi skupne kazalnike pri najmanj petih sodelujočih.</p>
      <div class="row-actions">
        <button class="btn" data-close>Poglej označeno sporočilo</button>
        <button class="btn primary" data-next-learning>Naslednja vaja →</button><a class="btn" href="#/napredek" data-close>Moj napredek</a>
      </div>
    </div>`);
}
