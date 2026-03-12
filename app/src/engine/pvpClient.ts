/**
 * WebSocket client for PVP multiplayer.
 * Connects to the relay server, manages room lifecycle, and dispatches messages.
 */

export interface OpponentStateData {
  y: number;
  score: number;
  alive: boolean;
}

export class PvpClient {
  private ws: WebSocket | null = null;
  private url: string;

  // Callbacks — set by the Controller
  onRoomCreated: ((roomId: string) => void) | null = null;
  onRoomJoined: ((roomId: string) => void) | null = null;
  onOpponentJoined: (() => void) | null = null;
  onOpponentReady: (() => void) | null = null;
  onStart: ((seed: number, tiebreaker: number) => void) | null = null;
  onOpponentState: ((data: OpponentStateData) => void) | null = null;
  onOpponentDisconnected: (() => void) | null = null;
  onOpponentRematch: (() => void) | null = null;
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
          this.onOpponentDisconnected?.();
        };
        resolve();
      };
      this.ws.onerror = () =>
        reject(new Error("WebSocket connection failed"));
    });
  }

  createRoom(): void {
    this.send({ type: "create_room" });
  }

  joinRoom(roomId: string): void {
    this.send({ type: "join_room", room: roomId });
  }

  sendReady(): void {
    this.send({ type: "ready" });
  }

  sendState(score: number, alive: boolean, y: number): void {
    this.send({ type: "state", score, alive, y });
  }

  sendRematch(): void {
    this.send({ type: "rematch" });
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
        this.onRoomCreated?.(msg.room);
        break;
      case "room_joined":
        this.onRoomJoined?.(msg.room);
        break;
      case "opponent_joined":
        this.onOpponentJoined?.();
        break;
      case "opponent_ready":
        this.onOpponentReady?.();
        break;
      case "start":
        this.onStart?.(msg.seed, msg.tiebreaker);
        break;
      case "opponent_state":
        this.onOpponentState?.({
          y: msg.y,
          score: msg.score,
          alive: msg.alive,
        });
        break;
      case "opponent_disconnected":
        this.onOpponentDisconnected?.();
        break;
      case "opponent_rematch":
        this.onOpponentRematch?.();
        break;
      case "error":
        this.onError?.(msg.message);
        break;
    }
  }
}
