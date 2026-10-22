// Arena dos Amigos: serve o jogo e as salas online (uma Durable Object por código de sala).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/ping') return new Response('arena-ok', { headers: { 'cache-control': 'no-store' } });
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
const clean = (v, n) => String(v ?? '').slice(0, n);

export class Room {
  constructor(ctx) { this.ctx = ctx; }

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
    return { members: list.map(({ id, name, color, charId }) => ({ id, name, color, charId })), hostId: list[0]?.id ?? null };
  }

  broadcast(msg, except) {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) { try { ws.send(s); } catch {} }
  }

  webSocketMessage(ws, data) {
    let m; try { m = JSON.parse(data); } catch { return; }
    const me = ws.deserializeAttachment() || {};
    if (m.t === 'hello' || m.t === 'me') {
      if (!me.id && this.roster().members.length >= MAX_PLAYERS) { ws.send(JSON.stringify({ t: 'full' })); ws.close(4000, 'sala cheia'); return; }
      const info = {
        id: me.id || crypto.randomUUID().slice(0, 8), joined: me.joined || Date.now(),
        name: clean(m.name, 18) || 'Jogador', color: /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#ffffff', charId: clean(m.charId, 24),
      };
      ws.serializeAttachment(info);
      const r = this.roster();
      if (!me.id) ws.send(JSON.stringify({ t: 'welcome', id: info.id, ...r }));
      this.broadcast({ t: 'members', ...r });
      return;
    }
    if (!me.id) return;
    m.from = me.id;
    this.broadcast(m, ws);
  }

  webSocketClose(ws) { this.left(ws); }
  webSocketError(ws) { this.left(ws); }
  left(ws) {
    try { ws.close(); } catch {}
    this.broadcast({ t: 'members', ...this.roster(ws) }, ws);
  }
}
