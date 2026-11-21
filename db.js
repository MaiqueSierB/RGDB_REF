import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// DB_PATH aponta para um local que sobrevive aos deploys (na Hostinger, fora da pasta do app).
// Na primeira execução, copia o servidor.sqlite do projeto para lá, preservando o ranking.
const dbPath = process.env.DB_PATH || 'servidor.sqlite';
if (dbPath !== 'servidor.sqlite' && !fs.existsSync(dbPath)) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync('servidor.sqlite')) {
    fs.copyFileSync('servidor.sqlite', dbPath);
    console.log(`Banco copiado para ${dbPath}`);
  }
}
const db = new Database(dbPath);

// jogos
db.prepare(`
CREATE TABLE IF NOT EXISTS avaliacoes_jogos (
    game_id INTEGER PRIMARY KEY,
    title TEXT,
    server_score REAL,
    vote_count INTEGER
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS votos_jogos (
    game_id INTEGER,
    user_id TEXT,
    username TEXT,
    score REAL,
    PRIMARY KEY (game_id, user_id)
)
`).run();

// usuários (XP)
db.prepare(`
CREATE TABLE IF NOT EXISTS usuarios (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1
)
`).run();

export default db;