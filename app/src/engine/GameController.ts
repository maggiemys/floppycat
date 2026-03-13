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
 *   - Multiplayer: WebSocket connection, state broadcasting, ghost interpolation
 *
 * The Controller is the ONLY piece that talks to both Model and View.
 * It is the glue layer — it owns no game data and draws nothing.
 */

import { GameModel } from "./GameModel";
import { GameView } from "./GameView";
import {
  MULTI_BUTTON_Y_FRAC,
  MULTI_BUTTON_W,
  MULTI_BUTTON_H,
  COPY_LINK_BUTTON_Y_FRAC,
  COPY_LINK_BUTTON_W,
  COPY_LINK_BUTTON_H,
} from "./GameView";
import { GameConfig, GamePhase } from "./types";
import { NetworkClient } from "./networkClient";

const MAX_DT = 0.05; // cap at 50ms to prevent physics explosion
const RESTART_DELAY_MS = 500; // debounce after death before allowing restart
const STATE_SEND_INTERVAL = 3; // send state every 3rd frame (~20/sec at 60fps)

// Layout constants for lobby "Start" button hit testing
const START_BUTTON_Y_FRAC = 0.85;
const START_BUTTON_W = 140;
const START_BUTTON_H = 38;

// Layout constants for results "Play Again" button
const PLAY_AGAIN_BUTTON_Y_FRAC = 0.88;
const PLAY_AGAIN_BUTTON_W = 160;
const PLAY_AGAIN_BUTTON_H = 38;

export interface MultiplayerSetup {
  client: NetworkClient;
  playerIndex: number;
  playerName: string;
  roomId: string;
  isHost: boolean;
  // For late joiners: existing players and game state
  existingPlayers?: { index: number; name: string }[];
  alreadyStarted?: boolean;
  seed?: number;
  startedAt?: number;
}

export class GameController {
  private model: GameModel;
  private view: GameView;
  private canvas: HTMLCanvasElement;
  private config: GameConfig;
  private animFrameId: number | null = null;
  private lastTimestamp = 0;
  private gameOverTime = 0;

  // Multiplayer
  private netClient: NetworkClient | null = null;
  private stateSendCounter = 0;
  private lastDeathSent = false; // track if we've sent our death state
  // Ghost interpolation per opponent: playerIndex -> { prevY, targetY, t }
  private ghostInterp = new Map<number, { prevY: number; targetY: number; t: number }>();

  // Callbacks to React layer
  onRequestMultiSetup: (() => void) | null = null;

  // Bound event handlers (stored for cleanup)
  private onPointerDown: (e: PointerEvent) => void;
  private onKeyDown: (e: KeyboardEvent) => void;

  constructor(canvas: HTMLCanvasElement, config: GameConfig) {
    this.canvas = canvas;
    this.config = config;

    const { width, height } = this.sizeCanvas();

    this.model = new GameModel(config, width, height);
    const ctx = canvas.getContext("2d")!;
    this.view = new GameView(ctx, config);

    this.onPointerDown = this.handlePointer.bind(this);
    this.onKeyDown = this.handleKey.bind(this);
  }

  // ── Lifecycle ────────────────────────────────────────────

  start(): void {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("keydown", this.onKeyDown);

    this.lastTimestamp = 0;
    this.animFrameId = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("keydown", this.onKeyDown);
    this.netClient?.disconnect();
    this.netClient = null;
  }

  resize(width: number, height: number): void {
    this.sizeCanvas();
    this.model.resize(width, height);
  }

  /** Called by App when multiplayer setup is complete. */
  startMultiplayer(setup: MultiplayerSetup): void {
    this.netClient = setup.client;
    this.lastDeathSent = false;
    this.ghostInterp.clear();
    this.setupNetCallbacks();

    this.model.initMulti(
      setup.roomId,
      setup.playerIndex,
      setup.playerName,
      setup.isHost
    );

    // Add existing players (for joiners)
    if (setup.existingPlayers) {
      for (const p of setup.existingPlayers) {
        this.model.addPlayer(p.index, p.name);
      }
    }

    // If the game already started (late join), go straight to countdown/play
    if (setup.alreadyStarted && setup.seed != null) {
      this.model.startCountdown(setup.seed);
    }
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

    // Update model for active phases
    if (
      state.phase === GamePhase.Playing ||
      state.phase === GamePhase.MultiCountdown ||
      state.phase === GamePhase.MultiPlaying ||
      state.phase === GamePhase.MultiSpectating
    ) {
      this.model.update(dt);
    }

    // Record game over time for debounce
    if (
      (state.phase === GamePhase.GameOver ||
        state.phase === GamePhase.MultiResult) &&
      this.gameOverTime === 0
    ) {
      this.gameOverTime = timestamp;
    }

    // Ghost cat interpolation
    if (
      (state.phase === GamePhase.MultiPlaying ||
        state.phase === GamePhase.MultiSpectating) &&
      state.multi
    ) {
      for (const opp of state.multi.opponents) {
        const interp = this.ghostInterp.get(opp.playerIndex);
        if (interp) {
          interp.t = Math.min(1, interp.t + dt * 20);
          const displayY =
            interp.prevY + (interp.targetY - interp.prevY) * interp.t;
          this.model.setOpponentDisplayY(opp.playerIndex, displayY);
        }
      }
    }

    // Send state at throttled rate during multiplayer play
    if (state.phase === GamePhase.MultiPlaying && this.netClient && state.multi) {
      this.stateSendCounter++;
      if (this.stateSendCounter >= STATE_SEND_INTERVAL) {
        this.stateSendCounter = 0;
        this.netClient.sendState(
          state.score,
          state.multi.selfAlive,
          state.cat.y
        );
      }
    }

    // Send death state once when transitioning to spectating
    if (state.phase === GamePhase.MultiSpectating && this.netClient && !this.lastDeathSent) {
      this.lastDeathSent = true;
      this.netClient.sendState(state.score, false, state.cat.y);
    }

    // Render
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
        if (this.isMultiButtonHit(pos, state)) {
          this.onRequestMultiSetup?.();
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

      case GamePhase.MultiLobby: {
        const multi = state.multi;
        if (!multi) break;

        if (multi.error) {
          this.disconnectAndReturnToMenu();
          break;
        }

        // Copy link button
        if (multi.roomId && this.isCopyLinkButtonHit(pos, state)) {
          this.copyOrShareLink(multi.roomId);
          break;
        }

        // Host can start when 2+ players
        if (multi.isHost && this.isStartButtonHit(pos, state)) {
          const connectedCount = multi.players.filter((p) => p.connected).length;
          if (connectedCount >= 2) {
            this.netClient?.sendStartGame();
          }
        }
        break;
      }

      case GamePhase.MultiCountdown:
        // Ignore input during countdown
        break;

      case GamePhase.MultiPlaying:
        if (state.multi?.selfAlive) {
          this.model.jump();
        }
        break;

      case GamePhase.MultiSpectating:
        // No input during spectating
        break;

      case GamePhase.MultiResult: {
        if (this.isDebouncing()) return;

        if (state.multi?.error) {
          this.disconnectAndReturnToMenu();
          break;
        }

        // Host can restart
        if (state.multi?.isHost && this.isPlayAgainButtonHit(pos, state)) {
          this.lastDeathSent = false;
          this.ghostInterp.clear();
          this.netClient?.sendRestartGame();
        }
        break;
      }
    }
  }

  private handleKey(e: KeyboardEvent): void {
    if (e.code === "Space" || e.key === " ") {
      const rect = this.canvas.getBoundingClientRect();
      const synth = new PointerEvent("pointerdown", {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      });
      this.handlePointer(synth);
    }
  }

  // ── Network Callbacks ─────────────────────────────────────

  private setupNetCallbacks(): void {
    const client = this.netClient!;

    client.onPlayerJoined = (data) => {
      this.model.addPlayer(data.playerIndex, data.name);
    };

    client.onPlayerLeft = (playerIndex) => {
      this.model.removePlayer(playerIndex);
    };

    client.onStart = (data) => {
      this.gameOverTime = 0;
      this.lastDeathSent = false;
      this.ghostInterp.clear();
      this.model.startCountdown(data.seed);
    };

    client.onOpponentState = (data) => {
      this.model.updateOpponent(data.playerIndex, data.y, data.score, data.alive);

      // Update ghost interpolation
      const existing = this.ghostInterp.get(data.playerIndex);
      if (existing) {
        existing.prevY = existing.prevY + (existing.targetY - existing.prevY) * existing.t;
        existing.targetY = data.y;
        existing.t = 0;
      } else {
        this.ghostInterp.set(data.playerIndex, {
          prevY: data.y,
          targetY: data.y,
          t: 1,
        });
      }
    };

    client.onAllFinished = () => {
      this.model.showResults();
    };

    client.onDisconnected = () => {
      this.model.multiDisconnected();
    };

    client.onError = (message) => {
      this.model.setMultiError(message);
    };
  }

  // ── Helpers ───────────────────────────────────────────────

  private disconnectAndReturnToMenu(): void {
    this.netClient?.disconnect();
    this.netClient = null;
    this.gameOverTime = 0;
    this.model.returnToMenu();
  }

  private getCanvasCoords(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private isMultiButtonHit(
    pos: { x: number; y: number },
    state: Readonly<ReturnType<GameModel["getState"]>>
  ): boolean {
    const cx = state.canvasWidth / 2;
    const cy = state.canvasHeight * MULTI_BUTTON_Y_FRAC;
    return (
      pos.x >= cx - MULTI_BUTTON_W / 2 &&
      pos.x <= cx + MULTI_BUTTON_W / 2 &&
      pos.y >= cy - MULTI_BUTTON_H / 2 &&
      pos.y <= cy + MULTI_BUTTON_H / 2
    );
  }

  private isStartButtonHit(
    pos: { x: number; y: number },
    state: Readonly<ReturnType<GameModel["getState"]>>
  ): boolean {
    const cx = state.canvasWidth / 2;
    const cy = state.canvasHeight * START_BUTTON_Y_FRAC;
    return (
      pos.x >= cx - START_BUTTON_W / 2 &&
      pos.x <= cx + START_BUTTON_W / 2 &&
      pos.y >= cy - START_BUTTON_H / 2 &&
      pos.y <= cy + START_BUTTON_H / 2
    );
  }

  private isPlayAgainButtonHit(
    pos: { x: number; y: number },
    state: Readonly<ReturnType<GameModel["getState"]>>
  ): boolean {
    const cx = state.canvasWidth / 2;
    const cy = state.canvasHeight * PLAY_AGAIN_BUTTON_Y_FRAC;
    return (
      pos.x >= cx - PLAY_AGAIN_BUTTON_W / 2 &&
      pos.x <= cx + PLAY_AGAIN_BUTTON_W / 2 &&
      pos.y >= cy - PLAY_AGAIN_BUTTON_H / 2 &&
      pos.y <= cy + PLAY_AGAIN_BUTTON_H / 2
    );
  }

  private isCopyLinkButtonHit(
    pos: { x: number; y: number },
    state: Readonly<ReturnType<GameModel["getState"]>>
  ): boolean {
    const cx = state.canvasWidth / 2;
    const cy = state.canvasHeight * COPY_LINK_BUTTON_Y_FRAC;
    return (
      pos.x >= cx - COPY_LINK_BUTTON_W / 2 &&
      pos.x <= cx + COPY_LINK_BUTTON_W / 2 &&
      pos.y >= cy - COPY_LINK_BUTTON_H / 2 &&
      pos.y <= cy + COPY_LINK_BUTTON_H / 2
    );
  }

  private async copyOrShareLink(roomId: string): Promise<void> {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "FloppyCat", url });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API not available
    }
  }

  private isDebouncing(): boolean {
    return (
      this.gameOverTime > 0 &&
      performance.now() - this.gameOverTime < RESTART_DELAY_MS
    );
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
