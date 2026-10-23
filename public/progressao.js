// Progressão do FireFriends: XP, níveis e o que cada nível desbloqueia.
// Usado pelo jogo (lobby) e pelo servidor (que confere o que cada conta pode usar).

// personagens: todos liberados desde o começo (pedido do Ruan); cores e acabamentos seguem por nível
export const CHARS = [
  { id: 'recruta', name: 'Recruta', level: 1 },
  { id: 'spice', name: 'Abóbora', level: 1 },
  { id: 'jules', name: 'Jules', level: 1 },
  { id: 'drift', name: 'Drift', level: 1 },
  { id: 'snakeeyes', name: 'Snake Eyes', level: 1 },
  { id: 'renegade', name: 'Renegade Raider', level: 1 },
  { id: 'midas', name: 'Midas', level: 1 },
  { id: 'masterchief', name: 'Master Chief', level: 1 },
];

// cores do jogador (corpo do Recruta, plaquinha do nome e asa-delta)
export const COLORS = [
  { id: 'laranja', name: 'Laranja', hex: '#ff8a1f', level: 1 },
  { id: 'azul', name: 'Azul', hex: '#2fb7ff', level: 1 },
  { id: 'verde', name: 'Verde', hex: '#7bdc4a', level: 1 },
  { id: 'rosa', name: 'Rosa', hex: '#ff4fa3', level: 2 },
  { id: 'roxo', name: 'Roxo', hex: '#b06bff', level: 5 },
  { id: 'amarelo', name: 'Amarelo', hex: '#ffd23f', level: 7 },
  { id: 'vermelho', name: 'Vermelho', hex: '#ff3b30', level: 9 },
  { id: 'ciano', name: 'Ciano', hex: '#34e0c4', level: 11 },
  { id: 'sombra', name: 'Sombra', hex: '#3a3d52', level: 13 },
  { id: 'gelo', name: 'Gelo', hex: '#e8f4ff', level: 14 },
];

// acabamentos de cada personagem: liberam alguns níveis depois do personagem
export const SKINS = [
  { id: 'original', name: 'Original', after: 0 },
  { id: 'dourada', name: 'Dourada', after: 3 },
  { id: 'neon', name: 'Neon', after: 7 },
];

export const XP = { match: 20, kill: 30, win: 150, top3: 40 };
export const MAX_KILLS = 30;

// XP para ir do nível n ao n+1
export const levelCost = n => 100 + 50 * n;
export function levelOf(xp) {
  let n = 1, left = Math.max(0, xp | 0);
  while (left >= levelCost(n)) { left -= levelCost(n); n++; }
  return { level: n, into: left, need: levelCost(n) };
}

export function matchXp({ kills = 0, place = 99, win = false }) {
  return XP.match + XP.kill * Math.min(MAX_KILLS, Math.max(0, kills | 0)) + (win ? XP.win : place <= 3 ? XP.top3 : 0);
}

export const charById = id => CHARS.find(c => c.id === id);
export const colorById = id => COLORS.find(c => c.id === id);
export const skinById = id => SKINS.find(s => s.id === id);
export const skinLevel = (charId, skinId) => (charById(charId)?.level ?? 99) + (skinById(skinId)?.after ?? 99);

export function canUse(level, { char, color, skin }) {
  const c = charById(char), k = colorById(color);
  return !!c && !!k && c.level <= level && k.level <= level && skinLevel(char, skin) <= level;
}

// o que libera exatamente em cada nível (para avisar "Nível 5! Liberou: …")
export function unlocksAt(level) {
  const out = [];
  for (const c of CHARS) if (c.level === level && level > 1) out.push(c.name);
  for (const k of COLORS) if (k.level === level && level > 1) out.push('cor ' + k.name);
  for (const s of SKINS) {
    if (!s.after) continue;
    const cs = CHARS.filter(c => c.level + s.after === level);
    if (cs.length === CHARS.length) out.push(`acabamento ${s.name} para todos`);
    else for (const c of cs) out.push(`${c.name} ${s.name}`);
  }
  return out;
}
