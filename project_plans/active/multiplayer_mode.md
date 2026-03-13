# Multiplayer Mode

Status: Active
Last updated: 2026-03-12

## Problem

PVP mode supports exactly 2 players. We want a mode where up to 10 players can race through the same obstacle course simultaneously. Each player should be a visually distinct cat, and dead players should remain visible as ghosts until the last player dies — creating a "last cat standing" experience.

This plan **supersedes pvp_mode.md** (archived). PVP is unified into this as multiplayer with 2 players — one codebase, one set of phases, one server flow. The "Race a Friend" button becomes "Multiplayer" and works for 2-10 players.

## Design

### Player experience

1. **Create a room.** From the main menu, the host taps "Multiplayer." The app creates a room and shows a room code (e.g. "ABC123") prominently on the lobby screen. The host sees their cat and a player count.
2. **Join.** Other players tap "Multiplayer" and enter the room code. Each player is assigned a unique cat color on join. The lobby updates in real time showing all connected cats with their colors. (Links with `?room=<code>` also work as a convenience.)
3. **Start.** The host taps "Start" when enough players have joined (minimum 2). No individual ready-up — the host controls when the race begins. This avoids the "waiting for that one person" problem with large groups.
4. **Countdown.** 3-2-1 countdown plays on all clients simultaneously.
5. **Race.** All players play through the same obstacle course (seeded RNG, same as PVP). Each player sees:
   - Their own cat in their assigned color (full opacity).
   - All other living players as semi-transparent ghost cats in their respective colors.
   - Score leaderboard in the corner showing all players ranked by current score.
6. **Death.** When a player dies:
   - Their cat shows X eyes and freezes at its last position.
   - The ghost stays on screen (does not fade out) until the race ends.
   - The dead player sees a "You placed #N" message but continues spectating.
   - The race continues for surviving players.
7. **Race over.** When the last player dies (or a timeout expires after the second-to-last death), all players see a results screen with final rankings: placement, score, and cat color for each player.
8. **Rematch or exit.** The host can start a new round (same room, new seed). Any player can leave at any time.

### Cat colors

10 distinct colors, assigned in join order:

| Slot | Name | Hex (body) | Hex (accent/outline) |
|------|------|------------|----------------------|
| 0 | Orange (default) | #F4A460 | #E8941A |
| 1 | Gray | #A8A8A8 | #787878 |
| 2 | Black | #4A4A4A | #2A2A2A |
| 3 | White | #F0F0F0 | #C8C8C8 |
| 4 | Calico | #E8C08A | #CC8844 |
| 5 | Siamese | #D4C5A9 | #8B7355 |
| 6 | Ginger | #E07830 | #C05010 |
| 7 | Russian Blue | #8898B0 | #607090 |
| 8 | Tuxedo | #3A3A3A | #1A1A1A |
| 9 | Tabby | #B8956A | #8B7040 |

The View draws each cat using these colors instead of the hardcoded orange. Dead cats keep their color but get X eyes and reduced opacity.

### Fairness

Same seeded RNG approach as PVP — server generates a seed, all clients produce identical obstacle patterns. Ghost cats are purely visual and have no collision.

## Implementation

### Server changes

The PVP server's `Room` structure uses a fixed 2-slot `players` array. Multiplayer needs dynamic arrays with up to 10 slots.

The PVP room structure is generalized to support 2-10 players. There is no separate PVP mode — a 2-player multiplayer room IS the PVP experience. This eliminates duplicate phases, server logic, and client code paths.

#### Room structure changes

```ts
interface Room {
  id: string;
  players: (WebSocket | null)[];   // dynamic, up to maxPlayers
  maxPlayers: number;               // 2-10
  host: number;                     // index of the host player (always 0)
  seed: number;
  tiebreaker: number;               // for 2-player score ties
  createdAt: number;
}
```

#### State fan-out

In PVP, the server relays one player's state to one opponent. In multiplayer, each player's state must be relayed to all other players. Two approaches:

**Per-message fan-out:** On receiving a `state` message, loop over all other players and send them each an `opponent_state` with the sender's player index.

**Batched fan-out:** Server collects all player states received within a small window (~50ms) and sends a single `all_states` message containing all players' positions to each client. Reduces message count from O(N^2) to O(N) per tick.

Recommendation: **Start with per-message fan-out** (simpler, matches current PVP code). Profile once we have 5+ player testing. Switch to batched if needed.

#### Bandwidth estimate

At 10 players, 20 updates/sec each:
- Inbound: 200 messages/sec to server
- Outbound per message: relayed to 9 others = 1,800 messages/sec from server
- Each message is ~100 bytes = ~180 KB/s total outbound

This is well within WebSocket server capacity. Render free tier should handle a handful of concurrent 10-player rooms.

### Message protocol changes

New/modified messages:

```
// Client -> Server
{ type: "create_room", maxPlayers: number, name: string }          // host creates (2-10)
{ type: "join_room", room: string, name: string }                  // player joins by room ID
{ type: "start_game" }                                             // host only, triggers countdown
{ type: "state", score: number, alive: boolean, y: number }       // sent at 20/sec during race

// Server -> Client
{ type: "room_created", room: string, playerIndex: number }
{ type: "player_joined", playerIndex: number, playerCount: number, name: string }
{ type: "player_left", playerIndex: number, playerCount: number }
{ type: "start", seed: number }                                    // triggers countdown on all clients
{ type: "opponent_state", playerIndex: number, score: number, alive: boolean, y: number }
{ type: "all_finished" }                                           // all players dead or timeout
{ type: "error", message: string }
```

Changes from the old PVP protocol:
- `create_room` takes `maxPlayers` instead of being hardcoded to 2
- `player_joined`/`player_left` replace `opponent_joined`/`opponent_disconnected` (include player count and index)
- `opponent_state` includes `playerIndex` so the client knows which ghost to update
- `start_game` replaces mutual ready-up (host controls when the race begins)
- `all_finished` is new (PVP used a client-side timeout; with N players the server tracks when everyone is dead)
- `ready` and `rematch` messages are removed — host starts and restarts

### Client changes

#### Types

```ts
interface MultiplayerState {
  playerIndex: number;                    // this client's index (0 = host)
  playerCount: number;
  opponents: OpponentState[];             // indexed by playerIndex (excluding self)
  catColors: CatColorPalette[];           // all 10 color sets
}

interface OpponentState {
  playerIndex: number;
  y: number;
  score: number;
  alive: boolean;
  lastUpdateTime: number;                 // for interpolation
}

interface CatColorPalette {
  body: string;
  accent: string;
}
```

#### GameModel

- Already accepts optional RNG from PVP work — no change needed.
- Add `playerIndex` and `opponents` array to GameState (or a parallel `MultiplayerState` that the Controller manages alongside the Model).
- Model stays single-player scoped — it only simulates the local cat. Opponent positions come from the network and are purely visual data.

#### GameView

- `drawCat` needs a color parameter instead of hardcoded `#F4A460` / `#E8941A`.
- New `drawGhostCats` method: loop over all opponents, draw each at their last-known y position in their assigned color. Living opponents are semi-transparent (~0.4 alpha). Dead opponents have X eyes and lower alpha (~0.25), frozen at death position.
- New `drawLeaderboard` method: small ranked list in the top-left during play, showing all players' scores with colored dots.
- `drawLobby`: show all connected cats with their colors, player count, and a "Start" prompt for the host.
- `drawMultiplayerResult`: ranked results screen showing placement, score, and cat color for each player.

#### GameController

- Manage opponent state updates from WebSocket.
- Interpolate ghost cat positions between state updates for smooth rendering.
- Host-specific logic: send `start_game` instead of `ready`.
- Throttle state sends to 20/sec (same as PVP).

### Game phases (unified)

The old PVP-specific phases (`PvpLobby`, `PvpCountdown`, `PvpPlaying`, `PvpResult`) are removed. The `Multi*` phases handle both 2-player and N-player games.

```ts
enum GamePhase {
  // Solo
  Menu = "menu",
  Playing = "playing",
  GameOver = "gameover",
  // Multiplayer (covers 2-10 players, replaces old PVP phases)
  MultiLobby = "multi_lobby",
  MultiCountdown = "multi_countdown",
  MultiPlaying = "multi_playing",
  MultiSpectating = "multi_spectating",   // player is dead, watching others
  MultiResult = "multi_result",
}
```

`MultiSpectating` lets dead players continue watching the race. In a 2-player game, this phase is brief (the race ends shortly after the first death via timeout). In larger games, it can last much longer.

### New/modified files

| File | Change |
|------|--------|
| `server/rooms.ts` | Generalize to dynamic player arrays, add `mode`, `maxPlayers`, `host`. Add host-starts-game logic. |
| `server/index.ts` | Handle `create_room` with mode/maxPlayers. Handle `start_game` (host only). Fan-out state to N-1 players. |
| `app/src/engine/types.ts` | Replace `Pvp*` phases with `Multi*` phases. Add `MultiplayerState`, `OpponentState`, `CatColorPalette`. |
| `app/src/engine/GameView.ts` | Parameterize cat colors. Add ghost cat rendering, leaderboard, lobby, and results screens. |
| `app/src/engine/GameController.ts` | Manage opponent array. Interpolate ghost positions. Host start logic. |
| `app/src/engine/pvpClient.ts` | Rename to `networkClient.ts`. Handle new message types (`player_joined`, `player_left`, `start_game`, `all_finished`). Remove `sendReady`/`sendRematch`/`onOpponentReady`/`onOpponentRematch`. |
| `app/src/App.tsx` | Add "Multiplayer" button to menu. |
| `data/config.csv` | Add `multi_max_players`, `multi_last_alive_timeout` |

### Data flow (multiplayer)

```
Host taps "Multiplayer"
       |
   App.tsx creates room (mode: multiplayer, maxPlayers: 10)
       |
   Server creates room, assigns host as player 0
       |
   Host shares link. Players join, each gets a playerIndex + color.
   Lobby updates on all clients as players arrive/leave.
       |
   Host taps "Start"
       |
   Server generates seed, sends "start" to all clients
       |
   All Controllers create Models with same seed
       |
   Game loop: each client sends { score, alive, y } at 20/sec
              server relays to all other clients with playerIndex
       |
   On death: client keeps rendering, switches to MultiSpectating
             ghost cat freezes with X eyes
       |
   Last player dies (or timeout after second-to-last death)
       |
   Server sends "all_finished"
       |
   MultiResult phase: ranked results, host can start new round
```

### Implementation phases

**Phase 1 — Server generalization.** Replace the fixed 2-player room structure with dynamic player arrays (up to `maxPlayers`). Remove PVP-specific `ready`/`rematch` logic. Add `start_game` (host only) and fan-out state relay. Remove old PVP phases from client. Test with 2 and 3+ browser tabs to confirm the unified flow works for both cases.

**Phase 2 — Cat colors.** Parameterize `drawCat` to accept a color palette. Define the 10-color palette. Verify all 10 cats look distinct on the same canvas.

**Phase 3 — Multiplayer lobby + start.** Build the lobby screen showing connected players with their colors. Host sees a "Start" button, others see "Waiting for host." Countdown and simultaneous start.

**Phase 4 — Multi-ghost rendering.** Render all opponent cats as ghosts during play. Dead cats freeze with X eyes and stay visible. Add the live leaderboard.

**Phase 5 — Spectating + results.** Implement `MultiSpectating` phase for dead players. Build the ranked results screen. Host can start a new round.

**Phase 6 — Polish.** Interpolation smoothing for ghost cats. Connection drop handling (remove ghost, update leaderboard). Performance testing with 10 players.

## Stub CSV data

New rows in `data/config.csv`:

```csv
multi_max_players,10
multi_last_alive_timeout,10
```

- `multi_max_players`: maximum players per room (cap at 10)
- `multi_last_alive_timeout`: seconds to wait after second-to-last player dies before ending the race (gives the last survivor some solo time, same concept as `pvp_result_timeout`)

## Resolved Questions

1. **Should PVP and Multiplayer share phases?** Yes — unified. PVP is just multiplayer with `maxPlayers=2`. One set of `Multi*` phases, one server flow, one client code path. The old `Pvp*` phases are removed. `pvp_mode.md` is archived.
2. **Room code vs link only?** Room code. The host creates a room and gets a short code (e.g. "ABC123") displayed prominently on the lobby screen. Players go to the app and type in the code to join. Links with `?room=<code>` still work as a convenience, but the primary flow is code entry — better for groups where you can just say the code out loud. Drop the Web Share API integration (was planned for PVP link sharing).
3. **Minimum players to start?** Minimum 2. Solo play already exists as the default game mode — no reason to allow a 1-player multiplayer room. The "Start" button in the lobby is disabled until at least one other player joins.

4. **Player names?** Yes. Players set a display name when entering multiplayer (before creating or joining a room). Name is persisted to localStorage so they don't have to re-enter it each time. No accounts — just a local nickname. Names are shown in the lobby, on the in-game leaderboard, and on the results screen next to each player's cat color. The `join_room` and `create_room` messages include a `name` field. Server relays names to all clients on join.

5. **Mid-race joining?** Yes — latecomers can join during an active race. The server sends the current seed so the latecomer generates the same obstacle course. The latecomer starts playing immediately from the current scroll position (obstacles spawn ahead of them as normal since the seeded RNG is deterministic given the same elapsed time). Their ghost appears for other players when they join. They won't have a score from the early part of the race, so they're at a natural disadvantage — that's fine, it's casual. If the race ends before they die, they see the results with everyone else.

## Open Questions

None — all resolved.
