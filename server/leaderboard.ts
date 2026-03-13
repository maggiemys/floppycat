import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "leaderboard.db");

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    score INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    ip TEXT
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_scores_score ON scores (score DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_scores_created_at ON scores (created_at)`);

export interface LeaderboardEntry {
  id: number;
  name: string;
  score: number;
  date: string;
}

export interface SubmitResult {
  id: number;
  rank: { daily: number; weekly: number; alltime: number };
}

/** Format a Date as SQLite-compatible UTC datetime string. */
function toSqliteDatetime(d: Date): string {
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

function getCutoff(period: string): string | null {
  const now = new Date();
  switch (period) {
    case "daily": {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      return toSqliteDatetime(d);
    }
    case "weekly": {
      const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return toSqliteDatetime(d);
    }
    default:
      return null;
  }
}

const stmtScoresWithCutoff = db.prepare(
  `SELECT id, name, score, created_at as date FROM scores WHERE created_at >= ? ORDER BY score DESC LIMIT ?`
);
const stmtScoresAll = db.prepare(
  `SELECT id, name, score, created_at as date FROM scores ORDER BY score DESC LIMIT ?`
);
const stmtRankWithCutoff = db.prepare(
  `SELECT COUNT(*) as count FROM scores WHERE score > ? AND created_at >= ?`
);
const stmtRankAll = db.prepare(
  `SELECT COUNT(*) as count FROM scores WHERE score > ?`
);
const stmtInsert = db.prepare(
  `INSERT INTO scores (name, score, ip) VALUES (?, ?, ?)`
);

export function getScores(period: string, limit: number = 50): LeaderboardEntry[] {
  const cutoff = getCutoff(period);
  if (cutoff) {
    return stmtScoresWithCutoff.all(cutoff, limit) as LeaderboardEntry[];
  }
  return stmtScoresAll.all(limit) as LeaderboardEntry[];
}

function getRank(score: number, period: string): number {
  const cutoff = getCutoff(period);
  if (cutoff) {
    return (stmtRankWithCutoff.get(score, cutoff) as any).count + 1;
  }
  return (stmtRankAll.get(score) as any).count + 1;
}

export function insertScore(name: string, score: number, ip: string): SubmitResult {
  const result = stmtInsert.run(name, score, ip);
  const id = result.lastInsertRowid as number;
  return {
    id,
    rank: {
      daily: getRank(score, "daily"),
      weekly: getRank(score, "weekly"),
      alltime: getRank(score, "alltime"),
    },
  };
}

// Rate limiting (in-memory)
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 5000;

export function checkRateLimit(ip: string): boolean {
  const last = rateLimitMap.get(ip);
  const now = Date.now();
  if (last && now - last < RATE_LIMIT_MS) {
    return false;
  }
  rateLimitMap.set(ip, now);
  if (rateLimitMap.size > 10000) {
    const cutoff = now - RATE_LIMIT_MS * 2;
    for (const [key, time] of rateLimitMap) {
      if (time < cutoff) rateLimitMap.delete(key);
    }
  }
  return true;
}
