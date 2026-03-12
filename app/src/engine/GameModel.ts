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
 *   - PVP state (lobby, countdown, race, results)
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
  PvpInfo,
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
      pvp: null,
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

  /** GameOver -> Menu. */
  returnToMenu(): void {
    this.state.phase = GamePhase.Menu;
    this.state.cat = this.createCat(this.state.canvasWidth, this.state.groundY);
    this.state.obstacles = [];
    this.state.particles = [];
    this.state.pvp = null;
  }

  // ── State Transitions (PVP) ──────────────────────────────

  /** Enter PVP lobby. */
  initPvp(
    roomId: string,
    playerIndex: number,
    opponentConnected: boolean
  ): void {
    this.state.phase = GamePhase.PvpLobby;
    this.state.pvp = {
      roomId,
      playerIndex,
      opponentConnected,
      selfReady: false,
      opponentReady: false,
      selfAlive: true,
      countdown: 0,
      opponent: { y: 0, score: 0, alive: true },
      opponentDisplayY: 0,
      result: "pending",
      tiebreaker: 0,
      firstDeathTime: 0,
      selfRematch: false,
      opponentRematch: false,
      error: null,
    };
  }

  setPvpRoomId(roomId: string): void {
    if (this.state.pvp) this.state.pvp.roomId = roomId;
  }

  setOpponentConnected(): void {
    if (this.state.pvp) this.state.pvp.opponentConnected = true;
  }

  setSelfReady(): void {
    if (this.state.pvp) this.state.pvp.selfReady = true;
  }

  setOpponentReady(): void {
    if (this.state.pvp) this.state.pvp.opponentReady = true;
  }

  setPvpError(message: string): void {
    if (this.state.pvp) this.state.pvp.error = message;
  }

  /** Both players ready — start countdown. */
  startCountdown(seed: number, tiebreaker: number): void {
    if (!this.state.pvp) return;
    this.state.pvp.countdown = this.config.pvpCountdownSeconds;
    this.state.pvp.tiebreaker = tiebreaker;
    this.state.phase = GamePhase.PvpCountdown;
    this.rng = mulberry32(seed);
  }

  /** Countdown finished — start the race. */
  startPvpGame(): void {
    const { canvasWidth, groundY } = this.state;
    this.state.phase = GamePhase.PvpPlaying;
    this.state.cat = this.createCat(canvasWidth, groundY);
    this.state.obstacles = [];
    this.state.particles = [];
    this.state.score = 0;
    this.state.elapsedTime = 0;
    this.state.scrollSpeed = this.config.scrollSpeed;

    if (this.state.pvp) {
      this.state.pvp.selfAlive = true;
      this.state.pvp.opponent = {
        y: this.state.cat.y,
        score: 0,
        alive: true,
      };
      this.state.pvp.opponentDisplayY = this.state.cat.y;
      this.state.pvp.firstDeathTime = 0;
      this.state.pvp.result = "pending";
      this.state.pvp.selfRematch = false;
      this.state.pvp.opponentRematch = false;
    }
  }

  updateOpponent(y: number, score: number, alive: boolean): void {
    if (!this.state.pvp) return;
    this.state.pvp.opponent.y = y;
    this.state.pvp.opponent.score = score;

    if (this.state.pvp.opponent.alive && !alive) {
      // Opponent just died
      this.state.pvp.opponent.alive = false;
      if (this.state.pvp.firstDeathTime === 0) {
        this.state.pvp.firstDeathTime = this.state.elapsedTime;
      }
    }
  }

  setOpponentDisplayY(y: number): void {
    if (this.state.pvp) this.state.pvp.opponentDisplayY = y;
  }

  opponentDisconnected(): void {
    if (!this.state.pvp) return;
    const phase = this.state.phase;

    if (
      phase === GamePhase.PvpPlaying ||
      phase === GamePhase.PvpCountdown ||
      phase === GamePhase.PvpLobby
    ) {
      // Auto-win if mid-race or in lobby
      this.state.pvp.opponent.alive = false;
      this.state.pvp.result =
        phase === GamePhase.PvpLobby ? "pending" : "win";
      this.state.pvp.error = "Opponent disconnected";
      if (phase === GamePhase.PvpPlaying) {
        this.state.phase = GamePhase.PvpResult;
      } else {
        this.state.phase = GamePhase.PvpResult;
      }
    }
  }

  setSelfRematch(): void {
    if (this.state.pvp) this.state.pvp.selfRematch = true;
  }

  setOpponentRematch(): void {
    if (this.state.pvp) this.state.pvp.opponentRematch = true;
  }

  // ── Player Actions ───────────────────────────────────────

  /** Apply jump impulse to the cat. Works during Playing and PvpPlaying. */
  jump(): void {
    const { phase } = this.state;
    if (phase === GamePhase.Playing) {
      this.state.cat.velocity = this.config.jumpVelocity;
      this.spawnJumpParticles();
    } else if (phase === GamePhase.PvpPlaying && this.state.pvp?.selfAlive) {
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
    } else if (phase === GamePhase.PvpCountdown) {
      this.updatePvpCountdown(dt);
    } else if (phase === GamePhase.PvpPlaying) {
      this.updatePvp(dt);
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

  private updatePvpCountdown(dt: number): void {
    if (!this.state.pvp) return;
    this.state.pvp.countdown -= dt;
    if (this.state.pvp.countdown <= 0) {
      this.state.pvp.countdown = 0;
      this.startPvpGame();
    }
  }

  private updatePvp(dt: number): void {
    const pvp = this.state.pvp;
    if (!pvp) return;

    this.state.elapsedTime += dt;
    this.updateDifficulty();

    if (pvp.selfAlive) {
      this.updateCat(dt);
      this.updateParticles(dt);
      this.checkScoring();

      if (this.checkCollisions()) {
        pvp.selfAlive = false;
        if (pvp.firstDeathTime === 0) {
          pvp.firstDeathTime = this.state.elapsedTime;
        }
      }
    }

    // Obstacles keep scrolling for visual continuity
    this.updateObstacles(dt);

    // Check race end
    this.checkPvpRaceEnd();
  }

  private checkPvpRaceEnd(): void {
    const pvp = this.state.pvp;
    if (!pvp || pvp.result !== "pending") return;

    const bothDead = !pvp.selfAlive && !pvp.opponent.alive;
    const timedOut =
      pvp.firstDeathTime > 0 &&
      this.state.elapsedTime - pvp.firstDeathTime >=
        this.config.pvpResultTimeout;

    if (bothDead || timedOut) {
      this.endPvpRace();
    }
  }

  private endPvpRace(): void {
    const pvp = this.state.pvp;
    if (!pvp) return;

    if (this.state.score > pvp.opponent.score) {
      pvp.result = "win";
    } else if (this.state.score < pvp.opponent.score) {
      pvp.result = "lose";
    } else {
      // Tiebreaker: server-assigned coin flip
      pvp.result = pvp.tiebreaker === pvp.playerIndex ? "win" : "lose";
    }

    this.state.phase = GamePhase.PvpResult;
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
