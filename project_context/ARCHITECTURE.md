# Architecture Map

## Key files

- `app/index.html`: Vite entry HTML.
- `app/src/main.tsx`: React entry point.
- `app/src/App.tsx`: Main app shell, UI layout, multiplayer setup flow (name entry, create/join room, room code input).
- `app/src/styles.css`: Tailwind base, theme variables, viewport management (app-shell/game-screen/app-screen).
- `app/src/data/loadData.ts`: CSV loading + validation.
- `data/config.csv`: Global tunables (includes multiplayer config).

## Game engine (MVC)

The game uses a strict Model-View-Controller architecture in `app/src/engine/`:

- `app/src/engine/types.ts`: Shared TypeScript interfaces (`GameState`, `GameConfig`, `CatState`, `Obstacle`, `MultiplayerState`, `OpponentState`, `CatColorPalette`, `CAT_COLORS`, `GamePhase` enum).
- `app/src/engine/GameModel.ts`: **Model** — owns all game data and rules (physics, collision, scoring, difficulty, multiplayer state). Zero knowledge of rendering or input.
- `app/src/engine/GameView.ts`: **View** — canvas renderer. Receives `Readonly<GameState>` and draws everything (including multiplayer lobby, countdown, ghost cats with per-player colors, leaderboard, spectating overlay, results with crown). Zero mutation of game state.
- `app/src/engine/GameController.ts`: **Controller** — game loop (rAF), input handling, DPR canvas setup, multiplayer WebSocket orchestration with ghost interpolation. The only piece that talks to both Model and View.
- `app/src/engine/networkClient.ts`: WebSocket client for multiplayer relay server — connect, send/receive messages, room lifecycle.
- `app/src/engine/rng.ts`: Seeded PRNG (mulberry32) for deterministic obstacle patterns in multiplayer.
- `app/src/components/GameCanvas.tsx`: React bridge — owns the `<canvas>` element, manages Controller lifecycle via useEffect.

## Multiplayer Server

- `server/index.ts`: WebSocket relay server entry point. Routes messages between players, handles room creation/joining, fan-out state to N-1 players, tracks deaths for all-finished detection.
- `server/rooms.ts`: Room creation, join (including mid-race), host-starts-game, cleanup lifecycle. Supports 2-10 players per room.

## Data flow

- CSVs in `data/` are loaded at runtime via `loadData.ts` (Vite `publicDir` points to `../data`). See DATA.md for CSV schemas.
- `App.tsx` loads `config.csv`, parses it into a typed `GameConfig`, and passes it to `GameCanvas`. It also manages the multiplayer setup flow (name entry, create/join room) and `?room=` URL params.
- The Controller creates the Model and View, runs the game loop, and handles input.
- High score is persisted to `localStorage`. Player name is persisted to `localStorage`.

### Multiplayer data flow

- Player taps "Multiplayer" on menu → React overlay for name entry → Create or Join room.
- **Create:** App connects to relay server via WebSocket → server creates room → room code displayed in canvas-rendered lobby. Host shares code verbally or via link.
- **Join:** Player enters room code (or opens `?room=<code>` link) → App connects to server → joins room → sees lobby with connected players.
- Host taps "Start" → server generates seed → sends `start` to all clients.
- All clients create Models with same seed (deterministic PRNG) → identical obstacle patterns.
- During race: each client sends `{ score, alive, y }` at ~20/sec → server relays to all other players with `playerIndex` → ghost cats rendered at opponents' interpolated Y positions in their assigned colors.
- When a player dies → switches to spectating phase, ghost freezes with X eyes.
- When all players are dead → server sends `all_finished` → results screen with ranked scores and crown on winner.

## Where to change things

- React UI: `app/src/App.tsx` + `app/src/components/*`
- Game state + rules: `app/src/engine/*`
- Data loading + validation: `app/src/data/loadData.ts`
- Tuning values: `data/config.csv` or new CSV files (document in DATA.md)
- Multiplayer server logic: `server/rooms.ts` (room management), `server/index.ts` (message routing)
- Multiplayer client networking: `app/src/engine/networkClient.ts`
