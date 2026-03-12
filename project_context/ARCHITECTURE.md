# Architecture Map

## Key files

- `app/index.html`: Vite entry HTML.
- `app/src/main.tsx`: React entry point.
- `app/src/App.tsx`: Main app shell, UI layout, URL param parsing (`?room=`), PVP routing.
- `app/src/styles.css`: Tailwind base, theme variables, viewport management (app-shell/game-screen/app-screen).
- `app/src/vite-env.d.ts`: Vite type definitions for `import.meta.env`.
- `app/src/data/loadData.ts`: CSV loading + validation.
- `data/config.csv`: Global tunables (includes PVP config).

## Game engine (MVC)

The game uses a strict Model-View-Controller architecture in `app/src/engine/`:

- `app/src/engine/types.ts`: Shared TypeScript interfaces (`GameState`, `GameConfig`, `CatState`, `Obstacle`, `PvpInfo`, `GamePhase` enum).
- `app/src/engine/GameModel.ts`: **Model** — owns all game data and rules (physics, collision, scoring, difficulty, PVP state). Zero knowledge of rendering or input.
- `app/src/engine/GameView.ts`: **View** — canvas renderer. Receives `Readonly<GameState>` and draws everything (including PVP lobby, countdown, ghost cat, results with crown). Zero mutation of game state.
- `app/src/engine/GameController.ts`: **Controller** — game loop (rAF), input handling, DPR canvas setup, PVP WebSocket orchestration. The only piece that talks to both Model and View.
- `app/src/engine/pvpClient.ts`: WebSocket client for PVP relay server — connect, send/receive messages, room lifecycle.
- `app/src/engine/rng.ts`: Seeded PRNG (mulberry32) for deterministic obstacle patterns in PVP.
- `app/src/components/GameCanvas.tsx`: React bridge — owns the `<canvas>` element, manages Controller lifecycle via useEffect.

## PVP Server

- `server/index.ts`: WebSocket relay server entry point. Routes messages between players.
- `server/rooms.ts`: Room creation, join, ready/rematch state, cleanup lifecycle.

## Data flow

- CSVs in `data/` are loaded at runtime via `loadData.ts` (Vite `publicDir` points to `../data`). See DATA.md for CSV schemas.
- `App.tsx` loads `config.csv`, parses it into a typed `GameConfig`, and passes it to `GameCanvas`. It also parses `?room=` URL params for PVP.
- The Controller creates the Model and View, runs the game loop, and handles input.
- High score is persisted to `localStorage`.

### PVP data flow

- Player 1 taps "Race a Friend" → Controller creates WebSocket connection to relay server → server creates room → shareable link with `?room=<id>`.
- Player 2 opens link → App detects `?room=` param → Controller joins room via WebSocket.
- Both players ready up → server generates seed + tiebreaker → sends `start` to both.
- Both clients create Models with same seed (deterministic PRNG) → identical obstacle patterns.
- During race: each client sends `{ score, alive, y }` at ~20/sec → server relays to opponent → ghost cat rendered at opponent's interpolated Y position.
- Race ends when both dead or timeout → results screen with crown on winner.

## Where to change things

- React UI: `app/src/App.tsx` + `app/src/components/*`
- Game state + rules: `app/src/engine/*` (create files as needed)
- Data loading + validation: `app/src/data/loadData.ts`
- Tuning values: `data/config.csv` or new CSV files (document in DATA.md)
- PVP server logic: `server/rooms.ts` (room management), `server/index.ts` (message routing)
- PVP client networking: `app/src/engine/pvpClient.ts`
