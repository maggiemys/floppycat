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
        const room = rooms.createRoom(ws);
        send(ws, { type: "room_created", room: room.id });
        break;
      }

      case "join_room": {
        const room = rooms.joinRoom(msg.room, ws);
        if (!room) {
          send(ws, { type: "error", message: "Room not found or full" });
          break;
        }
        send(ws, { type: "room_joined", room: room.id });
        const host = room.players[0];
        if (host) send(host, { type: "opponent_joined" });
        break;
      }

      case "ready": {
        const result = rooms.setReady(ws);
        if (!result) break;
        const opponent = rooms.getOpponent(ws);
        if (opponent) send(opponent, { type: "opponent_ready" });
        if (result.bothReady) {
          const room = rooms.getPlayerRoom(ws);
          if (room) {
            for (const p of room.players) {
              if (p)
                send(p, {
                  type: "start",
                  seed: result.seed,
                  tiebreaker: result.tiebreaker,
                });
            }
          }
        }
        break;
      }

      case "state": {
        const opponent = rooms.getOpponent(ws);
        if (opponent) {
          send(opponent, {
            type: "opponent_state",
            score: msg.score,
            alive: msg.alive,
            y: msg.y,
          });
        }
        break;
      }

      case "rematch": {
        const result = rooms.setRematch(ws);
        if (!result) break;
        const opponent = rooms.getOpponent(ws);
        if (opponent) send(opponent, { type: "opponent_rematch" });
        if (result.bothRematch) {
          const room = rooms.getPlayerRoom(ws);
          if (room) {
            for (const p of room.players) {
              if (p)
                send(p, {
                  type: "start",
                  seed: result.seed,
                  tiebreaker: result.tiebreaker,
                });
            }
          }
        }
        break;
      }
    }
  });

  ws.on("close", () => {
    const opponent = rooms.getOpponent(ws);
    if (opponent) send(opponent, { type: "opponent_disconnected" });
    rooms.removePlayer(ws);
  });
});

console.log(`FloppyCat PVP server listening on port ${PORT}`);
