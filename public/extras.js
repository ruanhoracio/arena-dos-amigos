// Granadas, curativos, armadilhas, veículos e replay da eliminação (killcam).
// Fica num arquivo próprio: o index.html só chama os ganchos (X.update, X.onNet...) e passa o que precisa em init().
// Rede: quem controla o personagem (o jogador ou o líder, para os bots) decide; os outros só mostram.
let A, THREE, V3;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const r2 = v => Math.round(v * 100) / 100;

// quanto cada item dá ao pegar, e o máximo que dá para carregar
const ITEMS = {
  gren: { name: 'Granada', give: 3, max: 6, color: '#7bdc4a' },
  band: { name: 'Bandagens', give: 5, max: 15, color: '#f4f4f4' },
  kit: { name: 'Kit médico', give: 1, max: 3, color: '#ff4d5e' },
  trap: { name: 'Armadilha', give: 2, max: 4, color: '#ffb347' },
};
const HEAL = { band: { dur: 1.8, hp: 15, cap: 75 }, kit: { dur: 4.5, hp: 100, cap: 100 } };
const GREN = { fuse: 2.3, radius: 7, dmg: 100, speed: 19 };
const VEH = {
  quad: { file: 'models/veiculos/quadriciclo.glb', name: 'Quadriciclo', len: 2.1, hw: .62, h: 1.25, max: 24, acc: 15, turn: 2.2, seat: [0, .95, .2], color: '#e8343a' },
  cart: { file: 'models/veiculos/carrinho-golfe.glb', name: 'Carrinho de golfe', len: 2.7, hw: .78, h: 1.9, max: 17, acc: 11, turn: 1.9, seat: [-.3, .5, .25], color: '#2f8f3a' },
};
const vehTpl = {};

const items = a => a.items ||= { gren: 0, band: 0, kit: 0, trap: 0 };
const local = a => a.kind === 'me' || a.kind === 'bot';
let seq = 0;
const newId = p => (A.net.id || 'o') + '-' + p + (seq++);

// ---------- Início ----------
export function init(api) {
  A = api; THREE = api.THREE; V3 = THREE.Vector3;
  A.GUN.gren = { key: 'gren', name: 'Granada' };
  A.GUN.trap = { key: 'trap', name: 'Armadilha' };
  A.GUN.car = { key: 'car', name: 'Atropelamento' };
  buildHud();
  const loader = new api.GLTFLoader();
  for (const [k, d] of Object.entries(VEH)) loader.loadAsync(d.file).then(g => { vehTpl[k] = prepVeh(d, g.scene); for (const v of vehicles) if (v.type === k && !v.glb) dressVeh(v); }).catch(e => console.warn('Veículo não carregou:', k, e));
}

// ---------- HUD ----------
let el = {};
function buildHud() {
  const css = document.createElement('style');
  css.textContent = `
  #xitems { position: absolute; left: 50%; bottom: calc(76px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); display: flex; gap: 6px; }
  #xitems div { background: var(--panel); border: 2px solid var(--line); border-radius: 6px; padding: 3px 8px; font-size: 14px; display: flex; gap: 6px; align-items: center; }
  #xitems div.off { opacity: .4; }
  #xitems b { font-family: var(--font-d); font-size: 11px; background: rgba(255,255,255,.16); border-radius: 3px; padding: 1px 5px; }
  #xitems i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
  #xprompt { position: absolute; left: 50%; top: calc(50% + 96px); transform: translateX(-50%); background: var(--panel); border-radius: 6px; padding: 5px 12px; font-size: 16px; white-space: nowrap; }
  #xprompt:empty { display: none; }
  #xprompt b { font-family: var(--font-d); color: var(--accent); }
  #xheal { position: absolute; left: 50%; top: calc(50% + 34px); transform: translateX(-50%); width: 180px; text-align: center; font-size: 14px; }
  #xheal span { display: block; height: 6px; margin-top: 4px; background: rgba(0,0,0,.5); border-radius: 3px; overflow: hidden; }
  #xheal span i { display: block; height: 100%; background: var(--hp); transform-origin: left; }
  #xcam { position: fixed; inset: 0; z-index: 15; pointer-events: none; }
  #xcam::before, #xcam::after { content: ""; position: absolute; left: 0; right: 0; height: 9vh; background: #000; }
  #xcam::before { top: 0; } #xcam::after { bottom: 0; }
  #xcam .tag { position: absolute; left: 50%; top: calc(9vh + 14px); transform: translateX(-50%); text-align: center; font-family: var(--font-d); text-shadow: 0 2px 6px #000; }
  #xcam .tag small { display: block; font-size: 13px; letter-spacing: 3px; color: var(--danger); }
  #xcam .tag span { font-size: 26px; }
  #xcam .tag em { display: block; font-style: normal; font-family: var(--font-b); font-size: 16px; color: var(--ink-dim); }
  #xcam .skip { position: absolute; right: 20px; bottom: calc(9vh + 14px); font-size: 15px; color: var(--ink-dim); }
  #xcam .skip b { font-family: var(--font-d); color: var(--ink); }
  #xcam .rec { position: absolute; left: 20px; top: calc(9vh + 14px); font-family: var(--font-d); font-size: 14px; color: var(--danger); animation: xblink 1s steps(2) infinite; }
  @keyframes xblink { 50% { opacity: .2; } }`;
  document.head.appendChild(css);
  const hud = document.getElementById('hud');
  const mk = (id, tag = 'div') => { const e = document.createElement(tag); e.id = id; hud.appendChild(e); return e; };
  el.items = mk('xitems'); el.prompt = mk('xprompt'); el.heal = mk('xheal'); el.heal.hidden = true;
  el.cam = document.createElement('div'); el.cam.id = 'xcam'; el.cam.hidden = true; document.body.appendChild(el.cam);
}
let hudKey = '';
function updateHud(p) {
  const it = items(p);
  const k = [it.gren, it.band, it.kit, it.trap].join();
  if (k !== hudKey) {
    hudKey = k;
    const chip = (key, name, n, col) => `<div class="${n ? '' : 'off'}"><b>${key}</b><i style="background:${col}"></i>${name} ${n}</div>`;
    el.items.innerHTML = chip('G', 'Granada', it.gren, ITEMS.gren.color) + chip('H', 'Curar', it.band + it.kit, ITEMS.kit.color) + chip('T', 'Armadilha', it.trap, ITEMS.trap.color);
  }
  let pr = '';
  if (p.alive) {
    if (p.vehicle) pr = '<b>F</b> sair · <b>W S</b> acelerar · <b>A D</b> virar · <b>Espaço</b> freio';
    else { const v = nearVeh(p); if (v) pr = `<b>F</b> dirigir ${VEH[v.type].name}`; }
  }
  if (el.prompt.innerHTML !== pr) el.prompt.innerHTML = pr;
  const h = p.healing;
  el.heal.hidden = !h;
  if (h) el.heal.innerHTML = `${h.kind === 'kit' ? 'Usando kit médico' : 'Fazendo curativo'}<span><i style="transform:scaleX(${(h.t / HEAL[h.kind].dur).toFixed(3)})"></i></span>`;
}

// ---------- Itens no chão ----------
const M = (c, o) => new THREE.MeshStandardMaterial({ color: c, roughness: .55, ...o });
function grenadeMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 10), M('#4f7a2c', { roughness: .7 })); body.scale.y = 1.15; g.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(.035, .04, .05, 8), M('#9aa0a8', { metalness: .6 })); top.position.y = .11; g.add(top);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(.025, .14, .03), M('#9aa0a8', { metalness: .6 })); lever.position.set(.07, .06, 0); lever.rotation.z = -.25; g.add(lever);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.03, .007, 6, 14), M('#d8d8d8', { metalness: .7 })); ring.position.set(-.05, .13, 0); g.add(ring);
  const led = new THREE.Mesh(new THREE.SphereGeometry(.018, 6, 6), new THREE.MeshBasicMaterial({ color: '#ff3030' })); led.position.set(0, .03, .095); g.add(led);
  g.userData.led = led;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function trapMesh() {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.5, .08, 1.5), M('#5a5f66', { metalness: .5, roughness: .4 })); plate.position.y = .04; plate.receiveShadow = true; g.add(plate);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(1.6, .05, 1.6), M('#ffb347', { emissive: '#7a4a00', emissiveIntensity: .4 })); rim.position.y = .02; g.add(rim);
  const spikes = new THREE.Group(); g.add(spikes);
  const sg = new THREE.ConeGeometry(.07, .5, 6), sm = M('#c9ced6', { metalness: .8, roughness: .25 });
  for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(sg, sm); s.position.set(-.54 + i * .36, .25, -.54 + k * .36); s.castShadow = true; spikes.add(s); }
  spikes.position.y = -.4; g.userData.spikes = spikes;
  return g;
}
export const LOOT = {
  gren: { color: ITEMS.gren.color, mesh(g) { const m = grenadeMesh(); m.scale.setScalar(2.2); m.position.y = .5; g.add(m); g.userData.spin = m; } },
  band: { color: '#5fe36f', mesh(g) {
    const m = new THREE.Group();
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .2, 16), M('#f2efe6', { roughness: .9 })); roll.rotation.z = Math.PI / 2; m.add(roll);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(.2, .02, .34), M('#f2efe6', { roughness: .9 })); tape.position.set(0, -.16, .12); m.add(tape);
    const c = new THREE.Mesh(new THREE.BoxGeometry(.22, .05, .05), M('#e8343a')); c.position.y = .16; m.add(c);
    m.position.y = .45; g.add(m); g.userData.spin = m;
  } },
  kit: { color: ITEMS.kit.color, mesh(g) {
    const m = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(.55, .38, .26), M('#e8343a')); m.add(b);
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(.3, .09, .28), M('#ffffff')); const c2 = c1.clone(); c2.scale.set(.3, 3.3, 1); m.add(c1, c2);
    const h = new THREE.Mesh(new THREE.TorusGeometry(.08, .02, 6, 12, Math.PI), M('#333')); h.position.y = .19; m.add(h);
    m.position.y = .5; g.add(m); g.userData.spin = m;
  } },
  trap: { color: ITEMS.trap.color, mesh(g) { const m = trapMesh(); m.userData.spikes.position.y = -.2; m.scale.setScalar(.45); m.position.y = .35; m.rotation.x = .5; g.add(m); g.userData.spin = m; } },
};
export function tryUse(a, l) {
  const d = ITEMS[l.kind]; if (!d) return null;
  const it = items(a); if (it[l.kind] >= d.max) return false;
  it[l.kind] = Math.min(d.max, it[l.kind] + d.give);
  if (a === A.player) { A.Sfx.pickup(); A.showMsg(`+${d.give} ${d.name}`, '', .9); }
  return true;
}
export function spawnLoot(L, spot) {
  for (let i = 0; i < 16; i++) { const [x, z] = spot(); L('gren', x, z); }
  for (let i = 0; i < 14; i++) { const [x, z] = spot(); L('band', x, z); }
  for (let i = 0; i < 6; i++) { const [x, z] = spot(); L('kit', x, z); }
  for (let i = 0; i < 9; i++) { const [x, z] = spot(); L('trap', x, z); }
}
export function dropLoot(a) {
  const it = items(a), p = a.pos;
  for (const k of ['gren', 'kit', 'band', 'trap']) if (it[k] > 0) { A.lootAdd(k, p.x + rand(-1.2, 1.2), p.z + rand(-1.2, 1.2)); it[k] = 0; break; }
}

// ---------- Partida ----------
const grenades = [], traps = [], vehicles = [];
export function start() {
  clear();
  for (const a of A.actors) { a.items = { gren: 0, band: 0, kit: 0, trap: 0 }; if (a.isBot) a.items.gren = A.rnd() < .5 ? 1 : 0; }
  // veículos espalhados (mesma semente para todos)
  let n = 0;
  for (const type of ['quad', 'quad', 'quad', 'quad', 'cart', 'cart', 'cart', 'cart']) {
    for (let i = 0; i < 60; i++) {
      const ang = A.rnd() * TAU, r = 22 + A.rnd() * 75, x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      if (!A.free(x, z, 3.6) || vehicles.some(v => Math.hypot(v.pos.x - x, v.pos.z - z) < 12)) continue;
      addVeh('v' + (n++), type, x, z, A.rnd() * TAU); break;
    }
  }
  rec.frames.length = 0; rec.events.length = 0;
}
export function clear() {
  for (const g of grenades) A.scene.remove(g.mesh); grenades.length = 0;
  for (const t of traps) A.scene.remove(t.mesh); traps.length = 0;
  for (const v of vehicles) { A.scene.remove(v.group); const i = A.solids.indexOf(v.solid); if (i >= 0) A.solids.splice(i, 1); } vehicles.length = 0;
  for (const f of fx) A.scene.remove(f.o); fx.length = 0;
  stopEngine(); endCam(true);
  if (arc) arc.visible = false;
}
export const busy = a => !!(a.vehicle || a.healing);
export const speedMul = a => a.healing ? .45 : 1;

// ---------- Granadas ----------
let arc = null;
function throwVel(a, dir) { return dir.clone().multiplyScalar(GREN.speed).add(new V3(0, 3.5, 0)).addScaledVector(a.vel, .4); }
function spawnGrenade(id, owner, p, v, mine) {
  const mesh = grenadeMesh(); mesh.position.copy(p); A.scene.add(mesh);
  const g = { id, owner, pos: p.clone(), vel: v.clone(), t: 0, mine, mesh, spin: new V3(rand(-9, 9), rand(-9, 9), rand(-9, 9)) };
  grenades.push(g); return g;
}
function throwGrenade(a, dir) {
  const it = items(a); if (it.gren <= 0 || !a.alive || a.gliding || a.vehicle) return;
  it.gren--;
  const p = A.eye(a).addScaledVector(dir, .6), v = throwVel(a, dir), id = newId('g');
  spawnGrenade(id, a, p, v, true);
  A.net.send({ t: 'gr', id, o: a.id, p: [r2(p.x), r2(p.y), r2(p.z)], v: [r2(v.x), r2(v.y), r2(v.z)] });
  A.Sfx.noise(.25, 'bandpass', 600, 2400, 1.5, .15 * vol(p)); a.lastShot = A.state.time;
}
function grenStep(g, dt) {
  const o = g.pos.clone(); g.vel.y -= 22 * dt; g.pos.addScaledVector(g.vel, dt);
  const r = .1, p = g.pos;
  for (const s of A.solids) {
    if (p.x < s.min.x - r || p.x > s.max.x + r || p.z < s.min.z - r || p.z > s.max.z + r || p.y < s.min.y - r || p.y > s.max.y + r) continue;
    if (o.y >= s.max.y) { p.y = s.max.y + r; g.vel.y = Math.abs(g.vel.y) < 2 ? 0 : -g.vel.y * .35; g.vel.x *= .7; g.vel.z *= .7; }
    else if (o.x < s.min.x || o.x > s.max.x) { p.x = o.x; g.vel.x *= -.4; }
    else { p.z = o.z; g.vel.z *= -.4; }
  }
  const h = A.H(p.x, p.z) + r;
  if (p.y < h) { p.y = h; g.vel.y = Math.abs(g.vel.y) < 2 ? 0 : -g.vel.y * .35; g.vel.x *= .65; g.vel.z *= .65; if (g.vel.y === 0) g.spin.multiplyScalar(.9); }
  p.x = clamp(p.x, -A.HALF, A.HALF); p.z = clamp(p.z, -A.HALF, A.HALF);
}
function updateGrenades(dt) {
  for (const g of grenades.slice()) {
    g.t += dt; grenStep(g, dt);
    g.mesh.position.copy(g.pos); g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.z += g.spin.z * dt;
    g.mesh.userData.led.visible = Math.sin(g.t * (10 + g.t * 14)) > 0;
    if (g.mine && g.t >= GREN.fuse) { A.net.send({ t: 'gx', id: g.id, p: [r2(g.pos.x), r2(g.pos.y), r2(g.pos.z)] }); explode(g, g.pos); }
    else if (!g.mine && g.t > GREN.fuse + 2) removeGrenade(g);
  }
}
function removeGrenade(g) { const i = grenades.indexOf(g); if (i >= 0) grenades.splice(i, 1); A.scene.remove(g.mesh); }
function explode(g, p) {
  removeGrenade(g);
  boomFx(p); rec.events.push({ t: A.state.time, boom: p.clone() });
  const src = g.owner, R = GREN.radius;
  for (const a of A.actors) {
    if (!a.alive || a.gliding) continue;
    const c = a.pos.clone().setY(a.pos.y + .9), d = c.distanceTo(p); if (d > R) continue;
    const dir = c.clone().sub(p); const L = dir.length() || 1; dir.divideScalar(L);
    const o = p.clone().setY(p.y + .3), los = A.raycast(o, c.clone().sub(o).normalize(), c.distanceTo(o), null, false).type == null;
    if (!los && d > 2.2) continue;
    const k = 1 - d / R, dmg = Math.round(lerp(18, GREN.dmg, k * k));
    if (local(a)) {
      A.damage(a, dmg, src, A.GUN.gren, false, src === A.player ? c : null);
      if (!a.vehicle) { a.vel.addScaledVector(dir, 11 * k); a.vel.y += 6 * k; a.onGround = false; }
    } else if (src === A.player) { A.dmgNumber(c, dmg, false, a.sh > 0); A.hitmarker(false); A.Sfx.hit(false); }
  }
  for (const t of traps.slice()) if (t.pos.distanceTo(p) < 2.5) removeTrap(t, true);
}

// ---------- Efeitos ----------
const fx = [];
const fireTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(.35, 'rgba(255,180,60,.95)'); gr.addColorStop(.7, 'rgba(230,70,20,.6)'); gr.addColorStop(1, 'rgba(120,20,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
})();
const smokeTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
})();
let texF, texS;
function sprite(tex, color, additive) {
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
}
function vol(p) { return A.player ? 1 / (1 + A.player.pos.distanceTo(p) / 18) : 1; }
function boomFx(p, quiet) {
  texF ||= new THREE.CanvasTexture(fireTex); texS ||= new THREE.CanvasTexture(smokeTex);
  for (let i = 0; i < 5; i++) {
    const s = sprite(texF, 0xffffff, true); s.position.copy(p).add(new V3(rand(-.6, .6), rand(0, .8), rand(-.6, .6))); A.scene.add(s);
    fx.push({ o: s, t: 0, life: rand(.35, .55), grow: rand(5, 7), kind: 'fire' });
  }
  for (let i = 0; i < 12; i++) {
    const s = sprite(texS, new THREE.Color().setHSL(0, 0, rand(.25, .45))); s.position.copy(p).add(new V3(rand(-1, 1), rand(0, 1), rand(-1, 1))); A.scene.add(s);
    fx.push({ o: s, t: 0, life: rand(1.6, 2.6), grow: rand(3, 5), kind: 'smoke', v: new V3(rand(-1, 1), rand(1, 2.4), rand(-1, 1)) });
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(.6, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  ring.position.set(p.x, A.H(p.x, p.z) + .08, p.z); A.scene.add(ring); fx.push({ o: ring, t: 0, life: .45, grow: 14, kind: 'ring' });
  A.burst(p.clone().setY(p.y + .2), '#ffb030', 18, new V3(0, -1, 0), 9);
  A.burst(p.clone().setY(p.y + .2), '#5a4a3a', 12, new V3(0, -1, 0), 6);
  A.flashLight.position.copy(p).setY(p.y + 1); A.flashLight.intensity = 40;
  if (quiet) return;
  const v = vol(p);
  A.Sfx.noise(1.4, 'lowpass', 1400, 60, .6, .9 * v); A.Sfx.tone(90, 28, .9, 'sine', .7 * v); A.Sfx.noise(.25, 'bandpass', 3000, 800, .8, .35 * v);
  if (A.player) A.addShake(clamp(1.4 - A.player.pos.distanceTo(p) / 18, 0, 1) * .5);
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt; const k = f.t / f.life;
    if (k >= 1) { A.scene.remove(f.o); fx.splice(i, 1); continue; }
    if (f.kind === 'fire') { f.o.scale.setScalar(1 + f.grow * Math.sqrt(k)); f.o.material.opacity = 1 - k; }
    else if (f.kind === 'smoke') { f.o.position.addScaledVector(f.v, dt); f.v.multiplyScalar(.97); f.o.scale.setScalar(1.5 + f.grow * Math.sqrt(k)); f.o.material.opacity = .75 * (1 - k); }
    else if (f.kind === 'ring') { f.o.scale.setScalar(1 + f.grow * k); f.o.material.opacity = 1 - k; }
    else if (f.kind === 'spikes') { f.o.userData.spikes.position.y = Math.min(0, -.4 + f.t * 6); if (k > .7) f.o.scale.setScalar(1 - (k - .7) / .3); }
  }
}
function updateArc(p) {
  const show = p.alive && aimingG && items(p).gren > 0 && !p.vehicle && !p.gliding;
  if (!show) { if (arc) arc.visible = false; return; }
  if (!arc) {
    arc = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3)), new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: .25, gapSize: .18, transparent: true, opacity: .85, depthTest: false }));
    arc.frustumCulled = false; arc.renderOrder = 10; A.scene.add(arc);
  }
  arc.visible = true;
  const dir = A.aimDir(), sim = { pos: A.eye(p).addScaledVector(dir, .6), vel: throwVel(p, dir) }, pos = arc.geometry.attributes.position;
  let n = 0;
  for (; n < 60; n++) {
    pos.setXYZ(n, sim.pos.x, sim.pos.y, sim.pos.z);
    sim.vel.y -= 22 * .04; sim.pos.addScaledVector(sim.vel, .04);
    if (sim.pos.y < A.groundAt(sim.pos.x, sim.pos.z, sim.pos.y + .5)) { n++; pos.setXYZ(n < 60 ? n : 59, sim.pos.x, sim.pos.y, sim.pos.z); n++; break; }
  }
  arc.geometry.setDrawRange(0, Math.min(60, n)); pos.needsUpdate = true; arc.computeLineDistances();
}

// ---------- Curativos ----------
function startHeal(a) {
  const it = items(a); if (a.healing || !a.alive || a.vehicle) return false;
  let kind = null;
  if (it.kit > 0 && a.hp <= 50) kind = 'kit';
  else if (it.band > 0 && a.hp < HEAL.band.cap) kind = 'band';
  else if (it.kit > 0 && a.hp < 100) kind = 'kit';
  if (!kind) { if (a === A.player) A.showMsg(it.band + it.kit ? 'Vida já está cheia' : 'Sem curativos', it.band ? 'Bandagem cura até 75' : '', 1.2); return false; }
  a.healing = { kind, t: 0 };
  if (a === A.player) A.Sfx.noise(.3, 'highpass', 2500, 0, 1, .12);
  return true;
}
function updateHeal(a, dt) {
  const h = a.healing; if (!h) return;
  if (!a.alive || a.vehicle) { a.healing = null; return; }
  h.t += dt;
  const H = HEAL[h.kind];
  if (h.t >= H.dur) {
    a.healing = null; const it = items(a); if (it[h.kind] <= 0) return;
    it[h.kind]--; a.hp = Math.min(H.cap, Math.max(a.hp, a.hp + H.hp));
    if (a === A.player) { A.Sfx.pickup(); A.showMsg(h.kind === 'kit' ? 'Vida cheia' : '+15 vida', '', .8); }
  }
}

// ---------- Armadilhas ----------
function placeTrap(a, id, p, yaw, owner) {
  if (!id) {
    const it = items(a); if (it.trap <= 0 || !a.alive || a.gliding || a.vehicle) return;
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw), x = a.pos.x + fx * 2.2, z = a.pos.z + fz * 2.2;
    if (Math.abs(A.groundAt(x, z, a.pos.y + .6) - a.pos.y) > 1.2) { if (a === A.player) A.showMsg('Não cabe aqui', '', .8); return; }
    it.trap--; id = newId('t'); p = new V3(x, A.groundAt(x, z, a.pos.y + .6), z); yaw = a.yaw; owner = a;
    A.net.send({ t: 'tp', id, o: a.id, p: [r2(p.x), r2(p.y), r2(p.z)], y: r2(yaw) });
    if (a === A.player) A.Sfx.build ? A.Sfx.build() : A.Sfx.click();
  }
  const mesh = trapMesh(); mesh.position.copy(p); mesh.rotation.y = yaw; A.scene.add(mesh);
  traps.push({ id, pos: p.clone(), owner, mesh, armT: .8 });
}
function removeTrap(t, burst) {
  const i = traps.indexOf(t); if (i >= 0) traps.splice(i, 1);
  if (burst) { A.scene.remove(t.mesh); A.burst(t.pos.clone().setY(t.pos.y + .3), '#c9ced6', 10, new V3(0, -1, 0), 4); }
  else fx.push({ o: t.mesh, t: 0, life: 1.4, kind: 'spikes' });
}
function updateTraps(dt) {
  for (const t of traps.slice()) {
    t.armT -= dt; if (t.armT > 0) continue;
    for (const a of A.actors) {
      if (!a.alive || !local(a) || a === t.owner || a.gliding || a.vehicle) continue;
      if (Math.abs(a.pos.x - t.pos.x) < .95 && Math.abs(a.pos.z - t.pos.z) < .95 && Math.abs(a.pos.y - t.pos.y) < 1) {
        A.net.send({ t: 'tg', id: t.id }); springTrap(t);
        A.damage(a, 80, t.owner, A.GUN.trap, false, null); a.vel.y = 5; a.onGround = false;
        break;
      }
    }
  }
}
function springTrap(t) {
  removeTrap(t, false);
  const v = vol(t.pos); A.Sfx.noise(.18, 'highpass', 1800, 0, 1, .5 * v); A.Sfx.tone(300, 120, .15, 'square', .2 * v);
  A.burst(t.pos.clone().setY(t.pos.y + .4), '#ffffff', 8, new V3(0, -1, 0), 3);
}

// ---------- Veículos ----------
function prepVeh(d, src) {
  src.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(src), s = b.getSize(new V3()), k = d.len / s.x;
  src.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  const mid = new THREE.Group(); mid.add(src); mid.scale.setScalar(k); mid.rotation.y = Math.PI / 2; // a frente do modelo (+X) vira -Z
  mid.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; for (const m of [].concat(o.material)) if (m.metalness > .6 && !m.metalnessMap) m.metalness = .3; } });
  return mid;
}
function procVeh(d) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(d.hw * 2, .5, d.len * .8), M(d.color)); body.position.y = .6; g.add(body);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .22, 12).rotateZ(Math.PI / 2), M('#222')); w.position.set(x * d.hw, .3, z * d.len * .35); g.add(w); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function dressVeh(v) {
  const d = VEH[v.type];
  if (v.body) v.group.remove(v.body);
  v.glb = !!vehTpl[v.type]; v.body = v.glb ? vehTpl[v.type].clone(true) : procVeh(d); v.group.add(v.body);
}
function addVeh(id, type, x, z, yaw) {
  const d = VEH[type], group = new THREE.Group(); group.rotation.order = 'YXZ'; A.scene.add(group);
  const v = { id, type, d, group, pos: new V3(x, A.H(x, z), z), yaw, speed: 0, vy: 0, driver: null, tp: new V3(x, A.H(x, z), z), tyaw: yaw, sendT: 0, stuckT: 0, hitT: new Map() };
  v.solid = { min: new V3(), max: new V3(), veh: v }; A.solids.push(v.solid);
  v.pos.y = groundY(v, x, z, 50);
  dressVeh(v); placeVeh(v); vehicles.push(v); return v;
}
function groundY(v, x, z, from) {
  // não conta o próprio veículo como chão
  const i = A.solids.indexOf(v.solid); if (i >= 0) A.solids.splice(i, 1);
  const y = A.groundAt(x, z, from); if (i >= 0) A.solids.splice(i, 0, v.solid);
  return y;
}
function placeVeh(v) {
  const d = v.d, c = Math.cos(v.yaw), s = Math.sin(v.yaw);
  const fx = -s, fz = -c, H = (dx, dz) => A.H(v.pos.x + dx, v.pos.z + dz);
  const hf = H(fx * d.len * .45, fz * d.len * .45), hb = H(-fx * d.len * .45, -fz * d.len * .45), hr = H(c * d.hw, -s * d.hw), hl = H(-c * d.hw, s * d.hw);
  v.group.position.copy(v.pos);
  v.group.rotation.set(clamp(Math.atan2(hf - hb, d.len * .9), -.5, .5), v.yaw, clamp(Math.atan2(hr - hl, d.hw * 2), -.4, .4));
  const ex = Math.abs(s) * d.len * .42 + Math.abs(c) * d.hw * .9, ez = Math.abs(c) * d.len * .42 + Math.abs(s) * d.hw * .9;
  v.solid.min.set(v.pos.x - ex, v.pos.y - .2, v.pos.z - ez); v.solid.max.set(v.pos.x + ex, v.pos.y + d.h * .75, v.pos.z + ez);
}
function seatPos(v, out = new V3()) { v.group.updateMatrixWorld(true); return out.set(...v.d.seat).applyMatrix4(v.group.matrixWorld); }
function vehPhysics(v, throttle, steer, brake, dt) {
  const d = v.d;
  if (brake) v.speed = damp0(v.speed, 22, dt);
  else if (throttle > 0) v.speed = Math.min(d.max, v.speed + d.acc * throttle * dt * (v.speed < 0 ? 2.5 : 1));
  else if (throttle < 0) v.speed = Math.max(-7, v.speed + d.acc * throttle * dt * (v.speed > 0 ? 2.5 : .6));
  else v.speed = damp0(v.speed, 4, dt);
  const grip = clamp(Math.abs(v.speed) / 5, 0, 1) * Math.sign(v.speed);
  v.yaw -= steer * d.turn * grip * dt * (1 - Math.abs(v.speed) / d.max * .35);
  const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
  const ox = v.pos.x, oz = v.pos.z;
  v.pos.x += fx * v.speed * dt; v.pos.z += fz * v.speed * dt;
  // bate em paredes, árvores e outros veículos (pontos da frente e de trás)
  let hit = 0;
  for (const k of [.38, -.38]) {
    const px = v.pos.x + fx * d.len * k, pz = v.pos.z + fz * d.len * k, R = d.hw;
    for (const s of A.solids) {
      if (s === v.solid || s.max.y <= v.pos.y + .75 || s.min.y >= v.pos.y + 1.4) continue;
      const cx = clamp(px, s.min.x, s.max.x), cz = clamp(pz, s.min.z, s.max.z), dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      const dd = Math.sqrt(d2) || .01, push = R - dd;
      v.pos.x += dx / dd * push; v.pos.z += dz / dd * push; hit = Math.max(hit, Math.abs(v.speed));
    }
  }
  if (Math.abs(v.pos.x) > A.HALF - 1 || Math.abs(v.pos.z) > A.HALF - 1) { v.pos.x = clamp(v.pos.x, -A.HALF + 1, A.HALF - 1); v.pos.z = clamp(v.pos.z, -A.HALF + 1, A.HALF - 1); hit = Math.abs(v.speed); }
  if (hit) {
    if (hit > 6 && v.driver === A.player) { A.Sfx.noise(.25, 'lowpass', 500, 80, 1, .5); A.addShake(.25); }
    v.speed *= hit > 4 ? -.25 : .5;
  }
  const g = groundY(v, v.pos.x, v.pos.z, v.pos.y + .7);
  v.vy -= 22 * dt; v.pos.y += v.vy * dt;
  if (v.pos.y <= g) { v.pos.y = g; v.vy = 0; } else if (v.pos.y - g < .25 && v.vy <= 0) { v.pos.y = g; v.vy = 0; }
  v.vel = new V3((v.pos.x - ox) / dt, v.vy, (v.pos.z - oz) / dt);
  placeVeh(v);
  // atropelamento: quem dirige calcula e manda o dano
  if (Math.abs(v.speed) > 5 && v.driver) {
    for (const a of A.actors) {
      if (!a.alive || a === v.driver || a.vehicle || a.gliding) continue;
      const lx = a.pos.x - v.pos.x, lz = a.pos.z - v.pos.z, along = lx * fx + lz * fz, side = lx * fz - lz * fx;
      if (Math.abs(along) > d.len * .55 || Math.abs(side) > d.hw + .4 || Math.abs(a.pos.y - v.pos.y) > 1.6) continue;
      const last = v.hitT.get(a) || -9; if (A.state.time - last < .8) continue;
      v.hitT.set(a, A.state.time);
      const dmg = Math.round(Math.abs(v.speed) * 2.6);
      A.damage(a, dmg, v.driver, A.GUN.car, false, v.driver === A.player ? a.pos.clone().setY(a.pos.y + 1.2) : null);
      if (local(a)) { a.vel.set(fx * v.speed * .8 + side * 2, 7, fz * v.speed * .8); a.onGround = false; }
      A.Sfx.noise(.2, 'lowpass', 700, 100, 1, .45 * vol(a.pos));
      v.speed *= .8;
    }
  }
}
const damp0 = (v, k, dt) => Math.sign(v) * Math.max(0, Math.abs(v) - k * dt);
function nearVeh(a) {
  let best = null, bd = 3.4;
  for (const v of vehicles) { if (v.driver) continue; const d = Math.hypot(v.pos.x - a.pos.x, v.pos.z - a.pos.z); if (d < bd && Math.abs(v.pos.y - a.pos.y) < 2) { bd = d; best = v; } }
  return best;
}
function enterVeh(a, v, fromNet) {
  if (v.driver && v.driver !== a) return false;
  if (a.vehicle && a.vehicle !== v) exitVeh(a, true);
  v.driver = a; a.vehicle = v; a.healing = null; v.tp.copy(v.pos); v.tyaw = v.yaw;
  if (!fromNet) { v.speed = 0; A.net.send({ t: 'vi', id: v.id, d: a.id }); }
  if (a === A.player) { startEngine(); A.showMsg(VEH[v.type].name, 'W acelera · A/D vira · F sai', 1.6); }
  return true;
}
function exitVeh(a, fromNet) {
  const v = a.vehicle; if (!v) return;
  a.vehicle = null; if (v.driver === a) v.driver = null;
  if (a === A.player) stopEngine();
  if (fromNet) return;
  const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
  for (const side of [-1, 1]) {
    const x = v.pos.x + -c * side * (v.d.hw + .9), z = v.pos.z + s * side * (v.d.hw + .9);
    if (A.free ? Math.abs(A.groundAt(x, z, v.pos.y + 1.5) - v.pos.y) < 1.5 : true) { a.pos.set(x, A.groundAt(x, z, v.pos.y + 1.5), z); break; }
  }
  a.vel.set(0, 2, 0); a.onGround = false; v.speed *= .3;
  A.net.send({ t: 'vo', id: v.id, d: a.id, p: [r2(v.pos.x), r2(v.pos.y), r2(v.pos.z)], y: r2(v.yaw) });
}
// chamado pelo playerUpdate depois de mirar com o mouse; devolve true quando o jogador está dirigindo
export function drive(a, dt) {
  const v = a.vehicle; if (!v) return false;
  const k = A.keys;
  vehPhysics(v, (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0), (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), !!k.Space, dt);
  seatPos(v, a.pos); a.pos.y -= .9; a.vel.copy(v.vel || a.vel); a.onGround = true; a.gliding = false;
  engine(Math.abs(v.speed) / v.d.max);
  return true;
}
// pose sentada (chamado pelo animateRig); devolve true quando já posicionou o boneco
export function seat(a, dt) {
  const v = a.vehicle; if (!v) return false;
  const r = a.rig;
  seatPos(v, r.root.position); r.root.position.y -= .9; r.root.rotation.set(v.group.rotation.x * .5, v.yaw, 0);
  A.setRigGun(r, null); r.glider.visible = false;
  r.legL.rotation.x = r.legR.rotation.x = 1.35; r.torso.rotation.x = .1; r.head.rotation.x = 0; r.hips.position.y = .9;
  if (r.glb) { A.playClip(r, 'idle', dt); }
  return true;
}
function updateVehicles(dt) {
  for (const v of vehicles) {
    if (v.driver && !v.driver.alive) { const d = v.driver; d.vehicle = null; v.driver = null; if (d === A.player) stopEngine(); }
    const mine = v.driver && local(v.driver);
    if (mine) {
      v.sendT -= dt;
      if (v.sendT <= 0) { v.sendT = .05; A.net.send({ t: 'vs', id: v.id, p: [r2(v.pos.x), r2(v.pos.y), r2(v.pos.z)], y: r2(v.yaw), s: r2(v.speed) }); }
    } else if (v.driver) {
      const k = 1 - Math.exp(-12 * dt);
      if (v.pos.distanceTo(v.tp) > 12) v.pos.copy(v.tp); else v.pos.lerp(v.tp, k);
      v.yaw += angDiff(v.yaw, v.tyaw) * k; placeVeh(v);
    } else if (Math.abs(v.speed) > .1 || v.pos.y > groundY(v, v.pos.x, v.pos.z, v.pos.y + .7) + .05) vehPhysics(v, 0, 0, false, dt);
  }
}
// motor: um zumbido que sobe com a velocidade
let eng = null;
function startEngine() {
  const S = A.Sfx; if (!S.ctx || eng) return;
  const o = S.ctx.createOscillator(), o2 = S.ctx.createOscillator(), f = S.ctx.createBiquadFilter(), g = S.ctx.createGain();
  o.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = 700; f.type = 'lowpass'; f.frequency.value = 600; g.gain.value = 0;
  o.connect(f); o2.connect(f); f.connect(g); g.connect(S.out); o.start(); o2.start();
  eng = { o, o2, g, f }; g.gain.setTargetAtTime(.06, S.ctx.currentTime, .2);
}
function engine(k) { if (!eng) return; const t = A.Sfx.ctx.currentTime; eng.o.frequency.setTargetAtTime(48 + k * 95, t, .08); eng.o2.frequency.setTargetAtTime(24 + k * 48, t, .08); eng.f.frequency.setTargetAtTime(400 + k * 900, t, .1); }
function stopEngine() { if (!eng) return; const e = eng; eng = null; const t = A.Sfx.ctx.currentTime; e.g.gain.setTargetAtTime(0, t, .1); setTimeout(() => { e.o.stop(); e.o2.stop(); }, 500); }

// ---------- Bots ----------
// devolve true quando o bot está dirigindo (aí o botUpdate normal não roda)
export function bot(a, dt) {
  const b = a.bot, it = items(a);
  updateHeal(a, dt);
  if (a.vehicle) { botDrive(a, dt); return true; }
  b.xT = (b.xT || 0) - dt; if (b.xT > 0) return false;
  b.xT = rand(.4, .6);
  const T = b.target;
  if (T && T.alive && a.healing) a.healing = null;
  if (T && T.alive && it.gren > 0 && A.state.time - (b.lastGren || -9) > 6 && Math.random() < .3) {
    const d = Math.hypot(T.pos.x - a.pos.x, T.pos.z - a.pos.z);
    if (d > 8 && d < 34) { const dir = lobDir(A.eye(a), T.pos.clone().setY(T.pos.y + .3).add(new V3(rand(-1.5, 1.5), 0, rand(-1.5, 1.5)))); if (dir) { throwGrenade(a, dir); b.lastGren = A.state.time; } }
  }
  if (!T && !a.gliding && a.hp < 70 && it.band + it.kit > 0) startHeal(a);
  if (!T && !a.gliding && it.trap > 0 && Math.random() < .03) placeTrap(a);
  // pega um veículo para ir longe
  if (!T && !a.gliding && !a.healing && (b.mode === 'roam' || b.mode === 'storm')) {
    const far = b.wantVeh ? b.vehGoal : b.goal;
    if (Math.hypot(far.x - a.pos.x, far.z - a.pos.z) > 45) {
      if (b.wantVeh && !b.wantVeh.driver && Math.hypot(b.wantVeh.pos.x - a.pos.x, b.wantVeh.pos.z - a.pos.z) < 3.2) { if (enterVeh(a, b.wantVeh)) { b.goal.copy(b.vehGoal); b.wantVeh = null; b.driveT = 0; } }
      else if (!b.wantVeh) {
        let best = null, bd = 30;
        for (const v of vehicles) { if (v.driver || vehicles.some(o => o !== v && false)) continue; const d = Math.hypot(v.pos.x - a.pos.x, v.pos.z - a.pos.z); if (d < bd) { bd = d; best = v; } }
        if (best && !A.actors.some(o => o !== a && o.bot && o.bot.wantVeh === best)) { b.wantVeh = best; b.vehGoal = b.goal.clone(); b.goal.copy(best.pos); b.goalT = 8; }
      } else if (b.wantVeh.driver || b.goalT <= 0) { b.goal.copy(b.vehGoal); b.wantVeh = null; }
      else b.goal.copy(b.wantVeh.pos);
    } else if (b.wantVeh) b.wantVeh = null;
  }
  return false;
}
function lobDir(o, t) {
  const dx = t.x - o.x, dz = t.z - o.z, x = Math.hypot(dx, dz), y = t.y - o.y, v = GREN.speed, g = 22;
  const disc = v ** 4 - g * (g * x * x + 2 * y * v * v); if (disc < 0) return null;
  const th = Math.atan((v * v - Math.sqrt(disc)) / (g * x));
  return new V3(dx / x * Math.cos(th), Math.sin(th), dz / x * Math.cos(th)).normalize();
}
function botDrive(a, dt) {
  const b = a.bot, v = a.vehicle;
  b.driveT = (b.driveT || 0) + dt;
  let gx = b.goal.x, gz = b.goal.z;
  if (A.outside(a.pos, A.storm.c, A.storm.r - 4)) { gx = A.storm.toC.x; gz = A.storm.toC.z; }
  const dx = gx - v.pos.x, dz = gz - v.pos.z, L = Math.hypot(dx, dz), diff = angDiff(v.yaw, Math.atan2(-dx, -dz));
  let thr = Math.abs(diff) < 1.1 ? 1 : .45, steer = clamp(-diff * 2, -1, 1);
  if (b.reverseT > 0) { b.reverseT -= dt; thr = -1; steer = -steer; }
  vehPhysics(v, thr, steer, false, dt);
  seatPos(v, a.pos); a.pos.y -= .9; a.vel.copy(v.vel || a.vel); a.onGround = true;
  a.yaw = v.yaw; a.pitch = 0;
  if (Math.abs(v.speed) < 1.5 && b.driveT > 1.5 && !(b.reverseT > 0)) { b.stuckT2 = (b.stuckT2 || 0) + dt; if (b.stuckT2 > 1.2) { b.reverseT = 1; b.stuckT2 = 0; b.stuckN = (b.stuckN || 0) + 1; } }
  b.lookT = (b.lookT || 0) - dt;
  let leave = L < 10 || (b.stuckN || 0) > 3 || b.driveT > 40 || (A.state.time - b.lastHitT < .3);
  if (b.lookT <= 0) {
    b.lookT = .4;
    for (const o of A.actors) if (o !== a && o.alive && !o.gliding && o.pos.distanceTo(a.pos) < 30 && A.canSee(a, o)) { leave = true; break; }
  }
  if (leave) { exitVeh(a); b.stuckN = 0; b.mode = 'roam'; b.goalT = 0; b.think = 0; }
}

// ---------- Teclas do jogador ----------
let prevKeys = {}, aimingG = false;
function playerKeys(p) {
  const k = A.keys, down = c => k[c] && !prevKeys[c];
  if (p.alive && !A.state.paused) {
    if (down('KeyF')) { if (p.vehicle) exitVeh(p); else { const v = nearVeh(p); if (v && !p.gliding) enterVeh(p, v); } }
    if (down('KeyH')) { if (p.healing) p.healing = null; else startHeal(p); }
    if (down('KeyT')) placeTrap(p);
    if (k.KeyG && !p.vehicle) aimingG = true;
    else if (aimingG) { aimingG = false; throwGrenade(p, A.aimDir()); }
    if (p.healing && (A.input.fire || k.Digit1 || k.Digit2 || k.Digit3)) p.healing = null;
  } else aimingG = false;
  prevKeys = { KeyF: k.KeyF, KeyH: k.KeyH, KeyT: k.KeyT };
}

// ---------- Laço ----------
export function update(dt) {
  const p = A.player; if (!p) return;
  if (A.state.mode === 'play') playerKeys(p);
  updateHeal(p, dt);
  updateGrenades(dt); updateTraps(dt); updateVehicles(dt); updateFx(dt);
  updateArc(p);
  if (!p.vehicle && eng) stopEngine();
  record(dt);
  if (!cam) updateHud(p);
}
export function afterCamera(dt) {
  const p = A.player; if (!p) return;
  if (cam) { camStep(dt); return; }
  const v = p.vehicle; if (!v || !p.alive) return;
  const pivot = v.pos.clone().setY(v.pos.y + 1.7);
  const dir = new V3(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
  const want = pivot.clone().addScaledVector(dir, -6.5).add(new V3(0, 1.1, 0));
  const g = A.H(want.x, want.z) + .5; if (want.y < g) want.y = g;
  A.camera.position.copy(want); A.camera.lookAt(pivot.clone().addScaledVector(dir, 8));
  p.rig.root.visible = true;
}
export function onKill(t) { if (t.vehicle) { const v = t.vehicle; t.vehicle = null; if (v.driver === t) v.driver = null; if (t === A.player) stopEngine(); } t.healing = null; }

// ---------- Rede ----------
export function onNet(m) {
  const by = id => A.byId(id), P = a => new V3(a[0], a[1], a[2]);
  switch (m.t) {
    case 'gr': if (!grenades.some(g => g.id === m.id)) { const o = by(m.o); spawnGrenade(m.id, o, P(m.p), P(m.v), false); if (o) o.lastShot = A.state.time; } break;
    case 'gx': { const g = grenades.find(x => x.id === m.id) || { id: m.id, owner: null, mesh: new THREE.Object3D() }; if (!g.owner) { const o = m.id.split('-')[0]; g.owner = A.actors.find(a => a.id === o) || null; } explode(g, P(m.p)); break; }
    case 'tp': if (!traps.some(t => t.id === m.id)) placeTrap(null, m.id, P(m.p), m.y, by(m.o)); break;
    case 'tg': { const t = traps.find(x => x.id === m.id); if (t) springTrap(t); break; }
    case 'vi': { const v = vehicles.find(x => x.id === m.id), a = by(m.d); if (v && a) { if (v.driver && v.driver !== a && local(v.driver)) { if (v.driver.id < a.id) break; exitVeh(v.driver, true); } enterVeh(a, v, true); } break; }
    case 'vo': { const v = vehicles.find(x => x.id === m.id), a = by(m.d); if (v) { if (a && a.vehicle === v) exitVeh(a, true); v.driver = null; v.pos.copy(P(m.p)); v.yaw = m.y; v.speed = 0; placeVeh(v); } break; }
    case 'vs': { const v = vehicles.find(x => x.id === m.id); if (v && v.driver && !local(v.driver)) { v.tp.copy(P(m.p)); v.tyaw = m.y; v.speed = m.s; } break; }
  }
}

// ---------- Replay da eliminação ----------
const REC_LEN = 7;
const rec = { frames: [], events: [], t: 0 };
function record(dt) {
  if (cam) return;
  rec.t -= dt; if (rec.t > 0) return; rec.t = 1 / 30;
  const now = A.state.time;
  rec.frames.push({
    t: now,
    a: A.actors.filter(a => a.alive || now - (a.deadAt ?? now) < 2).map(a => ({ id: a.id, x: a.pos.x, y: a.pos.y, z: a.pos.z, yaw: a.yaw, pitch: a.pitch, k: A.slot(a)?.w.key || '', sp: Math.hypot(a.vel.x, a.vel.z), g: a.onGround, gl: a.gliding, al: a.alive, v: a.vehicle ? a.vehicle.id : null })),
    v: vehicles.map(v => [v.id, v.pos.x, v.pos.y, v.pos.z, v.yaw, v.group.rotation.x, v.group.rotation.z]),
    g: grenades.map(g => [g.pos.x, g.pos.y, g.pos.z]),
  });
  while (rec.frames.length && rec.frames[0].t < now - REC_LEN) rec.frames.shift();
  while (rec.events.length && rec.events[0].t < now - REC_LEN) rec.events.shift();
}
export function onTracer(a, b) { if (!cam) rec.events.push({ t: A.state.time, a: a.clone(), b: b.clone() }); }

let cam = null;
export function playerDied(src, w, done) {
  const p = A.player;
  if (!src || src === p || rec.frames.length < 10) { setTimeout(done, 2200); return; }
  const deathT = A.state.time;
  setTimeout(() => { if (A.state.mode === 'play' && A.player === p) startCam(src, p, w, deathT, done); else done(); }, 1300);
}
function startCam(killer, victim, w, deathT, done) {
  const t0 = Math.max(rec.frames[0].t, deathT - 5), ids = new Set([killer.id, victim.id]);
  // quem aparece: assassino, vítima e quem estava por perto
  for (const f of rec.frames) if (f.t >= t0) for (const s of f.a) {
    if (ids.size >= 10) break;
    const k = f.a.find(x => x.id === killer.id); if (k && Math.hypot(s.x - k.x, s.z - k.z) < 45) ids.add(s.id);
  }
  const ghosts = new Map();
  for (const id of ids) {
    const a = A.byId(id); if (!a) continue;
    const rig = A.makeRig(a.ch); if (A.gltfs[a.ch.id]) A.dressRig(rig, A.gltfs[a.ch.id]); A.scene.add(rig.root);
    rig.tag.visible = false;
    ghosts.set(id, { rig, ch: a.ch, pos: new V3(), vel: new V3(), yaw: 0, pitch: 0, alive: true, deathT: 0, gliding: false, onGround: true, inv: [null], wi: 0, kickV: 0, lastShot: -9, vehicle: null, src: a });
  }
  for (const a of A.actors) a.rig.root.visible = false;
  for (const g of grenades) g.mesh.visible = false;
  const gm = Array.from({ length: 6 }, () => { const m = grenadeMesh(); m.visible = false; A.scene.add(m); return m; });
  cam = { killer, victim, w, t: t0, t0, end: deathT + 1.2, deathT, done, ghosts, gm, ev: rec.events.filter(e => e.t >= t0 - .01).slice(), frames: rec.frames.slice(), camPos: null };
  const hud = document.getElementById('hud'); cam.hudWas = hud.hidden; hud.hidden = true;
  el.cam.innerHTML = `<div class="rec">● REPLAY</div><div class="tag"><small>Você foi eliminado por</small><span>${A.esc(killer.name)}</span><em>${w ? A.esc(w.name) : ''}</em></div><div class="skip"><b>Espaço</b> pular</div>`;
  el.cam.hidden = false;
  if (A.Sfx.glide) A.Sfx.glide(false);
}
function frameAt(t) {
  const F = cam.frames; let i = 0;
  while (i < F.length - 2 && F[i + 1].t < t) i++;
  const a = F[i], b = F[Math.min(i + 1, F.length - 1)], k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
  return [a, b, k];
}
function camStep(dt) {
  const c = cam, slow = c.t > c.deathT - 1 && c.t < c.deathT + .4 ? .35 : 1;
  const st = dt * slow; c.t += st;
  if (A.keys.Space || c.t >= c.end || A.state.mode !== 'play') { const d = c.done; endCam(); d(); return; }
  const [fa, fb, k] = frameAt(c.t);
  // veículos na posição gravada
  for (const r of fa.v) {
    const v = vehicles.find(x => x.id === r[0]); if (!v) continue; const r1 = fb.v.find(x => x[0] === r[0]) || r;
    v.group.position.set(lerp(r[1], r1[1], k), lerp(r[2], r1[2], k), lerp(r[3], r1[3], k)); v.group.rotation.set(r[5], r[4] + angDiff(r[4], r1[4]) * k, r[6]);
  }
  c.gm.forEach((m, i) => { const g = fa.g[i], g1 = fb.g[i]; m.visible = !!g; if (g) m.position.set(lerp(g[0], (g1 || g)[0], k), lerp(g[1], (g1 || g)[1], k), lerp(g[2], (g1 || g)[2], k)); });
  for (const [id, g] of c.ghosts) {
    const s = fa.a.find(x => x.id === id), s1 = fb.a.find(x => x.id === id) || s;
    if (!s) { g.rig.root.visible = false; continue; }
    g.rig.root.visible = true;
    g.pos.set(lerp(s.x, s1.x, k), lerp(s.y, s1.y, k), lerp(s.z, s1.z, k));
    g.yaw = s.yaw + angDiff(s.yaw, s1.yaw) * k; g.pitch = lerp(s.pitch, s1.pitch, k);
    g.vel.set(s.sp, 0, 0); g.onGround = s.g; g.gliding = s.gl;
    g.inv[0] = s.k && A.GUN[s.k] && A.GUN[s.k].mag ? { w: A.GUN[s.k], mag: 1 } : null;
    g.vehicle = s.v ? vehicles.find(v => v.id === s.v) || null : null;
    if (g.alive && (!s.al || (id === c.victim.id && c.t >= c.deathT))) { g.alive = false; g.deathT = 0; }
    A.animateRig(g, st);
  }
  // tiros e explosões gravados
  while (c.ev.length && c.ev[0].t <= c.t) {
    const e = c.ev.shift();
    if (e.boom) boomFx(e.boom, false);
    else {
      A.tracer(e.a, e.b);
      let near = null, nd = 1.6; for (const g of c.ghosts.values()) { const d = g.pos.distanceTo(e.a) - 1.4; if (d < nd) { nd = d; near = g; } }
      if (near) { near.lastShot = A.state.time; near.kickV = 1; const gun = near.rig.guns[near.rig.curGun]; if (gun) { gun.flash.visible = true; gun.flash.userData.t = .05; } }
      if (near === c.ghosts.get(c.killer.id) && near.inv[0]) A.Sfx.shot(near.inv[0].w, .7);
    }
  }
  // câmera no ombro de quem matou, olhando para onde ele mirava
  const K = c.ghosts.get(c.killer.id);
  if (K) {
    const V = c.ghosts.get(c.victim.id), piv = K.pos.clone().setY(K.pos.y + 1.65);
    let yaw = K.yaw, pitch = K.pitch;
    if (V && (K.vehicle || K.pos.distanceTo(V.pos) < 8)) { const d = V.pos.clone().setY(V.pos.y + 1).sub(piv); yaw = Math.atan2(-d.x, -d.z); pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); }
    const dir = new V3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)), right = new V3(Math.cos(yaw), 0, -Math.sin(yaw));
    const want = piv.clone().addScaledVector(dir, K.vehicle ? -6 : -3.2).addScaledVector(right, .75).add(new V3(0, .35, 0));
    const gy = A.H(want.x, want.z) + .4; if (want.y < gy) want.y = gy;
    c.camPos = c.camPos ? c.camPos.lerp(want, 1 - Math.exp(-10 * dt)) : want;
    A.camera.position.copy(c.camPos); A.camera.lookAt(piv.clone().addScaledVector(dir, 25));
    if (A.camera.fov !== 60) { A.camera.fov = 60; A.camera.updateProjectionMatrix(); }
  }
}
function endCam(silent) {
  const c = cam; if (!c) return; cam = null;
  for (const g of c.ghosts.values()) A.scene.remove(g.rig.root);
  for (const m of c.gm) A.scene.remove(m);
  for (const a of A.actors) a.rig.root.visible = true;
  for (const g of grenades) g.mesh.visible = true;
  el.cam.hidden = true;
  if (!silent) document.getElementById('hud').hidden = c.hudWas;
}
export const replaying = () => !!cam;
// para testes automáticos
export const _t = { api: () => A, vehicles, grenades, traps, items, enterVeh, throwGrenade, placeTrap, startHeal };
