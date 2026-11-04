CREATE TABLE games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES ('shuffle', '0');

INSERT INTO games (name, url, position) VALUES
  ('Wordle', 'https://www.nytimes.com/games/wordle', 0),
  ('Scrandle', 'https://scrandle.net', 1),
  ('Videogamedle', 'https://videogamedle.web.app', 2),
  ('Farflung', 'https://farflung.game', 3);
