CREATE TABLE daily_pick (
  day TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT,
  synopsis TEXT,
  status TEXT NOT NULL CHECK (status IN ('shown', 'added'))
);

CREATE TABLE daily_pick_skip (
  day TEXT NOT NULL,
  slug TEXT NOT NULL,
  PRIMARY KEY (day, slug)
);

CREATE TABLE dles_info (
  url_key TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  synopsis TEXT,
  category TEXT,
  fetched_day TEXT NOT NULL
);
