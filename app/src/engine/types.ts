/**
 * Shared type definitions for the FloppyCat MVC game engine.
 *
 * These types define the contract between Model, View, and Controller.
 * No logic lives here — only data shapes.
 */

// ── Game States ──────────────────────────────────────────

export enum GamePhase {
  Menu = "menu",
  Playing = "playing",
  GameOver = "gameover",
  PvpLobby = "pvp_lobby",
  PvpCountdown = "pvp_countdown",
  PvpPlaying = "pvp_playing",
  PvpResult = "pvp_result",
}

// ── Cat (Player) ─────────────────────────────────────────

export interface CatState {
  x: number; // horizontal position (pixels from left)
  y: number; // vertical center position (pixels from top)
  velocity: number; // vertical velocity (positive = downward)
  rotation: number; // visual tilt in radians (derived from velocity)
  width: number; // hitbox width
  height: number; // hitbox height
}

// ── Obstacles ────────────────────────────────────────────

export interface Obstacle {
  x: number; // left edge x-position
  gapY: number; // center of the gap (pixels from top)
  gapHeight: number; // size of the passable gap
  width: number; // pipe width
  scored: boolean; // true once the cat has passed this obstacle
}

// ── Particles (jump feedback) ────────────────────────────

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0..1, decreases each frame
  size: number;
  color: string;
}

// ── PVP State ───────────────────────────────────────────

export interface PvpInfo {
  roomId: string; // '' while connecting
  playerIndex: number; // 0 = host, 1 = joiner
  opponentConnected: boolean;
  selfReady: boolean;
  opponentReady: boolean;
  selfAlive: boolean;
  countdown: number; // PvpCountdown seconds remaining
  opponent: {
    y: number; // raw Y from server
    score: number;
    alive: boolean;
  };
  opponentDisplayY: number; // interpolated Y for smooth ghost rendering
  result: "pending" | "win" | "lose";
  tiebreaker: number; // which playerIndex wins on tie
  firstDeathTime: number; // elapsed time of first death, 0 = none
  selfRematch: boolean;
  opponentRematch: boolean;
  error: string | null;
}

// ── Full Game State Snapshot ─────────────────────────────
// The Model owns this. The View receives a readonly copy.

export interface GameState {
  phase: GamePhase;
  cat: CatState;
  obstacles: Obstacle[];
  particles: Particle[];
  score: number;
  highScore: number;
  scrollSpeed: number; // current horizontal scroll speed (px/s)
  canvasWidth: number;
  canvasHeight: number;
  elapsedTime: number; // seconds since play started (for difficulty)
  groundY: number; // y-position of the ground line
  pvp: PvpInfo | null; // null in solo mode
}

// ── Config (loaded from CSV) ─────────────────────────────

export interface GameConfig {
  gravity: number; // px/s^2
  jumpVelocity: number; // px/s (negative = upward)
  scrollSpeed: number; // initial horizontal speed px/s
  pipeWidth: number; // px
  pipeGapHeight: number; // initial gap size px
  pipeSpacing: number; // horizontal distance between pipe centers px
  minGapHeight: number; // smallest the gap can shrink to
  difficultyInterval: number; // seconds between difficulty increases
  gapShrinkPerStep: number; // px to shrink gap each interval
  speedIncreasePerStep: number; // px/s to add each interval
  catWidth: number; // px
  catHeight: number; // px
  catX: number; // horizontal position (fraction of canvas width)
  groundHeight: number; // px from bottom
  maxVelocity: number; // terminal velocity cap px/s
  rotationFactor: number; // how much velocity affects tilt
  pvpResultTimeout: number; // seconds to wait after first death before ending race
  pvpCountdownSeconds: number; // countdown duration before race starts
}
