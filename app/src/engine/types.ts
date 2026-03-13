/**
 * Shared type definitions for the FloppyCat MVC game engine.
 *
 * These types define the contract between Model, View, and Controller.
 * No logic lives here — only data shapes.
 */

// ── Game States ──────────────────────────────────────────

export enum GamePhase {
  // Solo
  Menu = "menu",
  Playing = "playing",
  GameOver = "gameover",
  Leaderboard = "leaderboard",
  // Multiplayer (covers 2-10 players, replaces old PVP phases)
  MultiLobby = "multi_lobby",
  MultiCountdown = "multi_countdown",
  MultiPlaying = "multi_playing",
  MultiSpectating = "multi_spectating",
  MultiResult = "multi_result",
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

// ── Cat Colors ───────────────────────────────────────────

export interface CatColorPalette {
  body: string;
  accent: string;
  paw: string;
  name: string;
}

export const CAT_COLORS: CatColorPalette[] = [
  { body: "#F4A460", accent: "#E8941A", paw: "#F4C77D", name: "Orange" },
  { body: "#A8A8A8", accent: "#787878", paw: "#C0C0C0", name: "Gray" },
  { body: "#4A4A4A", accent: "#2A2A2A", paw: "#666666", name: "Black" },
  { body: "#F0F0F0", accent: "#C8C8C8", paw: "#FFFFFF", name: "White" },
  { body: "#E8C08A", accent: "#CC8844", paw: "#F0D8B0", name: "Calico" },
  { body: "#D4C5A9", accent: "#8B7355", paw: "#E0D5C0", name: "Siamese" },
  { body: "#E07830", accent: "#C05010", paw: "#F09050", name: "Ginger" },
  { body: "#8898B0", accent: "#607090", paw: "#A0B0C8", name: "Russian Blue" },
  { body: "#3A3A3A", accent: "#1A1A1A", paw: "#555555", name: "Tuxedo" },
  { body: "#B8956A", accent: "#8B7040", paw: "#D0B088", name: "Tabby" },
];

// ── Multiplayer State ────────────────────────────────────

export interface OpponentState {
  playerIndex: number;
  name: string;
  y: number;
  displayY: number; // interpolated Y for smooth ghost rendering
  score: number;
  alive: boolean;
  lastUpdateTime: number;
}

export interface PlayerInfo {
  index: number;
  name: string;
  connected: boolean;
}

export interface MultiplayerState {
  playerIndex: number;
  playerName: string;
  roomId: string;
  isHost: boolean;
  players: PlayerInfo[];
  opponents: OpponentState[];
  countdown: number; // seconds remaining during countdown
  seed: number;
  selfAlive: boolean;
  deathOrder: { playerIndex: number; score: number }[];
  error: string | null;
}

// ── Leaderboard ─────────────────────────────────────────

export type LeaderboardPeriod = "daily" | "weekly" | "alltime";

export interface LeaderboardEntry {
  id: number;
  name: string;
  score: number;
  date: string;
}

export interface LeaderboardRanks {
  daily: number;
  weekly: number;
  alltime: number;
}

export interface LeaderboardState {
  entries: LeaderboardEntry[];
  period: LeaderboardPeriod;
  loading: boolean;
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
  multi: MultiplayerState | null; // null in solo mode
  leaderboard: LeaderboardState;
  lastRank: LeaderboardRanks | null; // set after score submission, cleared on menu
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
  countdownSeconds: number; // countdown before multiplayer race
  multiMaxPlayers: number; // max players per room (2-10)
  multiLastAliveTimeout: number; // seconds after second-to-last death
}
