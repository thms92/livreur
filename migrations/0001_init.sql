CREATE TABLE IF NOT EXISTS livreurs (
  id          TEXT PRIMARY KEY,
  nom         TEXT NOT NULL,
  prenom      TEXT NOT NULL,
  telephone   TEXT NOT NULL DEFAULT '',
  color_index INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tournees (
  id          TEXT PRIMARY KEY,
  livreur_id  TEXT NOT NULL,
  date        TEXT NOT NULL,
  stops_json  TEXT NOT NULL DEFAULT '[]',
  route_json  TEXT,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tournees_date ON tournees(date);
CREATE INDEX IF NOT EXISTS idx_tournees_livreur ON tournees(livreur_id);

CREATE TABLE IF NOT EXISTS adresses (
  id     TEXT PRIMARY KEY,
  label  TEXT NOT NULL,
  ville  TEXT NOT NULL DEFAULT '',
  lat    REAL NOT NULL,
  lng    REAL NOT NULL
);
