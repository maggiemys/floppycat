import { createServer, IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { RoomManager } from "./rooms.js";
import { getScores, insertScore, checkRateLimit } from "./leaderboard.js";

const PORT = parseInt(process.env.PORT || "8080", 10);
const rooms = new RoomManager();

// ── HTTP server (leaderboard API + WebSocket upgrade) ────────

const httpServer = createServer(handleHttp);
const wss = new WebSocketServer({ server: httpServer });

function handleHttp(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (url.pathname === "/api/scores" && req.method === "GET") {
    const period = url.searchParams.get("period") ?? "alltime";
    if (!["daily", "weekly", "alltime"].includes(period)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid period" }));
      return;
    }
    const scores = getScores(period);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ scores }));
    return;
  }

  if (url.pathname === "/api/scores" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const name = String(data.name ?? "").trim().slice(0, 16);
        const score = parseInt(data.score, 10);

        if (!name || isNaN(score) || score < 0 || score > 999) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid name or score" }));
          return;
        }

        const ip =
          (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
          req.socket.remoteAddress ??
          "unknown";

        if (!checkRateLimit(ip)) {
          res.writeHead(429, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Too many requests" }));
          return;
        }

        const result = insertScore(name, score, ip);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

// ── WebSocket handling (multiplayer) ─────────────────────────

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

httpServer.listen(PORT, () => {
  console.log(`FloppyCat server listening on port ${PORT}`);
});
