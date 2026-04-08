CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL DEFAULT (datetime('now')),
    map TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'Conquest',
    class TEXT NOT NULL,
    weapon TEXT NOT NULL,
    attachments TEXT,
    kills INTEGER NOT NULL DEFAULT 0,
    deaths INTEGER NOT NULL DEFAULT 0,
    assists INTEGER NOT NULL DEFAULT 0,
    accuracy REAL,
    score INTEGER,
    win INTEGER NOT NULL DEFAULT 0,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_matches_map ON matches(map);
CREATE INDEX IF NOT EXISTS idx_matches_class_weapon ON matches(class, weapon);
