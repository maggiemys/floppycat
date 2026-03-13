/**
 * WebSocket client for multiplayer.
 * Connects to the relay server, manages room lifecycle, and dispatches messages.
 */

export interface OpponentStateData {
  playerIndex: number;
  y: number;
  score: number;
  alive: boolean;
}

export interface RoomJoinedData {
  room: string;
  playerIndex: number;
  players: { index: number; name: string }[];
  started: boolean;
  seed: number;
  startedAt: number;
}

export interface PlayerJoinedData {
  playerIndex: number;
  playerCount: number;
  name: string;
}

export interface StartData {
  seed: number;
  tiebreaker: number;
  startedAt: number;
}

export class NetworkClient {
  private ws: WebSocket | null = null;
  private url: string;

  // Callbacks — set by the Controller
  onRoomCreated: ((roomId: string, playerIndex: number) => void) | null = null;
  onRoomJoined: ((data: RoomJoinedData) => void) | null = null;
  onPlayerJoined: ((data: PlayerJoinedData) => void) | null = null;
  onPlayerLeft: ((playerIndex: number, playerCount: number) => void) | null = null;
  onStart: ((data: StartData) => void) | null = null;
  onOpponentState: ((data: OpponentStateData) => void) | null = null;
  onAllFinished: (() => void) | null = null;
  onDisconnected: (() => void) | null = null;
  onError: ((message: string) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch {
        reject(new Error("Failed to create WebSocket"));
        return;
      }
      this.ws.onopen = () => {
        this.ws!.onmessage = (e) => {
          try {
            this.handleMessage(JSON.parse(e.data));
          } catch {
            /* ignore malformed messages */
          }
        };
        this.ws!.onclose = () => {
          this.onDisconnected?.();
        };
        resolve();
      };
      this.ws.onerror = () =>
        reject(new Error("WebSocket connection failed"));
    });
  }

  createRoom(maxPlayers: number, name: string): void {
    this.send({ type: "create_room", maxPlayers, name });
  }

  joinRoom(roomId: string, name: string): void {
    this.send({ type: "join_room", room: roomId, name });
  }

  sendStartGame(): void {
    this.send({ type: "start_game" });
  }

  sendState(score: number, alive: boolean, y: number): void {
    this.send({ type: "state", score, alive, y });
  }

  sendRestartGame(): void {
    this.send({ type: "restart_game" });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private send(data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private handleMessage(msg: any): void {
    switch (msg.type) {
      case "room_created":
        this.onRoomCreated?.(msg.room, msg.playerIndex);
        break;
      case "room_joined":
        this.onRoomJoined?.(msg);
        break;
      case "player_joined":
        this.onPlayerJoined?.(msg);
        break;
      case "player_left":
        this.onPlayerLeft?.(msg.playerIndex, msg.playerCount);
        break;
      case "start":
        this.onStart?.(msg);
        break;
      case "opponent_state":
        this.onOpponentState?.(msg);
        break;
      case "all_finished":
        this.onAllFinished?.();
        break;
      case "error":
        this.onError?.(msg.message);
        break;
    }
  }
}
