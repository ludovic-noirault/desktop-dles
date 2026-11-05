CREATE TABLE day_status (
  game_id INTEGER NOT NULL REFERENCES games(id),
  day TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('finished', 'ignored')),
  PRIMARY KEY (game_id, day)
);

ALTER TABLE games ADD COLUMN added_day TEXT;
ALTER TABLE games ADD COLUMN removed_day TEXT;
