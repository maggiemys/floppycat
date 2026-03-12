/**
 * GameController — the Controller in FloppyCat's MVC architecture.
 *
 * Handles all orchestration:
 *   - Player input (pointer and keyboard)
 *   - Game loop via requestAnimationFrame
 *   - Starts and restarts the game
 *   - Updates the Model each frame
 *   - Tells the View when to render
 *   - DPR-aware canvas setup and resize
 *   - PVP: WebSocket connection, state broadcasting, ghost interpolation
 *
 * The Controller is the ONLY piece that talks to both Model and View.
 * It is the glue layer — it owns no game data and draws nothing.
 */

import { GameModel } from "./GameModel";
import { GameView } from "./GameView";
import {
  RACE_BUTTON_Y_FRAC,
  RACE_BUTTON_W,
  RACE_BUTTON_H,
  COPY_BUTTON_Y_FRAC,
  COPY_BUTTON_W,
  COPY_BUTTON_H,
} from "./GameView";
import { GameConfig, GamePhase } from "./types";
import { PvpClient } from "./pvpClient";

const MAX_DT = 0.05; // cap at 50ms to prevent physics explosion
const RESTART_DELAY_MS = 500; // debounce after death before allowing restart
const PVP_STATE_INTERVAL = 3; // send state every 3rd frame (~20/sec at 60fps)

export class GameController {
  private model: GameModel;
  private view: GameView;
  private canvas: HTMLCanvasElement;
  private config: GameConfig;
  private animFrameId: number | null = null;
  private lastTimestamp = 0;
  private gameOverTime = 0;

  // PVP
  private wsUrl: string;
  private pvpRoomId: string | null;
  private pvpClient: PvpClient | null = null;
  private pvpFrameCounter = 0;
  private ghostPrevY = 0;
  private ghostTargetY = 0;
  private ghostInterpT = 1;

  // Bound event handlers (stored for cleanup)
  private onPointerDown: (e: PointerEvent) => void;
  private onKeyDown: (e: KeyboardEvent) => void;

  constructor(
    canvas: HTMLCanvasElement,
    config: GameConfig,
    wsUrl: string,
    pvpRoomId: string | null = null
  ) {
    this.canvas = canvas;
    this.config = config;
    this.wsUrl = wsUrl;
    this.pvpRoomId = pvpRoomId;

    // Initial canvas sizing
    const { width, height } = this.sizeCanvas();

    // Create Model and View
    this.model = new GameModel(config, width, height);
    const ctx = canvas.getContext("2d")!;
    this.view = new GameView(ctx, config);

    // Bind input handlers
    this.onPointerDown = this.handlePointer.bind(this);
    this.onKeyDown = this.handleKey.bind(this);
  }

  // ── Lifecycle ────────────────────────────────────────────

  /** Bind input listeners and start the game loop. */
  start(): void {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("keydown", this.onKeyDown);

    this.lastTimestamp = 0;
    this.animFrameId = requestAnimationFrame(this.loop);

    // If a PVP room ID was provided (from URL), join it
    if (this.pvpRoomId) {
      this.joinPvpRoom(this.pvpRoomId);
    }
  }

  /** Stop the game loop and unbind all listeners. */
  destroy(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("keydown", this.onKeyDown);
    this.pvpClient?.disconnect();
    this.pvpClient = null;
  }

  /** Handle canvas resize from the outside (e.g. ResizeObserver). */
  resize(width: number, height: number): void {
    this.sizeCanvas();
    this.model.resize(width, height);
  }

  // ── Game Loop ────────────────────────────────────────────

  private loop = (timestamp: number): void => {
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = timestamp;
      this.animFrameId = requestAnimationFrame(this.loop);
      return;
    }

    let dt = (timestamp - this.lastTimestamp) / 1000;
    dt = Math.min(dt, MAX_DT);
    this.lastTimestamp = timestamp;

    const state = this.model.getState();

    // Update model
    if (
      state.phase === GamePhase.Playing ||
      state.phase === GamePhase.PvpCountdown ||
      state.phase === GamePhase.PvpPlaying
    ) {
      this.model.update(dt);
    }

    // Record game over time for debounce
    if (
      (state.phase === GamePhase.GameOver ||
        state.phase === GamePhase.PvpResult) &&
      this.gameOverTime === 0
    ) {
      this.gameOverTime = timestamp;
    }

    // PVP: ghost cat interpolation
    if (state.phase === GamePhase.PvpPlaying && state.pvp) {
      this.ghostInterpT = Math.min(1, this.ghostInterpT + dt * 20);
      const displayY =
        this.ghostPrevY +
        (this.ghostTargetY - this.ghostPrevY) * this.ghostInterpT;
      this.model.setOpponentDisplayY(displayY);
    }

    // PVP: send state at throttled rate
    if (state.phase === GamePhase.PvpPlaying && this.pvpClient) {
      this.pvpFrameCounter++;
      if (this.pvpFrameCounter >= PVP_STATE_INTERVAL) {
        this.pvpFrameCounter = 0;
        const pvp = state.pvp;
        this.pvpClient.sendState(
          state.score,
          pvp?.selfAlive ?? false,
          state.cat.y
        );
      }
    }

    // Render the current frame
    this.view.render(this.model.getState());

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  // ── Input Handling ───────────────────────────────────────

  private handlePointer(e: PointerEvent): void {
    e.preventDefault();
    const state = this.model.getState();
    const pos = this.getCanvasCoords(e);

    switch (state.phase) {
      case GamePhase.Menu:
        if (this.isRaceButtonHit(pos, state)) {
          this.startPvpFlow();
        } else {
          this.model.startGame();
        }
        break;

      case GamePhase.Playing:
        this.model.jump();
        break;

      case GamePhase.GameOver:
        if (this.isDebouncing()) return;
        this.gameOverTime = 0;
        this.model.returnToMenu();
        break;

      case GamePhase.PvpLobby: {
        const pvp = state.pvp;
        if (!pvp) break;

        // Error state — tap to return to menu
        if (pvp.error) {
          this.pvpClient?.disconnect();
          this.pvpClient = null;
          this.model.returnToMenu();
          break;
        }

        // Copy link button
        if (pvp.roomId && this.isCopyButtonHit(pos, state)) {
          this.copyOrShareLink(pvp.roomId);
          break;
        }

        // Ready up (only after opponent connects)
        if (pvp.opponentConnected && !pvp.selfReady) {
          this.model.setSelfReady();
          this.pvpClient?.sendReady();
        }
        break;
      }

      case GamePhase.PvpCountdown:
        // Ignore input during countdown
        break;

      case GamePhase.PvpPlaying:
        if (state.pvp?.selfAlive) {
          this.model.jump();
        }
        break;

      case GamePhase.PvpResult: {
        if (this.isDebouncing()) return;

        // If opponent disconnected, tap exits to menu
        if (state.pvp?.error) {
          this.pvpClient?.disconnect();
          this.pvpClient = null;
          this.gameOverTime = 0;
          this.model.returnToMenu();
          break;
        }

        // Request rematch
        if (state.pvp && !state.pvp.selfRematch) {
          this.model.setSelfRematch();
          this.pvpClient?.sendRematch();
        }
        break;
      }
    }
  }

  private handleKey(e: KeyboardEvent): void {
    if (e.code === "Space" || e.key === " ") {
      // Create a synthetic pointer event at center of canvas for hit testing
      const rect = this.canvas.getBoundingClientRect();
      const synth = new PointerEvent("pointerdown", {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      });
      this.handlePointer(synth);
    } else if (
      (e.key === "r" || e.key === "R") &&
      this.model.getState().phase === GamePhase.Menu
    ) {
      this.startPvpFlow();
    }
  }

  // ── PVP Flow ─────────────────────────────────────────────

  private async startPvpFlow(): Promise<void> {
    // Show connecting state immediately
    this.model.initPvp("", 0, false);

    this.pvpClient = new PvpClient(this.wsUrl);
    this.setupPvpCallbacks();

    try {
      await this.pvpClient.connect();
      this.pvpClient.createRoom();
    } catch {
      this.model.setPvpError("Failed to connect to server");
    }
  }

  private async joinPvpRoom(roomId: string): Promise<void> {
    this.model.initPvp("", 1, false);

    this.pvpClient = new PvpClient(this.wsUrl);
    this.setupPvpCallbacks();

    try {
      await this.pvpClient.connect();
      this.pvpClient.joinRoom(roomId);
    } catch {
      this.model.setPvpError("Failed to connect to server");
    }
  }

  private setupPvpCallbacks(): void {
    const client = this.pvpClient!;

    client.onRoomCreated = (roomId) => {
      this.model.setPvpRoomId(roomId);
    };

    client.onRoomJoined = (roomId) => {
      this.model.setPvpRoomId(roomId);
      this.model.setOpponentConnected();
    };

    client.onOpponentJoined = () => {
      this.model.setOpponentConnected();
    };

    client.onOpponentReady = () => {
      this.model.setOpponentReady();
    };

    client.onStart = (seed, tiebreaker) => {
      this.gameOverTime = 0;
      this.model.startCountdown(seed, tiebreaker);
    };

    client.onOpponentState = (data) => {
      // Update model with raw data
      this.model.updateOpponent(data.y, data.score, data.alive);

      // Update ghost interpolation targets
      this.ghostPrevY = this.ghostTargetY;
      this.ghostTargetY = data.y;
      this.ghostInterpT = 0;
    };

    client.onOpponentDisconnected = () => {
      this.model.opponentDisconnected();
    };

    client.onOpponentRematch = () => {
      this.model.setOpponentRematch();
    };

    client.onError = (message) => {
      this.model.setPvpError(message);
    };
  }

  // ── Hit Testing ──────────────────────────────────────────

  private getCanvasCoords(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private isRaceButtonHit(
    pos: { x: number; y: number },
    state: Readonly<ReturnType<GameModel["getState"]>>
  ): boolean {
    const cx = state.canvasWidth / 2;
    const cy = state.canvasHeight * RACE_BUTTON_Y_FRAC;
    return (
      pos.x >= cx - RACE_BUTTON_W / 2 &&
      pos.x <= cx + RACE_BUTTON_W / 2 &&
      pos.y >= cy - RACE_BUTTON_H / 2 &&
      pos.y <= cy + RACE_BUTTON_H / 2
    );
  }

  private isCopyButtonHit(
    pos: { x: number; y: number },
    state: Readonly<ReturnType<GameModel["getState"]>>
  ): boolean {
    const cx = state.canvasWidth / 2;
    const cy = state.canvasHeight * COPY_BUTTON_Y_FRAC;
    return (
      pos.x >= cx - COPY_BUTTON_W / 2 &&
      pos.x <= cx + COPY_BUTTON_W / 2 &&
      pos.y >= cy - COPY_BUTTON_H / 2 &&
      pos.y <= cy + COPY_BUTTON_H / 2
    );
  }

  private isDebouncing(): boolean {
    return (
      this.gameOverTime > 0 &&
      performance.now() - this.gameOverTime < RESTART_DELAY_MS
    );
  }

  // ── Clipboard / Share ────────────────────────────────────

  private async copyOrShareLink(roomId: string): Promise<void> {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;

    // Try native share first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({ title: "FloppyCat PVP", url });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    // Fall back to clipboard
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API not available — no-op
    }
  }

  // ── Canvas Sizing ────────────────────────────────────────

  private sizeCanvas(): { width: number; height: number } {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    const ctx = this.canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    if (this.view) {
      this.view.setContext(ctx);
    }

    return { width: rect.width, height: rect.height };
  }
}
