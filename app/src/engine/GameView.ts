/**
 * GameView — the View in FloppyCat's MVC architecture.
 *
 * Handles ALL rendering and presentation:
 *   - Sky gradient background with parallax clouds
 *   - Scrolling ground strip
 *   - Scratching-post style obstacle pipes
 *   - Shape-based cat (no external images)
 *   - Jump particles
 *   - Score display
 *   - Menu screen with bobbing cat and title
 *   - Game-over overlay with score summary
 *   - PVP: lobby, countdown, ghost cat, race results with crown
 *
 * The View has ZERO knowledge of game rules or input.
 * It receives a Readonly<GameState> snapshot and draws it.
 */

import { GameState, GamePhase, GameConfig } from "./types";

// ── Cat Color Palettes ──────────────────────────────────

interface CatColors {
  body: string;
  stroke: string;
  paw: string;
}

const PLAYER_COLORS: CatColors = {
  body: "#F4A460",
  stroke: "#E8941A",
  paw: "#F4C77D",
};

const GHOST_COLORS: CatColors = {
  body: "#FFB6C1",
  stroke: "#E8879B",
  paw: "#FFCDD8",
};

// ── Layout constants for hit-testable UI ────────────────
// These are also used by the Controller for hit testing.
// Positions are fractions of canvas dimensions.

export const RACE_BUTTON_Y_FRAC = 0.82;
export const RACE_BUTTON_W = 170;
export const RACE_BUTTON_H = 38;

export const COPY_BUTTON_Y_FRAC = 0.52;
export const COPY_BUTTON_W = 140;
export const COPY_BUTTON_H = 34;

export class GameView {
  private ctx: CanvasRenderingContext2D;
  private config: GameConfig;
  private frameCount = 0;
  private catSprite: HTMLImageElement;
  private catSpriteLoaded = false;

  constructor(ctx: CanvasRenderingContext2D, config: GameConfig) {
    this.ctx = ctx;
    this.config = config;

    this.catSprite = new Image();
    this.catSprite.onload = () => { this.catSpriteLoaded = true; };
    this.catSprite.src = "/sprites/right_cat.png";
  }

  /** Replace the rendering context (e.g. after resize). */
  setContext(ctx: CanvasRenderingContext2D): void {
    this.ctx = ctx;
  }

  /** Main render entry point — clears and draws the full frame. */
  render(state: Readonly<GameState>): void {
    this.frameCount++;
    const { ctx } = this;
    const { canvasWidth: w, canvasHeight: h } = state;

    ctx.clearRect(0, 0, w, h);

    switch (state.phase) {
      case GamePhase.Menu:
        this.drawBackground(state);
        this.drawGround(state);
        this.drawCat(state);
        this.drawMenu(state);
        break;

      case GamePhase.Playing:
        this.drawBackground(state);
        this.drawGround(state);
        this.drawObstacles(state);
        this.drawParticles(state);
        this.drawCat(state);
        this.drawScore(state);
        break;

      case GamePhase.GameOver:
        this.drawBackground(state);
        this.drawGround(state);
        this.drawObstacles(state);
        this.drawParticles(state);
        this.drawCat(state);
        this.drawScore(state);
        this.drawGameOver(state);
        break;

      case GamePhase.PvpLobby:
        this.drawBackground(state);
        this.drawGround(state);
        this.drawLobby(state);
        break;

      case GamePhase.PvpCountdown:
        this.drawBackground(state);
        this.drawGround(state);
        this.drawCat(state);
        this.drawCountdown(state);
        break;

      case GamePhase.PvpPlaying:
        this.drawBackground(state);
        this.drawGround(state);
        this.drawObstacles(state);
        this.drawParticles(state);
        this.drawGhostCat(state);
        this.drawCat(state);
        this.drawPvpHud(state);
        break;

      case GamePhase.PvpResult:
        this.drawBackground(state);
        this.drawGround(state);
        this.drawObstacles(state);
        this.drawCat(state);
        this.drawPvpResult(state);
        break;
    }
  }

  // ── Background ───────────────────────────────────────────

  private drawBackground(state: Readonly<GameState>): void {
    const { ctx } = this;
    const { canvasWidth: w, groundY } = state;

    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, groundY);
    grad.addColorStop(0, "#87CEEB");
    grad.addColorStop(0.7, "#B0E0F0");
    grad.addColorStop(1, "#FDE68A");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, groundY);

    this.drawClouds(state);
  }

  private drawClouds(state: Readonly<GameState>): void {
    const { ctx } = this;
    const { canvasWidth: w } = state;
    const offset = (state.elapsedTime * state.scrollSpeed * 0.2) % (w + 200);

    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    const clouds = [
      { baseX: w * 0.2, y: 60, rx: 40, ry: 18 },
      { baseX: w * 0.6, y: 100, rx: 50, ry: 20 },
      { baseX: w * 1.0, y: 45, rx: 35, ry: 15 },
    ];

    for (const c of clouds) {
      const x =
        (((c.baseX - offset) % (w + 200)) + w + 200) % (w + 200) - 100;
      ctx.beginPath();
      ctx.ellipse(x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Ground ───────────────────────────────────────────────

  private drawGround(state: Readonly<GameState>): void {
    const { ctx } = this;
    const {
      canvasWidth: w,
      canvasHeight: h,
      groundY,
      scrollSpeed,
      elapsedTime,
    } = state;

    ctx.fillStyle = "#8B7355";
    ctx.fillRect(0, groundY, w, h - groundY);

    ctx.fillStyle = "#4CAF50";
    ctx.fillRect(0, groundY, w, 4);

    ctx.strokeStyle = "#7A6248";
    ctx.lineWidth = 1;
    const spacing = 20;
    const scrollOffset = (elapsedTime * scrollSpeed) % spacing;
    for (let x = -scrollOffset; x < w; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, groundY + 10);
      ctx.lineTo(x + 6, groundY + (h - groundY));
      ctx.stroke();
    }
  }

  // ── Obstacles (Scratching Posts) ─────────────────────────

  private drawObstacles(state: Readonly<GameState>): void {
    for (const obs of state.obstacles) {
      const gapTop = obs.gapY - obs.gapHeight / 2;
      const gapBottom = obs.gapY + obs.gapHeight / 2;
      this.drawPipe(obs.x, 0, gapTop, obs.width, true);
      this.drawPipe(obs.x, gapBottom, state.groundY, obs.width, false);
    }
  }

  private drawPipe(
    x: number,
    yStart: number,
    yEnd: number,
    width: number,
    capAtBottom: boolean
  ): void {
    const { ctx } = this;
    const height = yEnd - yStart;
    if (height <= 0) return;

    ctx.fillStyle = "#D2B48C";
    ctx.fillRect(x, yStart, width, height);

    ctx.strokeStyle = "#C19A6B";
    ctx.lineWidth = 1;
    const lineSpacing = 8;
    const startLine = Math.ceil(yStart / lineSpacing) * lineSpacing;
    for (let ly = startLine; ly < yEnd; ly += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, ly);
      ctx.lineTo(x + width, ly);
      ctx.stroke();
    }

    ctx.strokeStyle = "#A0855A";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, yStart, width, height);

    const capHeight = 16;
    const capOverhang = 6;
    const capX = x - capOverhang;
    const capWidth = width + capOverhang * 2;
    const capY = capAtBottom ? yEnd - capHeight : yStart;

    ctx.fillStyle = "#A0522D";
    ctx.beginPath();
    this.roundRect(capX, capY, capWidth, capHeight, 4);
    ctx.fill();
    ctx.strokeStyle = "#8B4513";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    this.roundRect(capX, capY, capWidth, capHeight, 4);
    ctx.stroke();
  }

  // ── Cat (Parameterized) ──────────────────────────────────

  /** Draw the player's cat from game state. */
  private drawCat(state: Readonly<GameState>): void {
    const { cat, phase, pvp } = state;
    const isDead =
      phase === GamePhase.GameOver ||
      (phase === GamePhase.PvpPlaying && pvp !== null && !pvp.selfAlive) ||
      (phase === GamePhase.PvpResult && pvp !== null && pvp.result !== "win");

    // On menu, show bobbing cat
    if (phase === GamePhase.Menu) {
      const bob = Math.sin(this.frameCount * 0.05) * 12;
      this.drawCatSprite(
        cat.x,
        state.canvasHeight * 0.42 + bob,
        0,
        cat.width,
        cat.height,
        false,
        PLAYER_COLORS
      );
      return;
    }

    this.drawCatSprite(
      cat.x,
      cat.y,
      cat.rotation,
      cat.width,
      cat.height,
      isDead,
      PLAYER_COLORS
    );
  }

  /** Draw the opponent ghost cat (pink, semi-transparent). */
  private drawGhostCat(state: Readonly<GameState>): void {
    const { pvp, cat } = state;
    if (!pvp) return;

    const ghostAlpha = pvp.opponent.alive ? 0.5 : 0.3;
    if (ghostAlpha <= 0) return;

    this.ctx.save();
    this.ctx.globalAlpha = ghostAlpha;
    this.drawCatSprite(
      cat.x,
      pvp.opponentDisplayY,
      0,
      cat.width,
      cat.height,
      !pvp.opponent.alive,
      GHOST_COLORS
    );
    this.ctx.restore();
  }

  /** Core cat drawing with explicit parameters. */
  private drawCatSprite(
    x: number,
    y: number,
    rotation: number,
    bw: number,
    bh: number,
    isDead: boolean,
    colors: CatColors
  ): void {
    const { ctx } = this;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    if (this.catSpriteLoaded) {
      const aspect = this.catSprite.naturalWidth / this.catSprite.naturalHeight;
      const drawH = bh * 2;
      const drawW = drawH * aspect;

      // Pink hue shift for ghost/opponent cat
      if (colors === GHOST_COLORS) {
        ctx.filter = "hue-rotate(320deg) saturate(1.3)";
      }

      ctx.drawImage(this.catSprite, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.filter = "none";

      // X eyes for dead state
      if (isDead) {
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2.5;
        const headOx = drawW * 0.15;
        const headOy = -drawH * 0.08;
        for (const ox of [-4, 4]) {
          const ex = headOx + ox;
          const ey = headOy;
          ctx.beginPath();
          ctx.moveTo(ex - 3, ey - 3);
          ctx.lineTo(ex + 3, ey + 3);
          ctx.moveTo(ex + 3, ey - 3);
          ctx.lineTo(ex - 3, ey + 3);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  // ── Crown ────────────────────────────────────────────────

  private drawCrown(x: number, y: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = "#FFD700";
    ctx.strokeStyle = "#DAA520";
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(x - 12, y + 2);
    ctx.lineTo(x - 10, y - 8);
    ctx.lineTo(x - 5, y - 2);
    ctx.lineTo(x, y - 12);
    ctx.lineTo(x + 5, y - 2);
    ctx.lineTo(x + 10, y - 8);
    ctx.lineTo(x + 12, y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // ── Particles ────────────────────────────────────────────

  private drawParticles(state: Readonly<GameState>): void {
    const { ctx } = this;
    for (const p of state.particles) {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Score ────────────────────────────────────────────────

  private drawScore(state: Readonly<GameState>): void {
    const { ctx } = this;
    const x = state.canvasWidth / 2;

    ctx.save();
    ctx.font = "bold 48px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.strokeText(String(state.score), x, 30);

    ctx.fillStyle = "white";
    ctx.fillText(String(state.score), x, 30);
    ctx.restore();
  }

  // ── Menu Screen ──────────────────────────────────────────

  private drawMenu(state: Readonly<GameState>): void {
    const { ctx } = this;
    const { canvasWidth: w, canvasHeight: h, highScore } = state;
    const cx = w / 2;

    // Title
    ctx.save();
    ctx.font = "bold 40px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.strokeText("FloppyCat", cx, h * 0.2);

    ctx.fillStyle = "#E8941A";
    ctx.fillText("FloppyCat", cx, h * 0.2);
    ctx.restore();

    // "Tap to Play" with pulsing opacity
    ctx.save();
    const pulse = 0.5 + 0.5 * Math.sin(this.frameCount * 0.06);
    ctx.globalAlpha = pulse;
    ctx.font = "600 18px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#333";
    ctx.fillText("Tap to Play", cx, h * 0.62);
    ctx.restore();

    // High score
    if (highScore > 0) {
      ctx.save();
      ctx.font = "500 16px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#666";
      ctx.fillText(`Best: ${highScore}`, cx, h * 0.7);
      ctx.restore();
    }

    // "Race a Friend" button
    this.drawButton(
      cx,
      h * RACE_BUTTON_Y_FRAC,
      RACE_BUTTON_W,
      RACE_BUTTON_H,
      "Race a Friend",
      "#E8941A",
      "white"
    );
  }

  // ── Game Over Screen ─────────────────────────────────────

  private drawGameOver(state: Readonly<GameState>): void {
    const { ctx } = this;
    const { canvasWidth: w, canvasHeight: h, score, highScore } = state;
    const cx = w / 2;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, w, h);

    ctx.font = "bold 36px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeText("Game Over", cx, h * 0.3);
    ctx.fillStyle = "white";
    ctx.fillText("Game Over", cx, h * 0.3);

    ctx.font = "bold 52px system-ui";
    ctx.fillText(String(score), cx, h * 0.42);

    ctx.font = "500 18px system-ui";
    ctx.fillStyle = "#ddd";
    const isNewBest = score >= highScore && score > 0;
    ctx.fillText(
      isNewBest ? `New Best: ${highScore}!` : `Best: ${highScore}`,
      cx,
      h * 0.52
    );

    const pulse = 0.5 + 0.5 * Math.sin(this.frameCount * 0.06);
    ctx.globalAlpha = pulse;
    ctx.font = "600 18px system-ui";
    ctx.fillStyle = "white";
    ctx.fillText("Tap to Restart", cx, h * 0.65);

    ctx.restore();
  }

  // ── PVP: Lobby ───────────────────────────────────────────

  private drawLobby(state: Readonly<GameState>): void {
    const { ctx } = this;
    const { canvasWidth: w, canvasHeight: h, pvp } = state;
    if (!pvp) return;
    const cx = w / 2;

    // Title
    ctx.save();
    ctx.font = "bold 36px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeText("PVP Race", cx, h * 0.15);
    ctx.fillStyle = "#E8941A";
    ctx.fillText("PVP Race", cx, h * 0.15);
    ctx.restore();

    // Error state
    if (pvp.error) {
      ctx.save();
      ctx.font = "500 16px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#FF6B6B";
      ctx.fillText(pvp.error, cx, h * 0.4);
      ctx.font = "500 14px system-ui";
      ctx.fillStyle = "#666";
      ctx.fillText("Tap to return to menu", cx, h * 0.5);
      ctx.restore();
      return;
    }

    // Connecting state
    if (pvp.roomId === "") {
      ctx.save();
      ctx.font = "500 18px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#666";
      const dots = ".".repeat((Math.floor(this.frameCount / 30) % 3) + 1);
      ctx.fillText(`Connecting${dots}`, cx, h * 0.4);
      ctx.restore();
      return;
    }

    // Room code
    ctx.save();
    ctx.font = "bold 48px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#333";
    ctx.fillText(pvp.roomId, cx, h * 0.32);

    ctx.font = "500 14px system-ui";
    ctx.fillStyle = "#888";
    ctx.fillText("Share this code with a friend", cx, h * 0.42);
    ctx.restore();

    // Copy Link button
    this.drawButton(
      cx,
      h * COPY_BUTTON_Y_FRAC,
      COPY_BUTTON_W,
      COPY_BUTTON_H,
      "Copy Link",
      "#4CAF50",
      "white"
    );

    // Connection status
    ctx.save();
    ctx.font = "500 16px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (!pvp.opponentConnected) {
      ctx.fillStyle = "#888";
      const dots = ".".repeat((Math.floor(this.frameCount / 30) % 3) + 1);
      ctx.fillText(`Waiting for opponent${dots}`, cx, h * 0.65);
    } else if (!pvp.selfReady) {
      ctx.fillStyle = "#4CAF50";
      ctx.fillText("Opponent connected!", cx, h * 0.62);

      // Pulsing "Tap to Ready"
      const pulse = 0.5 + 0.5 * Math.sin(this.frameCount * 0.06);
      ctx.globalAlpha = pulse;
      ctx.font = "600 18px system-ui";
      ctx.fillStyle = "#333";
      ctx.fillText("Tap to Ready", cx, h * 0.72);
    } else if (!pvp.opponentReady) {
      ctx.fillStyle = "#4CAF50";
      ctx.fillText("You're ready!", cx, h * 0.62);
      ctx.fillStyle = "#888";
      const dots = ".".repeat((Math.floor(this.frameCount / 30) % 3) + 1);
      ctx.fillText(`Waiting for opponent${dots}`, cx, h * 0.72);
    }

    ctx.restore();
  }

  // ── PVP: Countdown ───────────────────────────────────────

  private drawCountdown(state: Readonly<GameState>): void {
    const { ctx } = this;
    const { canvasWidth: w, canvasHeight: h, pvp } = state;
    if (!pvp) return;

    const num = Math.ceil(pvp.countdown);
    if (num <= 0) return;

    ctx.save();
    ctx.font = "bold 80px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = 5;
    ctx.lineJoin = "round";
    ctx.strokeText(String(num), w / 2, h * 0.35);

    ctx.fillStyle = "white";
    ctx.fillText(String(num), w / 2, h * 0.35);

    ctx.restore();
  }

  // ── PVP: In-Race HUD ────────────────────────────────────

  private drawPvpHud(state: Readonly<GameState>): void {
    const { ctx } = this;
    const { canvasWidth: w, pvp, score } = state;
    if (!pvp) return;

    ctx.save();
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";

    // Player score (left)
    ctx.font = "bold 36px system-ui";
    ctx.textAlign = "left";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = 3;
    ctx.strokeText(String(score), 16, 14);
    ctx.fillStyle = "white";
    ctx.fillText(String(score), 16, 14);

    // Opponent score (right, pink)
    ctx.textAlign = "right";
    ctx.strokeText(String(pvp.opponent.score), w - 16, 14);
    ctx.fillStyle = "#FFB6C1";
    ctx.fillText(String(pvp.opponent.score), w - 16, 14);

    // Labels
    ctx.font = "500 12px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.textAlign = "left";
    ctx.fillText("You", 16, 52);
    ctx.textAlign = "right";
    ctx.fillText("Opponent", w - 16, 52);

    // If self is dead, show overlay
    if (!pvp.selfAlive) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.fillRect(0, 0, w, state.canvasHeight);

      ctx.font = "600 18px system-ui";
      ctx.textAlign = "center";
      ctx.fillStyle = "white";
      const dots = ".".repeat((Math.floor(this.frameCount / 30) % 3) + 1);
      ctx.fillText(`Waiting for opponent${dots}`, w / 2, state.canvasHeight * 0.45);
    }

    ctx.restore();
  }

  // ── PVP: Results ─────────────────────────────────────────

  private drawPvpResult(state: Readonly<GameState>): void {
    const { ctx } = this;
    const { canvasWidth: w, canvasHeight: h, pvp, score } = state;
    if (!pvp) return;
    const cx = w / 2;

    ctx.save();

    // Dark overlay
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, w, h);

    // Result text
    ctx.font = "bold 36px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";

    const resultText = pvp.result === "win" ? "You Win!" : "You Lose!";
    const resultColor = pvp.result === "win" ? "#FFD700" : "#FF6B6B";
    ctx.strokeText(resultText, cx, h * 0.18);
    ctx.fillStyle = resultColor;
    ctx.fillText(resultText, cx, h * 0.18);

    // Scores side by side
    const leftX = w * 0.3;
    const rightX = w * 0.7;
    const scoreY = h * 0.32;

    ctx.font = "500 14px system-ui";
    ctx.fillStyle = "#ccc";
    ctx.fillText("You", leftX, scoreY - 14);
    ctx.fillText("Opponent", rightX, scoreY - 14);

    ctx.font = "bold 36px system-ui";
    ctx.fillStyle = "white";
    ctx.fillText(String(score), leftX, scoreY + 16);
    ctx.fillText(String(pvp.opponent.score), rightX, scoreY + 16);

    // Draw cats
    const catY = h * 0.56;
    const catW = state.cat.width;
    const catH = state.cat.height;
    const playerIsWinner = pvp.result === "win";

    this.drawCatSprite(
      leftX, catY, 0, catW, catH,
      !playerIsWinner, PLAYER_COLORS
    );
    this.drawCatSprite(
      rightX, catY, 0, catW, catH,
      playerIsWinner, GHOST_COLORS
    );

    // Crown on winner
    const crownOffset = catW / 2 - 4; // headX relative to cat center
    if (playerIsWinner) {
      this.drawCrown(leftX + crownOffset, catY - 4 - 13 - 3);
    } else {
      this.drawCrown(rightX + crownOffset, catY - 4 - 13 - 3);
    }

    // Disconnect message if applicable
    if (pvp.error) {
      ctx.font = "500 14px system-ui";
      ctx.fillStyle = "#FF6B6B";
      ctx.fillText(pvp.error, cx, h * 0.68);
    }

    // Rematch prompt
    ctx.font = "600 18px system-ui";
    ctx.textAlign = "center";
    if (pvp.selfRematch && !pvp.opponentRematch) {
      ctx.fillStyle = "#aaa";
      const dots = ".".repeat((Math.floor(this.frameCount / 30) % 3) + 1);
      ctx.fillText(`Waiting for opponent${dots}`, cx, h * 0.78);
    } else if (!pvp.error) {
      const pulse = 0.5 + 0.5 * Math.sin(this.frameCount * 0.06);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = "white";
      ctx.fillText("Tap to Rematch", cx, h * 0.78);
    } else {
      const pulse = 0.5 + 0.5 * Math.sin(this.frameCount * 0.06);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = "white";
      ctx.fillText("Tap to Exit", cx, h * 0.78);
    }

    ctx.restore();
  }

  // ── Shared UI: Button ────────────────────────────────────

  private drawButton(
    cx: number,
    cy: number,
    w: number,
    h: number,
    text: string,
    bgColor: string,
    textColor: string
  ): void {
    const { ctx } = this;
    ctx.save();

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    this.roundRect(cx - w / 2, cy - h / 2, w, h, 8);
    ctx.fill();

    ctx.font = "600 15px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = textColor;
    ctx.fillText(text, cx, cy);

    ctx.restore();
  }

  // ── Drawing Helpers ──────────────────────────────────────

  private drawTriangle(
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number
  ): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.fill();
  }

  private roundRect(
    x: number, y: number,
    w: number, h: number,
    r: number
  ): void {
    const { ctx } = this;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
  }
}
