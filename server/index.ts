import { WebSocketServer, WebSocket } from "ws";
import { RoomManager } from "./rooms.js";

const PORT = parseInt(process.env.PORT || "8080", 10);
const rooms = new RoomManager();
const wss = new WebSocketServer({ port: PORT });

function send(ws: WebSocket, data: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case "create_room": {
        const maxPlayers = Math.min(Math.max(msg.maxPlayers ?? 10, 2), 10);
        const name = String(msg.name ?? "Player");
        const room = rooms.createRoom(ws, maxPlayers, name);
        send(ws, { type: "room_created", room: room.id, playerIndex: 0 });
        break;
      }

      case "join_room": {
        const name = String(msg.name ?? "Player");
        const result = rooms.joinRoom(msg.room, ws, name);
        if (!result) {
          send(ws, { type: "error", message: "Room not found or full" });
          break;
        }
        const { room, playerIndex } = result;

        // Tell the joiner about all existing players
        const existingPlayers: { index: number; name: string }[] = [];
        for (let i = 0; i < room.players.length; i++) {
          if (room.players[i] && i !== playerIndex) {
            existingPlayers.push({ index: i, name: room.names[i] });
          }
        }
        send(ws, {
          type: "room_joined",
          room: room.id,
          playerIndex,
          players: existingPlayers,
          started: room.started,
          seed: room.seed,
          startedAt: room.startedAt,
        });

        // Tell all other players about the new joiner
        const others = rooms.getOtherPlayers(ws);
        const playerCount = rooms.getConnectedCount(room);
        for (const other of others) {
          send(other.ws, {
            type: "player_joined",
            playerIndex,
            playerCount,
            name,
          });
        }
        break;
      }

      case "start_game": {
        const result = rooms.startGame(ws);
        if (!result) {
          send(ws, { type: "error", message: "Cannot start game" });
          break;
        }
        const room = rooms.getPlayerRoom(ws);
        if (!room) break;

        // Send start to all connected players
        for (let i = 0; i < room.players.length; i++) {
          const p = room.players[i];
          if (p) {
            send(p, {
              type: "start",
              seed: result.seed,
              tiebreaker: result.tiebreaker,
              startedAt: result.startedAt,
            });
          }
        }
        break;
      }

      case "state": {
        const playerIndex = rooms.getPlayerIndex(ws);
        const others = rooms.getOtherPlayers(ws);
        for (const other of others) {
          send(other.ws, {
            type: "opponent_state",
            playerIndex,
            score: msg.score,
            alive: msg.alive,
            y: msg.y,
          });
        }

        // Track deaths for all_finished detection
        if (msg.alive === false) {
          const { allFinished } = rooms.playerDied(ws);
          if (allFinished) {
            const room = rooms.getPlayerRoom(ws);
            if (room) {
              for (let i = 0; i < room.players.length; i++) {
                const p = room.players[i];
                if (p) send(p, { type: "all_finished" });
              }
            }
          }
        }
        break;
      }

      case "restart_game": {
        const result = rooms.restartGame(ws);
        if (!result) break;
        const room = rooms.getPlayerRoom(ws);
        if (!room) break;

        for (let i = 0; i < room.players.length; i++) {
          const p = room.players[i];
          if (p) {
            send(p, {
              type: "start",
              seed: result.seed,
              tiebreaker: result.tiebreaker,
              startedAt: result.startedAt,
            });
          }
        }
        break;
      }
    }
  });

  ws.on("close", () => {
    const result = rooms.removePlayer(ws);
    if (!result) return;
    const { room, playerIndex } = result;
    const playerCount = rooms.getConnectedCount(room);
    for (let i = 0; i < room.players.length; i++) {
      const p = room.players[i];
      if (p) send(p, { type: "player_left", playerIndex, playerCount });
    }
  });
});

console.log(`FloppyCat multiplayer server listening on port ${PORT}`);
