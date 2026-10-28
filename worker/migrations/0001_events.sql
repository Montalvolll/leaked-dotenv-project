CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  happened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  kind TEXT NOT NULL,
  actor_hash TEXT NOT NULL,
  country TEXT NOT NULL,
  user_agent TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_kind_time ON events (kind, happened_at);

