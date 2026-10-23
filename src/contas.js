// Contas do FireFriends (Cloudflare D1): cadastro, login, perfil, ranking e partidas salvas.
import { levelOf, matchXp, canUse, MAX_KILLS } from '../public/progressao.js';

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const unhex = s => new Uint8Array(s.match(/../g).map(h => parseInt(h, 16)));
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const SESSION_DAYS = 60;
const NAME_RE = /^[\p{L}\p{N}_\- ]{3,16}$/u;

async function hashPass(pass, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: 100000 }, key, 256);
  return hex(bits);
}
// compara sem vazar tempo
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const fail = (msg, status = 400) => json({ erro: msg }, status);

export function profile(u) {
  const lv = levelOf(u.xp);
  return {
    id: u.id, name: u.name, xp: u.xp, ...lv, char: u.char, color: u.color, skin: u.skin,
    online: { matches: u.matches, wins: u.wins, kills: u.kills },
    solo: { matches: u.solo_matches, wins: u.solo_wins, kills: u.solo_kills },
  };
}

async function newSession(env, userId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now),
    env.DB.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)').bind(await sha256(token), userId, now + SESSION_DAYS * 864e5),
  ]);
  return token;
}

export async function userFromToken(env, token) {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  return env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ?')
    .bind(await sha256(token), Date.now()).first();
}
const bearer = req => (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');

// grava o resultado de uma partida e devolve o XP ganho
export async function saveResult(env, userId, { online, kills, place, total, win }) {
  kills = Math.max(0, Math.min(MAX_KILLS, kills | 0, Math.max(0, (total | 0) - 1)));
  place = Math.max(1, place | 0); win = win ? 1 : 0;
  // treino contra bots vale metade do XP
  const xp = online ? matchXp({ kills, place, win }) : Math.round(matchXp({ kills, place, win }) / 2);
  const cols = online ? ['matches', 'wins', 'kills'] : ['solo_matches', 'solo_wins', 'solo_kills'];
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE users SET xp = xp + ?, ${cols[0]} = ${cols[0]} + 1, ${cols[1]} = ${cols[1]} + ?, ${cols[2]} = ${cols[2]} + ?${online ? '' : ', last_solo = ?'} WHERE id = ?`)
      .bind(...(online ? [xp, win, kills, userId] : [xp, win, kills, now, userId])),
    env.DB.prepare('INSERT INTO results (user_id, at, online, kills, place, total, win, xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(userId, now, online ? 1 : 0, kills, place, total | 0, win, xp),
  ]);
  return xp;
}

export async function handleApi(request, env, path) {
  if (!env.DB) return fail('Banco de dados não configurado', 503);
  const method = request.method;
  let body = {};
  if (method === 'POST') { try { body = await request.json(); } catch { return fail('Pedido inválido'); } }

  if (path === 'ranking' && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT name, xp, char, color, skin, matches, wins, kills, solo_matches, solo_wins, solo_kills FROM users ORDER BY wins DESC, kills DESC, xp DESC LIMIT 50').all();
    return json({ ranking: results.map(u => ({ name: u.name, level: levelOf(u.xp).level, char: u.char, color: u.color, skin: u.skin,
      online: { matches: u.matches, wins: u.wins, kills: u.kills }, solo: { matches: u.solo_matches, wins: u.solo_wins, kills: u.solo_kills } })) });
  }

  if (path === 'criar' && method === 'POST') {
    const name = String(body.name ?? '').trim().replace(/\s+/g, ' '), pass = String(body.pass ?? '');
    if (!NAME_RE.test(name)) return fail('O apelido precisa de 3 a 16 letras ou números.');
    if (pass.length < 6 || pass.length > 72) return fail('A senha precisa de pelo menos 6 caracteres.');
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await hashPass(pass, salt);
    try {
      await env.DB.prepare('INSERT INTO users (name, salt, hash, created) VALUES (?, ?, ?, ?)').bind(name, salt, hash, Date.now()).run();
    } catch { return fail('Esse apelido já tem dono. Escolha outro.', 409); }
    const u = await env.DB.prepare('SELECT * FROM users WHERE name = ?').bind(name).first();
    return json({ token: await newSession(env, u.id), perfil: profile(u) });
  }

  if (path === 'entrar' && method === 'POST') {
    const name = String(body.name ?? '').trim().replace(/\s+/g, ' '), pass = String(body.pass ?? '');
    const u = await env.DB.prepare('SELECT * FROM users WHERE name = ?').bind(name).first();
    if (!u) return fail('Apelido ou senha errados.', 401);
    // depois de 5 erros seguidos, espera 1 minuto
    if (u.fails >= 5 && Date.now() - u.fail_at < 60000) return fail('Muitas tentativas. Espere um minuto e tente de novo.', 429);
    if (!same(await hashPass(pass, u.salt), u.hash)) {
      await env.DB.prepare('UPDATE users SET fails = fails + 1, fail_at = ? WHERE id = ?').bind(Date.now(), u.id).run();
      return fail('Apelido ou senha errados.', 401);
    }
    if (u.fails) await env.DB.prepare('UPDATE users SET fails = 0 WHERE id = ?').bind(u.id).run();
    return json({ token: await newSession(env, u.id), perfil: profile(u) });
  }

  const token = bearer(request);
  const u = await userFromToken(env, token);
  if (!u) return fail('Entre na sua conta de novo.', 401);

  if (path === 'eu' && method === 'GET') return json({ perfil: profile(u) });

  if (path === 'sair' && method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(await sha256(token)).run();
    return json({ ok: true });
  }

  if (path === 'equipar' && method === 'POST') {
    const pick = { char: String(body.char ?? u.char), color: String(body.color ?? u.color), skin: String(body.skin ?? u.skin) };
    if (!canUse(levelOf(u.xp).level, pick)) return fail('Isso ainda está bloqueado.', 403);
    await env.DB.prepare('UPDATE users SET char = ?, color = ?, skin = ? WHERE id = ?').bind(pick.char, pick.color, pick.skin, u.id).run();
    return json({ perfil: profile({ ...u, ...pick }) });
  }

  // partida contra bots (sem sala online): o jogo manda o resultado no fim
  if (path === 'partida' && method === 'POST') {
    if (Date.now() - u.last_solo < 40000) return fail('Partida curta demais para contar.', 429);
    const before = levelOf(u.xp).level;
    const total = Math.min(40, Math.max(2, body.total | 0));
    const xp = await saveResult(env, u.id, { online: false, kills: body.kills, place: Math.min(total, body.place | 0 || total), total, win: !!body.win && (body.place | 0) === 1 });
    const fresh = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(u.id).first();
    return json({ xp, levelBefore: before, perfil: profile(fresh) });
  }

  return fail('Não encontrado', 404);
}
