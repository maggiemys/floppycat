import { WebSocket } from "ws";

export interface Room {
  id: string;
  players: (WebSocket | null)[];
  ready: boolean[];
  seed: number;
  tiebreaker: number;
  createdAt: number;
  rematchRequests: boolean[];
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

  createRoom(ws: WebSocket): Room {
    const id = this.generateId();
    const room: Room = {
      id,
      players: [ws, null],
      ready: [false, false],
      seed: 0,
      tiebreaker: 0,
      createdAt: Date.now(),
      rematchRequests: [false, false],
    };
    this.rooms.set(id, room);
    this.playerRooms.set(ws, id);
    return room;
  }

  joinRoom(id: string, ws: WebSocket): Room | null {
    const room = this.rooms.get(id);
    if (!room || room.players[1] !== null) return null;
    room.players[1] = ws;
    this.playerRooms.set(ws, id);
    return room;
  }

  getPlayerRoom(ws: WebSocket): Room | null {
    const id = this.playerRooms.get(ws);
    return id ? (this.rooms.get(id) ?? null) : null;
  }

  getPlayerIndex(ws: WebSocket): number {
    const room = this.getPlayerRoom(ws);
    return room ? room.players.indexOf(ws) : -1;
  }

  getOpponent(ws: WebSocket): WebSocket | null {
    const room = this.getPlayerRoom(ws);
    if (!room) return null;
    const idx = room.players.indexOf(ws);
    return room.players[idx === 0 ? 1 : 0];
  }

  setReady(
    ws: WebSocket
  ): { bothReady: boolean; seed: number; tiebreaker: number } | null {
    const room = this.getPlayerRoom(ws);
    if (!room) return null;
    room.ready[this.getPlayerIndex(ws)] = true;

    if (room.ready[0] && room.ready[1]) {
      room.seed = Math.floor(Math.random() * 2147483647);
      room.tiebreaker = Math.random() < 0.5 ? 0 : 1;
      return {
        bothReady: true,
        seed: room.seed,
        tiebreaker: room.tiebreaker,
      };
    }
    return { bothReady: false, seed: 0, tiebreaker: 0 };
  }

  setRematch(
    ws: WebSocket
  ): { bothRematch: boolean; seed: number; tiebreaker: number } | null {
    const room = this.getPlayerRoom(ws);
    if (!room) return null;
    room.rematchRequests[this.getPlayerIndex(ws)] = true;

    if (room.rematchRequests[0] && room.rematchRequests[1]) {
      room.ready = [false, false];
      room.rematchRequests = [false, false];
      room.seed = Math.floor(Math.random() * 2147483647);
      room.tiebreaker = Math.random() < 0.5 ? 0 : 1;
      return {
        bothRematch: true,
        seed: room.seed,
        tiebreaker: room.tiebreaker,
      };
    }
    return { bothRematch: false, seed: 0, tiebreaker: 0 };
  }

  removePlayer(ws: WebSocket): void {
    const room = this.getPlayerRoom(ws);
    if (!room) return;
    const idx = room.players.indexOf(ws);
    if (idx !== -1) {
      room.players[idx] = null;
      room.ready[idx] = false;
      room.rematchRequests[idx] = false;
    }
    this.playerRooms.delete(ws);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, room] of this.rooms) {
      const bothGone = !room.players[0] && !room.players[1];
      const abandoned =
        room.players[1] === null && now - room.createdAt > ABANDONED_TTL_MS;
      if (bothGone || abandoned) {
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
