# Data Reference

All CSVs live in `data/` and are loaded at runtime. Values are read as strings and parsed to numbers where expected.

## data/config.csv

- Schema: `key,value`
- Meaning: global tunables.
- Example rows:
  - `app_name,FloppyCat`
  - `gravity,1200` — downward acceleration (px/s^2)
  - `jump_velocity,-420` — upward impulse on jump (px/s, negative = up)
  - `scroll_speed,150` — initial horizontal obstacle speed (px/s)
  - `pipe_width,52` — obstacle width (px)
  - `pipe_gap_height,150` — initial gap between top/bottom pipes (px)
  - `pipe_spacing,220` — horizontal distance between pipe centers (px)
  - `min_gap_height,100` — smallest gap after difficulty scaling (px)
  - `difficulty_interval,10` — seconds between difficulty increases
  - `gap_shrink_per_step,5` — gap reduction per difficulty step (px)
  - `speed_increase_per_step,10` — speed increase per difficulty step (px/s)
  - `cat_width,40` / `cat_height,30` — cat hitbox dimensions (px)
  - `cat_x,0.2` — horizontal position as fraction of canvas width
  - `ground_height,60` — ground strip height from bottom (px)
  - `max_velocity,600` — terminal falling speed (px/s)
  - `rotation_factor,0.002` — how velocity maps to visual tilt
  - `countdown_seconds,3` — countdown duration before multiplayer race starts
  - `multi_max_players,10` — maximum players per multiplayer room (2-10)
  - `multi_last_alive_timeout,10` — seconds to wait after second-to-last death before ending race

## leaderboard.db (SQLite)

Server-side database created automatically by `server/leaderboard.ts`.

### scores table

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique score ID |
| `name` | TEXT | NOT NULL, max 16 chars | Player display name |
| `score` | INTEGER | NOT NULL, 0-999 | Pipes passed |
| `created_at` | TEXT | NOT NULL, default `datetime('now')` | UTC timestamp |
| `ip` | TEXT | | Client IP for rate limiting (not exposed via API) |

Indexes: `idx_scores_score` (score DESC), `idx_scores_created_at`.

### API

- `GET /api/scores?period=daily|weekly|alltime` — top 50 scores for the period
- `POST /api/scores` body `{ name, score }` — returns `{ id, rank: { daily, weekly, alltime } }`
- Rate limit: 1 submission per 5 seconds per IP (HTTP 429 on violation)

## Validation rules

- When adding a new CSV, document its schema and constraints in this file.
- Use fail-fast validation in `loadData.ts` — missing required columns should throw on load, not fail silently at runtime.
