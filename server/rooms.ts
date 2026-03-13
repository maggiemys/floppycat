import { WebSocket } from "ws";

export interface Room {
  id: string;
  players: (WebSocket | null)[];
  names: string[];
  maxPlayers: number;
  host: number; // index of host player (always 0)
  seed: number;
  tiebreaker: number;
  started: boolean; // true once host starts the game
  startedAt: number; // timestamp when race started (for late join elapsed calc)
  aliveCount: number; // how many players are still alive
  createdAt: number;
}

const ROOM_ID_LENGTH = 6;
const CLEANUP_INTERVAL_MS = 60_000;
const ABANDONED_TTL_MS = 10 * 60_000;

// Characters that avoid visual ambiguity (no I/O/0/1)
const ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class RoomManager {
  private rooms = new Map<string, Room>();
  private playerRooms = new Map<WebSocket, string>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  createRoom(ws: WebSocket, maxPlayers: number, name: string): Room {
    const id = this.generateId();
    const room: Room = {
      id,
      players: [ws],
      names: [name],
      maxPlayers: Math.min(Math.max(maxPlayers, 2), 10),
      host: 0,
      seed: 0,
      tiebreaker: 0,
      started: false,
      startedAt: 0,
      aliveCount: 0,
      createdAt: Date.now(),
    };
    this.rooms.set(id, room);
    this.playerRooms.set(ws, id);
    return room;
  }

  joinRoom(id: string, ws: WebSocket, name: string): { room: Room; playerIndex: number } | null {
    const room = this.rooms.get(id);
    if (!room) return null;
    if (room.players.filter((p) => p !== null).length >= room.maxPlayers) return null;

    // Find first empty slot or append
    let playerIndex = room.players.indexOf(null);
    if (playerIndex === -1) {
      playerIndex = room.players.length;
      room.players.push(ws);
      room.names.push(name);
    } else {
      room.players[playerIndex] = ws;
      room.names[playerIndex] = name;
    }

    this.playerRooms.set(ws, id);
    return { room, playerIndex };
  }

  getPlayerRoom(ws: WebSocket): Room | null {
    const id = this.playerRooms.get(ws);
    return id ? (this.rooms.get(id) ?? null) : null;
  }

  getPlayerIndex(ws: WebSocket): number {
    const room = this.getPlayerRoom(ws);
    return room ? room.players.indexOf(ws) : -1;
  }

  getOtherPlayers(ws: WebSocket): { ws: WebSocket; index: number }[] {
    const room = this.getPlayerRoom(ws);
    if (!room) return [];
    const result: { ws: WebSocket; index: number }[] = [];
    for (let i = 0; i < room.players.length; i++) {
      const p = room.players[i];
      if (p && p !== ws) {
        result.push({ ws: p, index: i });
      }
    }
    return result;
  }

  getConnectedCount(room: Room): number {
    return room.players.filter((p) => p !== null).length;
  }

  startGame(ws: WebSocket): { seed: number; tiebreaker: number; startedAt: number } | null {
    const room = this.getPlayerRoom(ws);
    if (!room) return null;
    if (room.players.indexOf(ws) !== room.host) return null; // only host can start
    if (this.getConnectedCount(room) < 2) return null;

    room.seed = Math.floor(Math.random() * 2147483647);
    room.tiebreaker = Math.floor(Math.random() * room.players.length);
    room.started = true;
    room.startedAt = Date.now();
    room.aliveCount = this.getConnectedCount(room);
    return { seed: room.seed, tiebreaker: room.tiebreaker, startedAt: room.startedAt };
  }

  playerDied(ws: WebSocket): { allFinished: boolean } {
    const room = this.getPlayerRoom(ws);
    if (!room) return { allFinished: false };
    room.aliveCount = Math.max(0, room.aliveCount - 1);
    return { allFinished: room.aliveCount <= 0 };
  }

  removePlayer(ws: WebSocket): { room: Room; playerIndex: number } | null {
    const room = this.getPlayerRoom(ws);
    if (!room) return null;
    const idx = room.players.indexOf(ws);
    if (idx === -1) return null;

    room.players[idx] = null;
    this.playerRooms.delete(ws);

    return { room, playerIndex: idx };
  }

  /** Reset room state for a new round (host restarts). */
  restartGame(ws: WebSocket): { seed: number; tiebreaker: number; startedAt: number } | null {
    const room = this.getPlayerRoom(ws);
    if (!room) return null;
    if (room.players.indexOf(ws) !== room.host) return null;

    room.seed = Math.floor(Math.random() * 2147483647);
    room.tiebreaker = Math.floor(Math.random() * room.players.length);
    room.startedAt = Date.now();
    room.aliveCount = this.getConnectedCount(room);
    return { seed: room.seed, tiebreaker: room.tiebreaker, startedAt: room.startedAt };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, room] of this.rooms) {
      const allGone = room.players.every((p) => p === null);
      const abandoned =
        this.getConnectedCount(room) <= 1 &&
        !room.started &&
        now - room.createdAt > ABANDONED_TTL_MS;
      if (allGone || abandoned) {
        this.rooms.delete(id);
      }
    }
  }

  private generateId(): string {
    let id: string;
    do {
      id = "";
      for (let i = 0; i < ROOM_ID_LENGTH; i++) {
        id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
      }
    } while (this.rooms.has(id));
    return id;
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
  }
}
