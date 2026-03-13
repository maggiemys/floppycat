# PVP Race Mode

Status: Archived — superseded by `multiplayer_mode.md`
Last updated: 2026-03-12

## Problem

FloppyCat is single-player only. There's no way to compete with a friend in real time. Adding a PVP race mode would make the game more social and replayable without requiring accounts.

## Design

### Player experience

1. **Create a race.** From the main menu, Player 1 taps a "Race a Friend" button. The app generates a session and shows a shareable link (with a copy button).
2. **Join a race.** Player 2 opens the link. Both players see a lobby screen confirming the connection.
3. **Ready up.** Each player taps/presses Up (Space or tap) to signal ready. The lobby shows who's ready.
4. **Countdown.** Once both are ready, a 3-2-1 countdown plays. The game starts simultaneously.
5. **Race.** Both players play through the same obstacle course (identical pipe layout). Each player sees their own cat plus their opponent's score (and optionally a ghost indicator of the opponent's vertical position).
6. **Race over.** When a player dies, they see their result immediately but the race continues for the surviving player until they also die (or a timeout, e.g. 10 seconds). Then both see a results screen: scores side by side, winner declared. The winning cat wears a crown.
7. **Rematch or exit.** Both can tap to rematch (same link, new game) or return to the solo menu.

### Fairness

Both players face the exact same obstacle pattern. This requires a **seeded random number generator** — the seed is agreed upon during session setup, and both clients use it instead of `Math.random()` for pipe gap placement.

### No accounts

No sign-in, no user profiles. Sessions are ephemeral — identified only by a room code in the URL. No data persists beyond the race (solo high score is unaffected).

## Implementation

### Networking: WebSocket relay server

A lightweight WebSocket server manages rooms and relays messages between players. Both clients connect to the server, which acts as the source of truth for room state, seed generation, and synchronized game start.

**Why WebSockets over WebRTC?**
- Works through all firewalls and NATs — no connection failures from strict network configs
- Server can be authoritative (generate the seed, enforce countdown timing)
- Easier to debug than peer-to-peer WebRTC
- Extensible to spectators, matchmaking, or more players later

**Server tech:** A minimal Node.js WebSocket server using the `ws` library. Deployed to **Render** (free tier) — push to GitHub and it auto-deploys. Free tier sleeps after 15 min of inactivity (~30s cold start on first connection, which is fine since the friend still needs to open the link).

**Project structure:**

```
server/
  index.ts        # WebSocket server entry point
  rooms.ts        # Room creation, join, lifecycle, cleanup
  package.json
```

**URL scheme:** `https://<host>/?room=<room-id>` — Room ID is a short random code (e.g. 6 alphanumeric chars). Player 1 creates a room and shares the link. Player 2 opens it to join.

### Message protocol

JSON messages over WebSocket:

```
// Client -> Server
{ type: "create_room" }                    // Player 1 requests a new room
{ type: "join_room", room: string }        // Player 2 joins by room ID
{ type: "ready" }                          // player tapped Up in lobby
{ type: "state", score: number, alive: boolean, y: number }  // sent every frame during race
{ type: "rematch" }                        // request a rematch

// Server -> Client
{ type: "room_created", room: string }     // confirms room, Player 1 gets the ID
{ type: "opponent_joined" }               // notifies Player 1 that Player 2 connected
{ type: "opponent_ready" }                // the other player is ready
{ type: "start", seed: number }           // server generates seed, triggers countdown on both
{ type: "opponent_state", score: number, alive: boolean, y: number }  // relayed from opponent
{ type: "opponent_disconnected" }         // opponent left
{ type: "error", message: string }        // room full, room not found, etc.
```

State messages are small (~80 bytes) and sent at frame rate. The server relays them without processing — it's a thin pass-through for game state, authoritative only for room management and game start.

### Seeded RNG

Add a simple deterministic PRNG (e.g. mulberry32) to `engine/`:

```ts
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

`GameModel` currently uses `Math.random()` in `spawnObstaclesIfNeeded()`. For PVP, the Model accepts an optional RNG function. If provided, it uses that instead of `Math.random()`. Solo mode is unaffected.

### New game phases

Extend `GamePhase` enum:

```ts
enum GamePhase {
  Menu = "menu",
  Playing = "playing",
  GameOver = "gameover",
  // PVP additions:
  PvpLobby = "pvp_lobby",       // waiting for opponent + ready up
  PvpCountdown = "pvp_countdown", // 3-2-1
  PvpPlaying = "pvp_playing",     // active race
  PvpResult = "pvp_result",       // race results
}
```

### New/modified files

| File | Change |
|------|--------|
| `server/index.ts` | **New.** WebSocket server entry point |
| `server/rooms.ts` | **New.** Room creation, join, lifecycle, cleanup |
| `server/package.json` | **New.** Server dependencies (`ws`) |
| `app/src/engine/types.ts` | Add PVP phases, `PvpState` interface, message types |
| `app/src/engine/GameModel.ts` | Accept optional seeded RNG; add PVP phase transitions |
| `app/src/engine/GameView.ts` | Render lobby, countdown, opponent ghost cat, race results |
| `app/src/engine/GameController.ts` | PVP input handling, frame-rate state broadcasting via WebSocket |
| `app/src/engine/pvpClient.ts` | **New.** WebSocket client — connect, send/receive messages, reconnection |
| `app/src/engine/rng.ts` | **New.** Seeded PRNG (mulberry32) |
| `app/src/components/GameCanvas.tsx` | Pass PVP connection info to Controller |
| `app/src/App.tsx` | Parse `?room=` URL param, show "Race a Friend" button on menu, route to PVP flow |
| `data/config.csv` | Add `pvp_result_timeout`, `pvp_countdown_seconds` |

### Data flow (PVP)

```
URL with ?room=<id>  (or Player 1 taps "Race a Friend")
       |
   App.tsx detects room param or creates a new room
       |
   WebSocket connects to relay server (pvpClient.ts)
       |
   Server creates/joins room, notifies both players
       |
   Lobby phase: both send "ready" messages
       |
   Server generates seed, sends "start" to both clients
       |
   Both Controllers create Models with same seed
       |
   Game loop: each frame, send { score, alive, y } to server
       |           server relays to opponent
       |
   On death: notify server, wait for result timeout
       |
   PvpResult phase: show both scores, winner, rematch option
```

### Implementation phases

**Phase 1 — Server + connection + lobby.** Build the WebSocket relay server with room management. Build the client-side WebSocket wrapper. Get two browsers connected to the same room. Show a lobby with connection status and ready-up. No gameplay yet.

**Phase 2 — Synchronized start.** Implement seeded RNG, countdown, and simultaneous game start. Both players play the same obstacle course independently.

**Phase 3 — Live race feedback.** Send score/alive/y state each frame. Show opponent's score during play. Render a ghost cat (semi-transparent opponent cat at their y-position). End-of-race results screen with winner.

**Phase 4 — Polish.** Rematch flow. Connection error handling and reconnection UX. Copy-link button styling.

## Stub CSV data

New rows in `data/config.csv`:

```csv
pvp_result_timeout,10
pvp_countdown_seconds,3
```

## Resolved Questions

1. **Ghost cat or score only?** Both. Show opponent's score AND a ghost cat (semi-transparent cat at their y-position). Ghost cat is included in Phase 3 since the y-position data is already being sent every frame.
2. **What happens on disconnect?** Auto-win for the remaining player. Does NOT count toward solo high score — PVP and solo are separate contexts. Show "Opponent left — you win!" with rematch/menu options.
3. **Mobile sharing.** Yes — use Web Share API (`navigator.share()`) when available, fall back to copy-to-clipboard on desktop.
4. **Server hosting.** Render free tier. Auto-deploys from GitHub. Cold start after inactivity is acceptable for this use case.
5. **Same-device PVP?** Out of scope for this plan. Fundamentally different feature (split canvas, dual input zones, no networking). Could be a separate future plan.
6. **Client server URL.** Environment variable (`VITE_WS_URL`). Defaults to `ws://localhost:8080` in dev. Set to the Render URL in production.
7. **Room cleanup.** Server deletes rooms 5 minutes after both players disconnect, or 10 minutes after creation if only one player ever joined (abandoned room).
8. **Score tiebreaker.** Same score = coin flip. Server picks a random winner and sends the result to both clients. No draws.
9. **Race timeout after first death.** 10 seconds (configurable via `pvp_result_timeout` in config.csv). Long enough to let the survivor rack up a lead, short enough to not bore the dead player.
10. **Ghost cat on opponent death.** Ghost cat shows X eyes and freezes at its last position. Fades out over 1 second. Ghost cat is rendered in green so it's instantly distinguishable from the player's cat.
11. **Rematch flow.** Both players must tap rematch. Server generates a new seed. Same room, no new link needed.
12. **State update throttling.** Send at 20 updates/sec (every 3rd frame at 60fps) instead of every frame. Interpolate ghost cat position on the receiving end for smooth rendering. Keeps server relay load reasonable.
13. **Lobby rendering.** Canvas-rendered, same as menu and game-over screens. Keeps everything in the engine — no React UI needed for PVP screens.
14. **Dev workflow.** Single `npm run dev` at the repo root runs both the Vite dev server and the WebSocket server concurrently (using `concurrently` or a simple shell script).
