CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- user_id NULL = a shared default (seeded), visible to everyone but not
-- editable by regular users. user_id set = a private entry owned by that
-- user, visible and editable only by them.
CREATE TABLE IF NOT EXISTS carriers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  iata_code  TEXT,
  icao_code  TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS aircraft (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  manufacturer TEXT,
  model        TEXT NOT NULL,
  registration TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS flights (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flight_date     TEXT,
  origin          TEXT,
  destination     TEXT,
  carrier_id      INTEGER REFERENCES carriers(id) ON DELETE SET NULL,
  aircraft_id     INTEGER REFERENCES aircraft(id) ON DELETE SET NULL,
  flight_number   TEXT,
  seat            TEXT,
  notes           TEXT,
  departure_time  TEXT,
  arrival_time    TEXT,
  duration_minutes INTEGER,
  diverted_to     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Same ownership model as carriers/aircraft: user_id NULL is the seeded
-- global dataset, user_id set is a custom airport a user added themselves
-- (e.g. a small private airfield that isn't in the default dataset).
CREATE TABLE IF NOT EXISTS airports (
  icao_code    TEXT PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  iata_code    TEXT,
  name         TEXT NOT NULL,
  municipality TEXT,
  country_code TEXT,
  continent    TEXT,
  latitude     REAL,
  longitude    REAL
);
