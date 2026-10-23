// Conta do jogador no lobby: entrar / criar conta, nível, ranking, cor e acabamento.
// Fala com /api/conta/... no servidor. Sem conta dá para jogar, mas nada fica salvo.
import { CHARS, COLORS, SKINS, levelOf, canUse, unlocksAt, charById, colorById, skinLevel } from './progressao.js';

const KEY = 'arena.conta';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const listeners = [];

export const conta = { token: null, perfil: null, guest: { char: 'recruta', color: 'laranja', skin: 'original' } };
try { const g = JSON.parse(localStorage.getItem(KEY + '.convidado')); if (g && canUse(1, g)) conta.guest = g; } catch {}

export const onChange = fn => listeners.push(fn);
const changed = () => { paintPill(); for (const fn of listeners) try { fn(conta.perfil); } catch (e) { console.warn(e); } };
export const logged = () => !!conta.perfil;
export const level = () => conta.perfil?.level ?? 1;
// o que o jogador está usando agora (conta ou convidado)
export const look = () => conta.perfil ? { char: conta.perfil.char, color: conta.perfil.color, skin: conta.perfil.skin } : { ...conta.guest };
export const colorHex = id => colorById(id)?.hex || '#ff8a1f';
// nível que falta para usar um personagem (0 = liberado)
export const lockOf = charId => { const c = charById(charId); if (!c) return 0; return c.level > level() ? c.level : 0; };

async function api(path, body) {
  const headers = { 'content-type': 'application/json' };
  if (conta.token) headers.authorization = 'Bearer ' + conta.token;
  let r;
  try { r = await fetch('api/conta/' + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('Sem conexão com o servidor.'); }
  let data = {}; try { data = await r.json(); } catch {}
  if (r.status === 401 && conta.token && path !== 'entrar') logout(true);
  if (!r.ok) throw new Error(data.erro || 'Não deu certo. Tente de novo.');
  return data;
}

function setSession(token, perfil) {
  conta.token = token; conta.perfil = perfil;
  try { token ? localStorage.setItem(KEY, token) : localStorage.removeItem(KEY); } catch {}
  changed();
}
export function logout(quiet) {
  if (!quiet && conta.token) api('sair', {}).catch(() => {});
  setSession(null, null);
}
export async function start() {
  injectUI();
  let t = null; try { t = localStorage.getItem(KEY); } catch {}
  if (!t) { changed(); return; }
  conta.token = t;
  try { const { perfil } = await api('eu'); conta.perfil = perfil; } catch { conta.token = conta.perfil = null; }
  changed();
}

// troca personagem / cor / acabamento. Devolve mensagem de erro ou null.
export async function equip(pick) {
  const next = { ...look(), ...pick };
  if (!canUse(level(), next)) {
    // personagem novo sem o acabamento escolhido liberado: volta para o original
    if (pick.char && canUse(level(), { ...next, skin: 'original' })) next.skin = 'original';
    else return logged() ? 'Ainda bloqueado.' : 'Crie uma conta para desbloquear jogando.';
  }
  if (!logged()) { conta.guest = next; try { localStorage.setItem(KEY + '.convidado', JSON.stringify(next)); } catch {} changed(); return null; }
  const before = { ...conta.perfil };
  Object.assign(conta.perfil, next); changed();
  try { const { perfil } = await api('equipar', next); conta.perfil = perfil; changed(); return null; }
  catch (e) { conta.perfil = before; changed(); return e.message; }
}

// fim de partida contra bots: manda o resultado e devolve o texto de XP
export async function sendSolo(result) {
  if (!logged()) return 'Crie uma conta para guardar XP e subir de nível.';
  try { const r = await api('partida', result); return gained(r); }
  catch (e) { return e.message; }
}
// resultado de partida online, que a sala manda sozinha
export function onlineResult(m) { return logged() ? gained(m) : ''; }
function gained({ xp, levelBefore, perfil, online }) {
  conta.perfil = perfil; changed();
  let s = `+${xp} XP${online === false ? ' (treino)' : ''}`;
  if (perfil.level > levelBefore) {
    const news = []; for (let l = levelBefore + 1; l <= perfil.level; l++) news.push(...unlocksAt(l));
    s += ` · Nível ${perfil.level}!` + (news.length ? ' Liberou: ' + news.join(', ') : '');
  }
  return s;
}

// ---------- tinta dos acabamentos (dourada, neon) ----------
const tintCache = new Map();
export function applySkin(root, skin, hex) {
  if (!skin || skin === 'original') return;
  root.traverse(o => {
    if (!o.isMesh || !o.material || o.userData.noSkin) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map(m => {
      const k = m.uuid + skin + hex;
      if (!tintCache.has(k)) {
        const n = m.clone();
        if (skin === 'dourada') { n.color?.lerp?.(n.color.clone().setRGB(1, .78, .25), .75); if ('metalness' in n) { n.metalness = .85; n.roughness = .28; } }
        if (skin === 'neon' && n.emissive) { n.emissive.set(hex || '#34e0c4'); n.emissiveIntensity = .55; }
        tintCache.set(k, n);
      }
      return tintCache.get(k);
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
}

// ---------- interface ----------
function injectUI() {
  const css = document.createElement('style');
  css.textContent = `
.me-pill { cursor: pointer; }
.me-pill:hover { background: rgba(20, 30, 90, .75); }
.me-pill .lv { font: 12px var(--font-d); background: var(--accent); color: var(--accent-ink); border-radius: 4px; padding: 1px 6px; }
.me-pill .lv.guest { background: rgba(255,255,255,.18); color: var(--ink); }
.xpbar { height: 10px; border-radius: 99px; background: rgba(0,0,0,.35); overflow: hidden; border: 1px solid var(--line); }
.xpbar i { display: block; height: 100%; background: linear-gradient(90deg, #ff7a00, #ffd23f); }
#contaModal .box { text-align: left; }
#contaModal h2 { text-align: center; font-size: 30px; }
#contaModal label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: var(--ink-dim); }
#contaModal input { background: rgba(0,0,0,.3); border: 1px solid var(--line); border-radius: 8px; color: var(--ink); font: 700 18px var(--font-b); padding: 8px 10px; }
#contaModal .err { color: var(--danger); min-height: 1.2em; font-size: 15px; }
#contaModal .seg { display: flex; gap: 6px; }
#contaModal .seg button { flex: 1; }
#contaModal .seg button.on { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
#contaModal .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center; }
#contaModal .stats div { background: rgba(255,255,255,.06); border-radius: 8px; padding: 6px; }
#contaModal .stats b { display: block; font: 24px var(--font-d); color: var(--ink); }
#contaModal .stats small { font-size: 12px; color: var(--ink-dim); text-transform: uppercase; letter-spacing: 1px; }
#contaModal .play { font-size: 24px; }
.rankPanel { width: min(560px, 100%); max-height: 100%; overflow-y: auto; }
.rankT { width: 100%; border-collapse: collapse; font-size: 17px; font-variant-numeric: tabular-nums; }
.rankT th { font: 11px var(--font-d); letter-spacing: 1.2px; color: var(--ink-dim); text-transform: uppercase; text-align: right; padding: 4px 6px; }
.rankT th:nth-child(2), .rankT td:nth-child(2) { text-align: left; }
.rankT td { padding: 7px 6px; text-align: right; border-top: 1px solid var(--line); }
.rankT td:first-child { font-family: var(--font-d); color: var(--ink-dim); width: 28px; }
.rankT tr.top1 td:first-child { color: var(--accent); }
.rankT tr.mine td { background: rgba(255, 210, 63, .12); }
.rankT .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
.rankT .lvl { font: 11px var(--font-d); color: var(--accent); margin-left: 6px; }
.card.locked { opacity: .55; }
.card .lockTag { position: absolute; top: -8px; right: 8px; font: 11px var(--font-d); background: #2a2f55; color: var(--ink); border-radius: 4px; padding: 1px 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.chip { position: relative; width: 30px; height: 30px; border-radius: 50%; border: 2px solid rgba(255,255,255,.35); padding: 0; }
.chip.on { border-color: #fff; box-shadow: 0 0 0 3px var(--accent); }
.chip.locked::after { content: attr(data-lv); position: absolute; inset: 0; display: grid; place-items: center; font: 10px var(--font-d); color: #fff; background: rgba(10,12,30,.7); border-radius: 50%; }
.skinBtn { font: 13px var(--font-d); border-radius: 6px; padding: 6px 10px; background: rgba(255,255,255,.08); color: var(--ink); border: 1px solid var(--line); }
.skinBtn.on { background: var(--accent); color: var(--accent-ink); }
.skinBtn.locked { opacity: .5; }
#lockMsg { color: var(--accent); }
#endXp { color: var(--accent); font-family: var(--font-d); font-size: 16px; }
`;
  document.head.appendChild(css);

  // aba Ranking
  const tabs = document.querySelector('.tabs');
  if (tabs && !tabs.querySelector('[data-tab="rank"]')) {
    const b = document.createElement('button'); b.className = 'tab'; b.type = 'button'; b.dataset.tab = 'rank'; b.textContent = 'Ranking';
    tabs.insertBefore(b, tabs.querySelector('[data-tab="help"]'));
  }
  const pane = document.createElement('div'); pane.className = 'pane'; pane.id = 'pane-rank'; pane.hidden = true;
  pane.innerHTML = `<aside class="panel rankPanel"><p class="lbl">Ranking geral · partidas online</p><div id="rankBody"><p class="hint">Carregando…</p></div>
    <p class="hint">Vitórias e abates de partidas com 2 ou mais amigos na sala. Partidas contra bots dão XP de treino.</p></aside>`;
  $('pane-help')?.before(pane);

  // cor e acabamento, embaixo da lista de personagens
  const locker = document.querySelector('.locker');
  if (locker) {
    const box = document.createElement('div');
    box.innerHTML = `<p class="lbl" style="margin-top:14px">Cor</p><div class="chips" id="colorChips"></div>
      <p class="lbl" style="margin-top:14px">Acabamento</p><div class="chips" id="skinChips"></div><p class="hint" id="lockMsg"></p>`;
    locker.querySelector('.roster')?.after(box);
    box.addEventListener('click', async e => {
      const c = e.target.closest('[data-color]'), s = e.target.closest('[data-skin]');
      if (!c && !s) return;
      const err = await equip(c ? { color: c.dataset.color } : { skin: s.dataset.skin });
      $('lockMsg').textContent = err || '';
    });
  }

  // fim de partida: linha do XP
  const endText = $('endText');
  if (endText && !$('endXp')) { const p = document.createElement('p'); p.id = 'endXp'; endText.after(p); }

  // janela da conta
  const modal = document.createElement('section'); modal.id = 'contaModal'; modal.className = 'screen modal'; modal.hidden = true;
  modal.innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-labelledby="contaTitle"></div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeAccount(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeAccount(); });
  document.querySelector('.me-pill')?.addEventListener('click', () => openAccount());
  document.querySelector('.me-pill')?.setAttribute('title', 'Sua conta');
}

let mode = 'entrar';
export function openAccount(m) { if (m) mode = m; paintAccount(); $('contaModal').hidden = false; $('contaModal').querySelector('input')?.focus(); }
export function closeAccount() { $('contaModal').hidden = true; }

function paintAccount() {
  const box = $('contaModal').querySelector('.box'), p = conta.perfil;
  if (p) {
    box.innerHTML = `<h2 id="contaTitle">${esc(p.name)}</h2>
      <p style="text-align:center">Nível <b style="color:var(--accent)">${p.level}</b> · ${p.into} / ${p.need} XP para o próximo</p>
      <div class="xpbar"><i style="width:${Math.round(100 * p.into / p.need)}%"></i></div>
      <p class="lbl" style="margin:6px 0 0">Online</p>
      <div class="stats"><div><b>${p.online.wins}</b><small>Vitórias</small></div><div><b>${p.online.kills}</b><small>Abates</small></div><div><b>${p.online.matches}</b><small>Partidas</small></div></div>
      <p class="lbl" style="margin:6px 0 0">Treino contra bots</p>
      <div class="stats"><div><b>${p.solo.wins}</b><small>Vitórias</small></div><div><b>${p.solo.kills}</b><small>Abates</small></div><div><b>${p.solo.matches}</b><small>Partidas</small></div></div>
      <p>${nextUnlock()}</p>
      <div class="row"><button class="play" type="button" data-act="close">Fechar</button><button class="ghost" type="button" data-act="out">Sair da conta</button></div>`;
  } else {
    const isNew = mode === 'criar';
    box.innerHTML = `<h2 id="contaTitle">${isNew ? 'Criar conta' : 'Entrar'}</h2>
      <div class="seg"><button class="ghost${isNew ? '' : ' on'}" type="button" data-mode="entrar">Já tenho conta</button><button class="ghost${isNew ? ' on' : ''}" type="button" data-mode="criar">Criar conta</button></div>
      <form id="contaForm" style="display:flex;flex-direction:column;gap:12px">
        <label>Apelido<input name="name" maxlength="16" autocomplete="username" required></label>
        <label>Senha<input name="pass" type="password" maxlength="72" autocomplete="${isNew ? 'new-password' : 'current-password'}" required></label>
        <p class="err" id="contaErr" aria-live="polite"></p>
        <button class="play" type="submit">${isNew ? 'Criar e jogar' : 'Entrar'}</button>
      </form>
      <p class="hint">${isNew ? 'O apelido é o nome que aparece no jogo e no ranking. Senha com pelo menos 6 caracteres.' : 'Sua conta guarda nível, ranking e o que você desbloqueou.'}</p>`;
    box.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target), btn = e.target.querySelector('button');
      btn.disabled = true; $('contaErr').textContent = '';
      try {
        const r = await api(isNew ? 'criar' : 'entrar', { name: f.get('name'), pass: f.get('pass') });
        setSession(r.token, r.perfil); paintAccount();
      } catch (err) { $('contaErr').textContent = err.message; btn.disabled = false; }
    });
  }
  box.onclick = e => {
    const m = e.target.closest('[data-mode]'); if (m) { mode = m.dataset.mode; paintAccount(); box.querySelector('input')?.focus(); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'close') closeAccount();
    if (a.dataset.act === 'out') { logout(); paintAccount(); }
  };
}

function nextUnlock() {
  for (let l = level() + 1; l <= 30; l++) { const u = unlocksAt(l); if (u.length) return `Próximo desbloqueio no nível ${l}: ${esc(u.join(', '))}.`; }
  return 'Você já desbloqueou tudo!';
}

function paintPill() {
  const pill = document.querySelector('.me-pill'); if (!pill) return;
  let lv = pill.querySelector('.lv');
  if (!lv) { lv = document.createElement('span'); lv.className = 'lv'; pill.appendChild(lv); }
  lv.classList.toggle('guest', !logged());
  lv.textContent = logged() ? 'Nv ' + level() : 'Entrar';
  paintChips();
}

export function paintChips() {
  const cc = $('colorChips'), sc = $('skinChips'); if (!cc) return;
  const L = level(), cur = look();
  cc.innerHTML = COLORS.map(c => `<button class="chip${c.id === cur.color ? ' on' : ''}${c.level > L ? ' locked' : ''}" type="button" data-color="${c.id}" data-lv="${c.level}"
    style="background:${c.hex}" title="${esc(c.name)}${c.level > L ? ' · nível ' + c.level : ''}" aria-label="Cor ${esc(c.name)}"></button>`).join('');
  sc.innerHTML = SKINS.map(s => { const need = skinLevel(cur.char, s.id); return `<button class="skinBtn${s.id === cur.skin ? ' on' : ''}${need > L ? ' locked' : ''}" type="button" data-skin="${s.id}">${esc(s.name)}${need > L ? ' · nv ' + need : ''}</button>`; }).join('');
}

// marca os cards do seletor que ainda estão bloqueados
export function decorateCards(roster) {
  document.querySelectorAll('#roster .card').forEach(card => {
    const r = roster[+card.dataset.i]; if (!r) return;
    const need = lockOf(r.id);
    card.classList.toggle('locked', !!need);
    card.querySelector('.lockTag')?.remove();
    if (need) { const t = document.createElement('span'); t.className = 'lockTag'; t.textContent = '🔒 Nv ' + need; card.appendChild(t); }
  });
  paintChips();
}

export async function paintRanking() {
  const el = $('rankBody'); if (!el) return;
  try {
    const { ranking } = await api('ranking');
    if (!ranking.length) { el.innerHTML = '<p class="hint">Ninguém no ranking ainda. Crie sua conta e jogue com os amigos!</p>'; return; }
    const me = conta.perfil?.name?.toLowerCase();
    el.innerHTML = `<table class="rankT"><thead><tr><th>#</th><th>Jogador</th><th>Vitórias</th><th>Abates</th><th>Partidas</th></tr></thead><tbody>${
      ranking.map((u, i) => `<tr class="${i === 0 ? 'top1' : ''}${u.name.toLowerCase() === me ? ' mine' : ''}"><td>${i + 1}</td>
        <td><span class="dot" style="background:${colorHex(u.color)}"></span>${esc(u.name)}<span class="lvl">NV ${u.level}</span></td>
        <td>${u.online.wins}</td><td>${u.online.kills}</td><td>${u.online.matches}</td></tr>`).join('')}</tbody></table>`;
  } catch (e) { el.innerHTML = `<p class="hint">${esc(e.message)}</p>`; }
}

export { CHARS };
