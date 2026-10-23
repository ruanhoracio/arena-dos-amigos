// Arena dos Amigos: serve o jogo, as contas (/api/conta/...) e as salas online (uma Durable Object por código de sala).
import { handleApi, userFromToken, saveResult, profile } from './contas.js';
import { COLORS, levelOf } from '../public/progressao.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/ping') return new Response('arena-ok', { headers: { 'cache-control': 'no-store' } });
    const api = url.pathname.match(/^\/api\/conta\/([a-z]+)$/);
    if (api) {
      try { return await handleApi(request, env, api[1]); }
      catch (e) { console.error(e); return new Response(JSON.stringify({ erro: 'Erro no servidor. Tente de novo.' }), { status: 500, headers: { 'content-type': 'application/json' } }); }
    }
    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9]{4,6})$/);
    if (m) {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Esperava WebSocket', { status: 426 });
      const room = env.ROOMS.get(env.ROOMS.idFromName(m[1].toUpperCase()));
      return room.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

const MAX_PLAYERS = 16;
const MIN_MATCH_MS = 30000; // partida mais curta que isso não conta
const clean = (v, n) => String(v ?? '').slice(0, n);
const hexOf = id => COLORS.find(c => c.id === id)?.hex || '#ffffff';

export class Room {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.match = undefined; }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({});
    return new Response(null, { status: 101, webSocket: client });
  }

  // jogadores que já disseram "hello", em ordem de chegada (o primeiro é o líder)
  roster(except) {
    const list = this.ctx.getWebSockets()
      .filter(ws => ws !== except)
      .map(ws => ws.deserializeAttachment())
      .filter(a => a && a.id)
      .sort((a, b) => a.joined - b.joined);
    return { members: list.map(({ id, name, color, charId, skin, uid }) => ({ id, name, color, charId, skin, acc: !!uid })), hostId: list[0]?.id ?? null };
  }

  broadcast(msg, except) {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) { try { ws.send(s); } catch {} }
  }

  async webSocketMessage(ws, data) {
    let m; try { m = JSON.parse(data); } catch { return; }
    const me = ws.deserializeAttachment() || {};
    if (m.t === 'hello' || m.t === 'me') {
      if (!me.id && this.roster().members.length >= MAX_PLAYERS) { ws.send(JSON.stringify({ t: 'full' })); ws.close(4000, 'sala cheia'); return; }
      const info = {
        id: me.id || crypto.randomUUID().slice(0, 8), joined: me.joined || Date.now(),
        name: clean(m.name, 18) || 'Jogador', color: /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#ffffff', charId: clean(m.charId, 24), skin: 'original',
      };
      // com conta: nome, personagem e cor vêm do banco (ninguém usa o que não desbloqueou)
      const u = await this.account(m.token, me.uid);
      if (u) {
        info.uid = u.id; info.name = u.name; info.color = hexOf(u.color); info.skin = u.skin;
        info.charId = u.char;
      }
      ws.serializeAttachment(info);
      const r = this.roster();
      if (!me.id) ws.send(JSON.stringify({ t: 'welcome', id: info.id, ...r }));
      this.broadcast({ t: 'members', ...r });
      return;
    }
    if (!me.id) return;
    m.from = me.id;
    if (m.t === 'start' && me.id === this.roster().hostId) await this.startMatch(m);
    this.broadcast(m, ws);
    if (m.t === 'dead') await this.death(m, me.id);
  }

  async account(token, uid) {
    if (!this.env.DB) return null;
    try {
      if (token) return await userFromToken(this.env, clean(token, 64));
      if (uid) return await this.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(uid).first();
    } catch (e) { console.error(e); }
    return null;
  }

  // ---- placar da partida: a sala anota quem morreu e quem matou, e salva no fim ----
  // fica guardado no armazenamento da sala, porque ela pode dormir no meio da partida
  async getMatch() {
    if (this.match === undefined) this.match = (await this.ctx.storage.get('match')) || null;
    return this.match;
  }
  saveMatch() { return this.ctx.storage.put('match', this.match); }

  async startMatch(m) {
    const humans = {};
    for (const ws of this.ctx.getWebSockets()) { const p = ws.deserializeAttachment(); if (p?.id) humans[p.id] = { kills: 0, place: 0, uid: p.uid || null }; }
    const bots = Math.min(40, Array.isArray(m.bots) ? m.bots.length : 0);
    const alive = Object.keys(humans);
    for (let i = 0; i < bots; i++) alive.push('b' + i);
    this.match = { at: Date.now(), humans, alive, total: alive.length, done: false };
    await this.saveMatch();
  }

  async death(m, from) {
    const M = await this.getMatch(); if (!M || M.done) return;
    const id = String(m.id ?? '');
    if (!M.alive.includes(id)) return;
    // quem morre avisa da própria morte; morte de bot só vale vinda do líder
    if (M.humans[id] ? id !== from : from !== this.roster().hostId) return;
    M.alive = M.alive.filter(x => x !== id);
    if (M.humans[id]) M.humans[id].place = M.alive.length + 1;
    if (m.by && m.by !== id && M.humans[m.by]) M.humans[m.by].kills++;
    if (M.alive.length <= 1) await this.finish(M.alive[0]); else await this.saveMatch();
  }

  async finish(winner) {
    const M = await this.getMatch(); if (!M || M.done) return;
    M.done = true; await this.saveMatch();
    if (!this.env.DB || Date.now() - M.at < MIN_MATCH_MS) return;
    const socks = new Map(this.ctx.getWebSockets().map(ws => [ws.deserializeAttachment()?.id, ws]));
    const players = Object.entries(M.humans).map(([id, h]) => ({ id, h, ws: socks.get(id), uid: h.uid }));
    // ranking online só com 2+ pessoas de verdade na partida; sozinho com bots conta como treino
    const online = players.length >= 2;
    for (const p of players) {
      if (!p.uid) continue;
      const win = p.id === winner;
      try {
        const before = await this.env.DB.prepare('SELECT xp FROM users WHERE id = ?').bind(p.uid).first();
        const xp = await saveResult(this.env, p.uid, { online, kills: p.h.kills, place: win ? 1 : p.h.place || 1, total: M.total, win });
        const u = await this.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(p.uid).first();
        if (p.ws) try { p.ws.send(JSON.stringify({ t: 'xp', xp, online, levelBefore: levelOf(before?.xp ?? 0).level, perfil: profile(u) })); } catch {}
      } catch (e) { console.error(e); }
    }
  }

  webSocketClose(ws) { return this.left(ws); }
  webSocketError(ws) { return this.left(ws); }
  async left(ws) {
    const me = ws.deserializeAttachment() || {};
    try { ws.close(); } catch {}
    const M = await this.getMatch();
    if (M && !M.done && me.id && M.humans[me.id] && M.alive.includes(me.id)) {
      // quem sai no meio da partida fica com a colocação de agora
      M.alive = M.alive.filter(x => x !== me.id); M.humans[me.id].place = M.alive.length + 1;
      if (M.alive.length <= 1) await this.finish(M.alive[0]); else await this.saveMatch();
    }
    this.broadcast({ t: 'members', ...this.roster(ws) }, ws);
  }
}
