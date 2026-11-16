CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  settings TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
  room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  seat INTEGER NOT NULL,
  name TEXT NOT NULL,
  avatar INTEGER NOT NULL,
  bot TEXT,
  ready INTEGER NOT NULL DEFAULT 0,
  seen_at BIGINT,
  PRIMARY KEY (room_code, seat)
);
CREATE TABLE IF NOT EXISTS guest_sessions (
  token_hash TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  seat INTEGER NOT NULL,
  UNIQUE (room_code, seat),
  FOREIGN KEY (room_code, seat) REFERENCES players(room_code, seat) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS games (
  room_code TEXT PRIMARY KEY REFERENCES rooms(code) ON DELETE CASCADE,
  state TEXT NOT NULL,
  deadline BIGINT,
  bot_at BIGINT
);
CREATE TABLE IF NOT EXISTS actions (
  room_code TEXT NOT NULL REFERENCES games(room_code) ON DELETE CASCADE,
  seat INTEGER NOT NULL,
  action_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  payload TEXT NOT NULL,
  reason TEXT NOT NULL,
  PRIMARY KEY (room_code, seat, action_id),
  UNIQUE (room_code, version)
);
CREATE TABLE IF NOT EXISTS results (
  room_code TEXT PRIMARY KEY REFERENCES games(room_code) ON DELETE CASCADE,
  finished_at BIGINT NOT NULL,
  result TEXT NOT NULL
);
