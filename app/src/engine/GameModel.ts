/**
 * GameModel — the Model in FloppyCat's MVC architecture.
 *
 * Owns ALL game data and rules:
 *   - Cat position, velocity, and rotation
 *   - Obstacle positions and gap sizes
 *   - Score and high-score tracking
 *   - Collision detection (AABB with forgiving insets)
 *   - Gravity and jump physics
 *   - Difficulty scaling over time
 *   - Game phase transitions (Menu -> Playing -> GameOver)
 *   - Multiplayer state (lobby, countdown, race, spectating, results)
 *
 * The Model has ZERO knowledge of rendering or input.
 * It exposes a readonly state snapshot that the View reads,
 * and mutation methods that the Controller calls.
 */

import {
  GameState,
  GamePhase,
  GameConfig,
  CatState,
  Obstacle,
  Particle,
  MultiplayerState,
  OpponentState,
  PlayerInfo,
} from "./types";
import { mulberry32 } from "./rng";

const HIGHSCORE_KEY = "floppycat_highscore";
const PARTICLE_COLORS = ["#FFB6C1", "#FFD700", "#FF69B4", "#FFA07A"];
const MAX_PARTICLES = 50;
const HITBOX_INSET = 3; // px forgiveness on each side

export class GameModel {
  private state: GameState;
  private config: GameConfig;
  private rng: () => number = Math.random;

  constructor(config: GameConfig, canvasWidth: number, canvasHeight: number) {
    this.config = config;
    const groundY = canvasHeight - config.groundHeight;
    const savedHigh = parseInt(localStorage.getItem(HIGHSCORE_KEY) ?? "0", 10);

    this.state = {
      phase: GamePhase.Menu,
      cat: this.createCat(canvasWidth, groundY),
      obstacles: [],
      particles: [],
      score: 0,
      highScore: isNaN(savedHigh) ? 0 : savedHigh,
      scrollSpeed: config.scrollSpeed,
      canvasWidth,
      canvasHeight,
      elapsedTime: 0,
      groundY,
      multi: null,
    };
  }

  // ── Accessors ────────────────────────────────────────────

  getState(): Readonly<GameState> {
    return this.state;
  }

  getConfig(): Readonly<GameConfig> {
    return this.config;
  }

  // ── State Transitions (Solo) ──────────────────────────────

  /** Menu -> Playing. Resets all play state. */
  startGame(): void {
    const { canvasWidth, groundY } = this.state;
    this.state.phase = GamePhase.Playing;
    this.state.cat = this.createCat(canvasWidth, groundY);
    this.state.obstacles = [];
    this.state.particles = [];
    this.state.score = 0;
    this.state.elapsedTime = 0;
    this.state.scrollSpeed = this.config.scrollSpeed;
    this.rng = Math.random;
  }

  /** Playing -> GameOver. Persists high score. */
  endGame(): void {
    this.state.phase = GamePhase.GameOver;
    if (this.state.score > this.state.highScore) {
      this.state.highScore = this.state.score;
      localStorage.setItem(HIGHSCORE_KEY, String(this.state.highScore));
    }
  }

  /** GameOver / MultiResult -> Menu. */
  returnToMenu(): void {
    this.state.phase = GamePhase.Menu;
    this.state.cat = this.createCat(this.state.canvasWidth, this.state.groundY);
    this.state.obstacles = [];
    this.state.particles = [];
    this.state.multi = null;
  }

  // ── State Transitions (Multiplayer) ─────────────────────

  /** Enter multiplayer lobby. */
  initMulti(roomId: string, playerIndex: number, playerName: string, isHost: boolean): void {
    this.state.phase = GamePhase.MultiLobby;
    this.state.multi = {
      playerIndex,
      playerName,
      roomId,
      isHost,
      players: [{ index: playerIndex, name: playerName, connected: true }],
      opponents: [],
      countdown: 0,
      seed: 0,
      selfAlive: true,
      deathOrder: [],
      error: null,
    };
  }

  setMultiRoomId(roomId: string): void {
    if (this.state.multi) this.state.multi.roomId = roomId;
  }

  setMultiError(message: string): void {
    if (this.state.multi) this.state.multi.error = message;
  }

  addPlayer(playerIndex: number, name: string): void {
    const multi = this.state.multi;
    if (!multi) return;
    // Avoid duplicates
    if (!multi.players.find((p) => p.index === playerIndex)) {
      multi.players.push({ index: playerIndex, name, connected: true });
    }
  }

  removePlayer(playerIndex: number): void {
    const multi = this.state.multi;
    if (!multi) return;
    const player = multi.players.find((p) => p.index === playerIndex);
    if (player) player.connected = false;
    // Also mark opponent as dead if they were alive
    const opp = multi.opponents.find((o) => o.playerIndex === playerIndex);
    if (opp) opp.alive = false;
  }

  /** Start countdown. */
  startCountdown(seed: number): void {
    if (!this.state.multi) return;
    this.state.multi.countdown = this.config.countdownSeconds;
    this.state.multi.seed = seed;
    this.state.phase = GamePhase.MultiCountdown;
    this.rng = mulberry32(seed);
  }

  /** Countdown finished — start the race. */
  startMultiGame(): void {
    const { canvasWidth, groundY } = this.state;
    const multi = this.state.multi;
    if (!multi) return;

    this.state.phase = GamePhase.MultiPlaying;
    this.state.cat = this.createCat(canvasWidth, groundY);
    this.state.obstacles = [];
    this.state.particles = [];
    this.state.score = 0;
    this.state.elapsedTime = 0;
    this.state.scrollSpeed = this.config.scrollSpeed;

    multi.selfAlive = true;
    multi.deathOrder = [];

    // Initialize opponents from player list
    multi.opponents = [];
    for (const p of multi.players) {
      if (p.index !== multi.playerIndex && p.connected) {
        multi.opponents.push({
          playerIndex: p.index,
          name: p.name,
          y: this.state.cat.y,
          displayY: this.state.cat.y,
          score: 0,
          alive: true,
          lastUpdateTime: 0,
        });
      }
    }
  }

  updateOpponent(playerIndex: number, y: number, score: number, alive: boolean): void {
    const multi = this.state.multi;
    if (!multi) return;

    let opp = multi.opponents.find((o) => o.playerIndex === playerIndex);
    if (!opp) {
      // Late joiner — create opponent entry
      const player = multi.players.find((p) => p.index === playerIndex);
      opp = {
        playerIndex,
        name: player?.name ?? "Player",
        y,
        displayY: y,
        score: 0,
        alive: true,
        lastUpdateTime: performance.now(),
      };
      multi.opponents.push(opp);
    }

    if (opp.alive && !alive) {
      // Opponent just died — record in death order
      multi.deathOrder.push({ playerIndex, score });
    }

    opp.y = y;
    opp.score = score;
    opp.alive = alive;
    opp.lastUpdateTime = performance.now();
  }

  setOpponentDisplayY(playerIndex: number, y: number): void {
    const multi = this.state.multi;
    if (!multi) return;
    const opp = multi.opponents.find((o) => o.playerIndex === playerIndex);
    if (opp) opp.displayY = y;
  }

  /** Self died during multiplayer — switch to spectating. */
  selfDied(): void {
    const multi = this.state.multi;
    if (!multi) return;
    multi.selfAlive = false;
    multi.deathOrder.push({
      playerIndex: multi.playerIndex,
      score: this.state.score,
    });
    this.state.phase = GamePhase.MultiSpectating;
  }

  /** All players finished — show results. */
  showResults(): void {
    this.state.phase = GamePhase.MultiResult;
  }

  /** Connection lost during multiplayer. */
  multiDisconnected(): void {
    const multi = this.state.multi;
    if (!multi) return;
    multi.error = "Disconnected from server";
    this.state.phase = GamePhase.MultiResult;
  }

  // ── Player Actions ───────────────────────────────────────

  /** Apply jump impulse to the cat. Works during Playing and MultiPlaying. */
  jump(): void {
    const { phase } = this.state;
    if (phase === GamePhase.Playing) {
      this.state.cat.velocity = this.config.jumpVelocity;
      this.spawnJumpParticles();
    } else if (phase === GamePhase.MultiPlaying && this.state.multi?.selfAlive) {
      this.state.cat.velocity = this.config.jumpVelocity;
      this.spawnJumpParticles();
    }
  }

  // ── Per-Frame Update ─────────────────────────────────────

  /** Core physics tick. dt is seconds since last frame. */
  update(dt: number): void {
    const { phase } = this.state;

    if (phase === GamePhase.Playing) {
      this.updateSolo(dt);
    } else if (phase === GamePhase.MultiCountdown) {
      this.updateMultiCountdown(dt);
    } else if (phase === GamePhase.MultiPlaying) {
      this.updateMulti(dt);
    } else if (phase === GamePhase.MultiSpectating) {
      // Keep obstacles scrolling for spectating
      this.state.elapsedTime += dt;
      this.updateDifficulty();
      this.updateObstacles(dt);
    }
  }

  private updateSolo(dt: number): void {
    this.state.elapsedTime += dt;
    this.updateDifficulty();
    this.updateCat(dt);
    this.updateObstacles(dt);
    this.updateParticles(dt);
    this.checkScoring();

    if (this.checkCollisions()) {
      this.endGame();
    }
  }

  private updateMultiCountdown(dt: number): void {
    if (!this.state.multi) return;
    this.state.multi.countdown -= dt;
    if (this.state.multi.countdown <= 0) {
      this.state.multi.countdown = 0;
      this.startMultiGame();
    }
  }

  private updateMulti(dt: number): void {
    const multi = this.state.multi;
    if (!multi) return;

    this.state.elapsedTime += dt;
    this.updateDifficulty();

    if (multi.selfAlive) {
      this.updateCat(dt);
      this.updateParticles(dt);
      this.checkScoring();

      if (this.checkCollisions()) {
        this.selfDied();
      }
    }

    // Obstacles keep scrolling for visual continuity
    this.updateObstacles(dt);
  }

  // ── Canvas Resize ────────────────────────────────────────

  resize(canvasWidth: number, canvasHeight: number): void {
    this.state.canvasWidth = canvasWidth;
    this.state.canvasHeight = canvasHeight;
    this.state.groundY = canvasHeight - this.config.groundHeight;
    this.state.cat.x = canvasWidth * this.config.catX;
  }

  // ── Private: Cat Physics ─────────────────────────────────

  private updateCat(dt: number): void {
    const cat = this.state.cat;

    // Gravity
    cat.velocity += this.config.gravity * dt;

    // Terminal velocity
    cat.velocity = Math.min(cat.velocity, this.config.maxVelocity);

    // Position
    cat.y += cat.velocity * dt;

    // Rotation follows velocity: nose-up when rising, nose-down when falling
    cat.rotation = clamp(
      cat.velocity * this.config.rotationFactor,
      -0.5,
      Math.PI / 2
    );
  }

  // ── Private: Obstacles ───────────────────────────────────

  private updateObstacles(dt: number): void {
    const { obstacles, scrollSpeed, canvasWidth, groundY } = this.state;

    // Move existing obstacles left
    for (const obs of obstacles) {
      obs.x -= scrollSpeed * dt;
    }

    // Remove off-screen obstacles
    this.state.obstacles = obstacles.filter(
      (obs) => obs.x + obs.width > 0
    );

    // Spawn new obstacles when needed
    this.spawnObstaclesIfNeeded(canvasWidth, groundY);
  }

  private spawnObstaclesIfNeeded(
    canvasWidth: number,
    groundY: number
  ): void {
    const { obstacles } = this.state;
    const { pipeSpacing, pipeWidth } = this.config;

    // Find the rightmost obstacle edge
    let rightmostX = 0;
    for (const obs of obstacles) {
      rightmostX = Math.max(rightmostX, obs.x + obs.width);
    }

    // Spawn if there's room for a new obstacle
    const spawnX = obstacles.length === 0
      ? canvasWidth + 100
      : rightmostX + pipeSpacing;

    if (spawnX < canvasWidth + pipeSpacing) {
      const currentGapHeight = this.getCurrentGapHeight();
      const minGapY = currentGapHeight / 2 + 40;
      const maxGapY = groundY - currentGapHeight / 2 - 40;
      const gapY = minGapY + this.rng() * (maxGapY - minGapY);

      obstacles.push({
        x: spawnX,
        gapY,
        gapHeight: currentGapHeight,
        width: pipeWidth,
        scored: false,
      });
    }
  }

  // ── Private: Collision Detection ─────────────────────────

  private checkCollisions(): boolean {
    const { cat, obstacles, groundY } = this.state;
    const halfW = cat.width / 2 - HITBOX_INSET;
    const halfH = cat.height / 2 - HITBOX_INSET;

    const catLeft = cat.x - halfW;
    const catRight = cat.x + halfW;
    const catTop = cat.y - halfH;
    const catBottom = cat.y + halfH;

    // Floor / ceiling
    if (catTop < 0 || catBottom > groundY) return true;

    // Pipe collision (AABB)
    for (const obs of obstacles) {
      const pipeLeft = obs.x;
      const pipeRight = obs.x + obs.width;

      // Horizontal overlap?
      if (catRight <= pipeLeft || catLeft >= pipeRight) continue;

      // Top pipe: from 0 to gapTop
      const gapTop = obs.gapY - obs.gapHeight / 2;
      if (catTop < gapTop) return true;

      // Bottom pipe: from gapBottom to groundY
      const gapBottom = obs.gapY + obs.gapHeight / 2;
      if (catBottom > gapBottom) return true;
    }

    return false;
  }

  // ── Private: Scoring ─────────────────────────────────────

  private checkScoring(): void {
    const { cat, obstacles } = this.state;

    for (const obs of obstacles) {
      if (!obs.scored && cat.x > obs.x + obs.width) {
        obs.scored = true;
        this.state.score++;
      }
    }
  }

  // ── Private: Difficulty ──────────────────────────────────

  private updateDifficulty(): void {
    const level = Math.floor(
      this.state.elapsedTime / this.config.difficultyInterval
    );
    this.state.scrollSpeed =
      this.config.scrollSpeed + level * this.config.speedIncreasePerStep;
  }

  private getCurrentGapHeight(): number {
    const level = Math.floor(
      this.state.elapsedTime / this.config.difficultyInterval
    );
    return Math.max(
      this.config.minGapHeight,
      this.config.pipeGapHeight - level * this.config.gapShrinkPerStep
    );
  }

  // ── Private: Particles ───────────────────────────────────

  private spawnJumpParticles(): void {
    const { cat } = this.state;
    const count = 4;
    for (let i = 0; i < count; i++) {
      if (this.state.particles.length >= MAX_PARTICLES) break;
      this.state.particles.push({
        x: cat.x - cat.width / 2,
        y: cat.y + (Math.random() - 0.5) * cat.height,
        vx: -30 - Math.random() * 40,
        vy: (Math.random() - 0.5) * 60,
        life: 1,
        size: 3 + Math.random() * 3,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      });
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 2; // fade out over 0.5s
    }
    this.state.particles = this.state.particles.filter((p) => p.life > 0);
  }

  // ── Private: Helpers ─────────────────────────────────────

  private createCat(canvasWidth: number, groundY: number): CatState {
    return {
      x: canvasWidth * this.config.catX,
      y: groundY * 0.4, // start near upper-middle
      velocity: 0,
      rotation: 0,
      width: this.config.catWidth,
      height: this.config.catHeight,
    };
  }
}

// ── Utility ──────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
