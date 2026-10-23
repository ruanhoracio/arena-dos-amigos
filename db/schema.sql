-- Banco D1 "firefriends": contas, sessões e partidas salvas.
-- matches/wins/kills = partidas online (ranking); solo_* = partidas contra bots.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  created INTEGER NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  matches INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  solo_matches INTEGER NOT NULL DEFAULT 0,
  solo_wins INTEGER NOT NULL DEFAULT 0,
  solo_kills INTEGER NOT NULL DEFAULT 0,
  char TEXT NOT NULL DEFAULT 'recruta',
  color TEXT NOT NULL DEFAULT 'laranja',
  skin TEXT NOT NULL DEFAULT 'original',
  fails INTEGER NOT NULL DEFAULT 0,
  fail_at INTEGER NOT NULL DEFAULT 0,
  last_solo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  at INTEGER NOT NULL,
  online INTEGER NOT NULL,
  kills INTEGER NOT NULL,
  place INTEGER NOT NULL,
  total INTEGER NOT NULL,
  win INTEGER NOT NULL,
  xp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS results_user ON results(user_id, at);
