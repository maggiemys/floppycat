/**
 * GameView — the View in FloppyCat's MVC architecture.
 *
 * Handles ALL rendering and presentation:
 *   - Sky gradient background with parallax clouds
 *   - Scrolling ground strip
 *   - Scratching-post style obstacle pipes
 *   - Procedural shape-based cat with parameterized colors
 *   - Jump particles
 *   - Score display
 *   - Menu screen with bobbing cat and title
 *   - Game-over overlay with score summary
 *   - Multiplayer: lobby, countdown, ghost cats, leaderboard, results
 *
 * The View has ZERO knowledge of game rules or input.
 * It receives a Readonly<GameState> snapshot and draws it.
 */

import {
  GameState,
  GamePhase,
  GameConfig,
  CatColorPalette,
  CAT_COLORS,
  OpponentState,
  LeaderboardPeriod,
} from "./types";

// Layout constants for hit-testable buttons (shared with Controller)
export const MULTI_BUTTON_Y_FRAC = 0.84;
export const MULTI_BUTTON_W = 170;
export const MULTI_BUTTON_H = 38;

export const LB_BUTTON_Y_FRAC = 0.75;
export const LB_BUTTON_W = 170;
export const LB_BUTTON_H = 38;

export const COPY_LINK_BUTTON_Y_FRAC = 0.32;
export const COPY_LINK_BUTTON_W = 130;
export const COPY_LINK_BUTTON_H = 30;

// Leaderboard tab layout
export const LB_TAB_Y_FRAC = 0.14;
export const LB_TAB_W = 90;
export const LB_TAB_H = 30;
export const LB_TAB_GAP = 8;
export const LB_TABS: LeaderboardPeriod[] = ["daily", "weekly", "alltime"];

export class GameView {
  private ctx: CanvasRenderingContext2D;
  private config: GameConfig;
  private frameCount = 0;
  private headImg: HTMLImageElement | null = null;

  constructor(ctx: CanvasRenderingContext2D, config: GameConfig) {
    this.ctx = ctx;
    this.config = config;

    const img = new Image();
    img.src = "sprites/CalvinCat.png";
    img.onload = () => {
      this.headImg = img;
    };
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
        this.drawMenuCat(state);
        this.drawMenu(state);
        break;

      case GamePhase.Playing:
        this.drawBackground(state);
        this.drawGround(state);
        this.drawObstacles(state);
        this.drawParticles(state);
        this.drawCatFromState(state, false);
        this.drawScore(state);
        break;

      case GamePhase.GameOver:
        this.drawBackground(state);
        this.drawGround(state);
        this.drawObstacles(state);
        this.drawParticles(state);
        this.drawCatFromState(state, true);
        this.drawScore(state);
        this.drawGameOver(state);
        break;

      case GamePhase.Leaderboard:
        this.drawBackground(state);
        this.drawGround(state);
        this.drawLeaderboardScreen(state);
        break;

      case GamePhase.MultiLobby:
        this.drawBackground(state);
        this.drawGround(state);
        this.drawMultiLobby(state);
        break;

      case GamePhase.MultiCountdown:
        this.drawBackground(state);
        this.drawGround(state);
        this.drawCatFromState(state, false);
        this.drawMultiCountdown(state);
        break;

      case GamePhase.MultiPlaying:
        this.drawBackground(state);
        this.drawGround(state);
        this.drawObstacles(state);
        this.drawParticles(state);
        this.drawGhostCats(state);
        this.drawCatFromState(state, !state.multi?.selfAlive);
        this.drawLeaderboard(state);
        break;

      case GamePhase.MultiSpectating:
        this.drawBackground(state);
        this.drawGround(state);
        this.drawObstacles(state);
        this.drawGhostCats(state);
        this.drawCatFromState(state, true);
        this.drawSpectatingOverlay(state);
        this.drawLeaderboard(state);
        break;

      case GamePhase.MultiResult:
        this.drawBackground(state);
        this.drawGround(state);
        this.drawMultiResult(state);
        break;
    }
  }

  // ── Background ───────────────────────────────────────────

  private drawBackground(state: Readonly<GameState>): void {
    const { ctx } = this;
    const { canvasWidth: w, groundY } = state;

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

  // ── Cat Drawing ───────────────────────────────────────────

  /** Draw the player's cat from game state. */
  private drawCatFromState(state: Readonly<GameState>, isDead: boolean): void {
    const { cat, multi } = state;
    const colorIndex = multi ? multi.playerIndex : 0;
    const colors = CAT_COLORS[colorIndex] ?? CAT_COLORS[0];
    this.drawCat(cat.x, cat.y, cat.rotation, cat.width, cat.height, isDead, colors, 1.0);
  }

  /** Draw the bobbing cat on the menu. */
  private drawMenuCat(state: Readonly<GameState>): void {
    const { cat } = state;
    const bob = Math.sin(this.frameCount * 0.05) * 12;
    this.drawCat(
      cat.x,
      state.canvasHeight * 0.42 + bob,
      0,
      cat.width,
      cat.height,
      false,
      CAT_COLORS[0],
      1.0
    );
  }

  /** Draw ghost cats for all opponents in multiplayer. */
  private drawGhostCats(state: Readonly<GameState>): void {
    const multi = state.multi;
    if (!multi) return;

    for (const opp of multi.opponents) {
      const colors = CAT_COLORS[opp.playerIndex % CAT_COLORS.length];
      const alpha = opp.alive ? 0.4 : 0.25;
      this.drawCat(
        state.cat.x, // same x position as player
        opp.displayY,
        0,
        state.cat.width,
        state.cat.height,
        !opp.alive,
        colors,
        alpha
      );
    }
  }

  /** Core procedural cat drawing with parameterized colors and alpha. */
  private drawCat(
    x: number,
    y: number,
    rotation: number,
    bw: number,
    bh: number,
    isDead: boolean,
    colors: CatColorPalette,
    alpha: number
  ): void {
    const { ctx } = this;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(rotation);

    // Tail — bezier curve behind the body
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    const tailWag = Math.sin(this.frameCount * 0.15) * 5;
    ctx.moveTo(-bw / 2, 0);
    ctx.quadraticCurveTo(-bw / 2 - 12, -15 + tailWag, -bw / 2 - 8, -25 + tailWag);
    ctx.stroke();

    // Body — ellipse
    ctx.fillStyle = colors.body;
    ctx.beginPath();
    ctx.ellipse(0, 0, bw / 2, bh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Front paws
    ctx.fillStyle = colors.paw;
    ctx.beginPath();
    ctx.ellipse(bw / 4, bh / 2 - 2, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(bw / 4 + 8, bh / 2 - 2, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head — CalvinCat image (or fallback circle)
    const headX = bw / 2 - 4;
    const headY = -4;
    const headR = 13;

    if (this.headImg) {
      const drawR = headR * 2.5;
      const imgSize = drawR * 2.5;
      ctx.save();
      // Circular clip for the head
      ctx.beginPath();
      ctx.arc(headX, headY, drawR, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        this.headImg,
        headX - imgSize / 2,
        headY - imgSize / 2,
        imgSize,
        imgSize
      );
      ctx.restore();

      // X eyes when dead
      if (isDead) {
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        const eyeOffsets = [-5, 5];
        for (const ox of eyeOffsets) {
          const ex = headX + ox;
          const ey = headY - 2;
          ctx.beginPath();
          ctx.moveTo(ex - 3, ey - 3);
          ctx.lineTo(ex + 3, ey + 3);
          ctx.moveTo(ex + 3, ey - 3);
          ctx.lineTo(ex - 3, ey + 3);
          ctx.stroke();
        }
      }
    } else {
      // Fallback: procedural head
      ctx.fillStyle = colors.body;
      ctx.beginPath();
      ctx.arc(headX, headY, headR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Ears — outer
      ctx.fillStyle = colors.accent;
      this.drawTriangle(headX - 8, headY - headR + 1, headX - 13, headY - headR - 10, headX - 3, headY - headR - 8);
      this.drawTriangle(headX + 8, headY - headR + 1, headX + 3, headY - headR - 10, headX + 13, headY - headR - 8);

      // Ears — inner (pink)
      ctx.fillStyle = "#FFB6C1";
      this.drawTriangle(headX - 7, headY - headR + 1, headX - 11, headY - headR - 7, headX - 4, headY - headR - 6);
      this.drawTriangle(headX + 7, headY - headR + 1, headX + 4, headY - headR - 7, headX + 11, headY - headR - 6);

      // Eyes
      if (isDead) {
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        const eyeOffsets = [-5, 5];
        for (const ox of eyeOffsets) {
          const ex = headX + ox;
          const ey = headY - 2;
          ctx.beginPath();
          ctx.moveTo(ex - 3, ey - 3);
          ctx.lineTo(ex + 3, ey + 3);
          ctx.moveTo(ex + 3, ey - 3);
          ctx.lineTo(ex - 3, ey + 3);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(headX - 5, headY - 2, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(headX + 5, headY - 2, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#333";
        ctx.beginPath();
        ctx.arc(headX - 4, headY - 2, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(headX + 6, headY - 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Nose
      ctx.fillStyle = "#FFB6C1";
      this.drawTriangle(headX, headY + 3, headX - 2.5, headY + 1, headX + 2.5, headY + 1);

      // Whiskers
      ctx.strokeStyle = "#666";
      ctx.lineWidth = 0.8;
      for (const side of [-1, 1]) {
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(headX + side * 4, headY + 4);
          ctx.lineTo(headX + side * 18, headY + 2 + i * 4);
          ctx.stroke();
        }
      }
    }

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

  // ── Leaderboard (Multiplayer HUD) ────────────────────────

  private drawLeaderboard(state: Readonly<GameState>): void {
    const { ctx } = this;
    const multi = state.multi;
    if (!multi) return;

    // Build sorted list of all players
    const entries: { name: string; score: number; colorIndex: number; alive: boolean }[] = [];
    entries.push({
      name: multi.playerName,
      score: state.score,
      colorIndex: multi.playerIndex,
      alive: multi.selfAlive,
    });
    for (const opp of multi.opponents) {
      entries.push({
        name: opp.name,
        score: opp.score,
        colorIndex: opp.playerIndex,
        alive: opp.alive,
      });
    }
    entries.sort((a, b) => b.score - a.score);

    ctx.save();
    const x = 10;
    let y = 14;
    const lineHeight = 18;

    for (const entry of entries) {
      const colors = CAT_COLORS[entry.colorIndex % CAT_COLORS.length];

      // Color dot
      ctx.fillStyle = colors.body;
      ctx.beginPath();
      ctx.arc(x + 5, y + 6, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Name + score
      ctx.font = "500 12px system-ui";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = entry.alive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)";
      ctx.fillText(`${entry.name}: ${entry.score}`, x + 14, y);

      y += lineHeight;
    }

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
      ctx.fillText(`Best: ${highScore}`, cx, h * 0.67);
      ctx.restore();
    }

    // "Leaderboard" button
    this.drawButton(
      cx,
      h * LB_BUTTON_Y_FRAC,
      LB_BUTTON_W,
      LB_BUTTON_H,
      "Leaderboard",
      "#5B8C5A",
      "white"
    );

    // "Multiplayer" button
    this.drawButton(
      cx,
      h * MULTI_BUTTON_Y_FRAC,
      MULTI_BUTTON_W,
      MULTI_BUTTON_H,
      "Multiplayer",
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

    // Global rank
    if (state.lastRank) {
      const { daily, weekly, alltime } = state.lastRank;
      // Show the most impressive rank
      let label: string;
      if (daily <= weekly && daily <= alltime) {
        label = `#${daily} Today`;
      } else if (weekly <= alltime) {
        label = `#${weekly} This Week`;
      } else {
        label = `#${alltime} All Time`;
      }
      ctx.font = "600 16px system-ui";
      ctx.fillStyle = "#FFD700";
      ctx.fillText(label, cx, h * 0.58);
    }

    const pulse = 0.5 + 0.5 * Math.sin(this.frameCount * 0.06);
    ctx.globalAlpha = pulse;
    ctx.font = "600 18px system-ui";
    ctx.fillStyle = "white";
    ctx.fillText("Tap to Restart", cx, h * 0.68);

    ctx.restore();
  }

  // ── Leaderboard Screen ──────────────────────────────────

  private drawLeaderboardScreen(state: Readonly<GameState>): void {
    const { ctx } = this;
    const { canvasWidth: w, canvasHeight: h, leaderboard } = state;
    const cx = w / 2;

    // Semi-dark overlay
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, w, h);

    // Title
    ctx.font = "bold 30px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeText("Leaderboard", cx, h * 0.07);
    ctx.fillStyle = "white";
    ctx.fillText("Leaderboard", cx, h * 0.07);

    // Tab buttons
    const tabY = h * LB_TAB_Y_FRAC;
    const totalTabW = LB_TABS.length * LB_TAB_W + (LB_TABS.length - 1) * LB_TAB_GAP;
    const tabStartX = cx - totalTabW / 2;

    for (let i = 0; i < LB_TABS.length; i++) {
      const period = LB_TABS[i];
      const tabX = tabStartX + i * (LB_TAB_W + LB_TAB_GAP) + LB_TAB_W / 2;
      const isActive = leaderboard.period === period;
      const label = period === "alltime" ? "All Time" : period.charAt(0).toUpperCase() + period.slice(1);

      if (isActive) {
        this.drawButton(tabX, tabY, LB_TAB_W, LB_TAB_H, label, "#5B8C5A", "white");
      } else {
        // Outline style for inactive tabs
        ctx.beginPath();
        this.roundRect(tabX - LB_TAB_W / 2, tabY - LB_TAB_H / 2, LB_TAB_W, LB_TAB_H, 6);
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = "500 13px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fillText(label, tabX, tabY);
      }
    }

    // Loading state
    if (leaderboard.loading) {
      ctx.font = "500 16px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      const dots = ".".repeat((Math.floor(this.frameCount / 30) % 3) + 1);
      ctx.fillText(`Loading${dots}`, cx, h * 0.45);
      ctx.restore();
      return;
    }

    // Empty state
    if (leaderboard.entries.length === 0) {
      ctx.font = "500 16px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText("No scores yet", cx, h * 0.45);

      // Back prompt
      const pulse = 0.5 + 0.5 * Math.sin(this.frameCount * 0.06);
      ctx.globalAlpha = pulse;
      ctx.font = "500 14px system-ui";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText("Tap to close", cx, h * 0.92);
      ctx.restore();
      return;
    }

    // Score rows
    const startY = h * 0.22;
    const rowHeight = 28;
    const maxVisible = Math.min(leaderboard.entries.length, Math.floor((h * 0.65) / rowHeight));

    for (let i = 0; i < maxVisible; i++) {
      const entry = leaderboard.entries[i];
      const y = startY + i * rowHeight;

      // Rank number
      ctx.font = "bold 14px system-ui";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : "rgba(255,255,255,0.6)";
      ctx.fillText(`#${i + 1}`, cx - 80, y);

      // Crown for #1
      if (i === 0) {
        this.drawCrown(cx - 98, y);
      }

      // Name
      ctx.font = "500 14px system-ui";
      ctx.textAlign = "left";
      ctx.fillStyle = i < 3 ? "white" : "rgba(255,255,255,0.7)";
      ctx.fillText(entry.name, cx - 68, y);

      // Score
      ctx.textAlign = "right";
      ctx.fillText(String(entry.score), cx + 95, y);
    }

    // Back prompt
    const pulse = 0.5 + 0.5 * Math.sin(this.frameCount * 0.06);
    ctx.globalAlpha = pulse;
    ctx.font = "500 14px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("Tap to close", cx, h * 0.92);

    ctx.restore();
  }

  // ── Multiplayer: Lobby ───────────────────────────────────

  private drawMultiLobby(state: Readonly<GameState>): void {
    const { ctx } = this;
    const { canvasWidth: w, canvasHeight: h, multi } = state;
    if (!multi) return;
    const cx = w / 2;

    // Title
    ctx.save();
    ctx.font = "bold 32px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeText("Multiplayer", cx, h * 0.1);
    ctx.fillStyle = "#E8941A";
    ctx.fillText("Multiplayer", cx, h * 0.1);
    ctx.restore();

    // Error state
    if (multi.error) {
      ctx.save();
      ctx.font = "500 16px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#FF6B6B";
      ctx.fillText(multi.error, cx, h * 0.4);
      ctx.font = "500 14px system-ui";
      ctx.fillStyle = "#666";
      ctx.fillText("Tap to return to menu", cx, h * 0.5);
      ctx.restore();
      return;
    }

    // Room code (big and prominent)
    if (multi.roomId) {
      ctx.save();
      ctx.font = "bold 48px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#333";
      ctx.fillText(multi.roomId, cx, h * 0.22);
      ctx.restore();

      // "Copy Link" button
      this.drawButton(
        cx,
        h * COPY_LINK_BUTTON_Y_FRAC,
        COPY_LINK_BUTTON_W,
        COPY_LINK_BUTTON_H,
        "Copy Link",
        "#4CAF50",
        "white"
      );
    }

    // Player list with cat colors
    const connectedPlayers = multi.players.filter((p) => p.connected);
    const startY = h * 0.38;
    const rowHeight = 32;

    for (let i = 0; i < connectedPlayers.length; i++) {
      const p = connectedPlayers[i];
      const colors = CAT_COLORS[p.index % CAT_COLORS.length];
      const y = startY + i * rowHeight;

      // Color dot
      ctx.save();
      ctx.fillStyle = colors.body;
      ctx.beginPath();
      ctx.arc(cx - 70, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Player name
      ctx.font = "500 16px system-ui";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#333";
      const label = p.index === multi.playerIndex ? `${p.name} (you)` : p.name;
      ctx.fillText(label, cx - 54, y);

      // Host badge
      if (p.index === 0) {
        ctx.font = "500 11px system-ui";
        ctx.fillStyle = "#E8941A";
        ctx.fillText("HOST", cx + 60, y);
      }

      ctx.restore();
    }

    // Bottom area: start button or waiting message
    const bottomY = h * 0.85;
    if (multi.isHost) {
      if (connectedPlayers.length >= 2) {
        this.drawButton(cx, bottomY, 140, 38, "Start", "#4CAF50", "white");
      } else {
        ctx.save();
        ctx.font = "500 14px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#888";
        const dots = ".".repeat((Math.floor(this.frameCount / 30) % 3) + 1);
        ctx.fillText(`Waiting for players${dots}`, cx, bottomY);
        ctx.restore();
      }
    } else {
      ctx.save();
      ctx.font = "500 14px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#888";
      const dots = ".".repeat((Math.floor(this.frameCount / 30) % 3) + 1);
      ctx.fillText(`Waiting for host to start${dots}`, cx, bottomY);
      ctx.restore();
    }
  }

  // ── Multiplayer: Countdown ───────────────────────────────

  private drawMultiCountdown(state: Readonly<GameState>): void {
    const { ctx } = this;
    const { canvasWidth: w, canvasHeight: h, multi } = state;
    if (!multi) return;

    const num = Math.ceil(multi.countdown);
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

  // ── Multiplayer: Spectating Overlay ──────────────────────

  private drawSpectatingOverlay(state: Readonly<GameState>): void {
    const { ctx } = this;
    const { canvasWidth: w, canvasHeight: h, multi } = state;
    if (!multi) return;

    // Light dark overlay
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.fillRect(0, 0, w, h);

    // Placement text
    const aliveCount = multi.opponents.filter((o) => o.alive).length;
    const totalPlayers = multi.opponents.length + 1;
    const placement = totalPlayers - multi.deathOrder.length + aliveCount;

    ctx.font = "600 24px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    const text = `#${placement} — Score: ${state.score}`;
    ctx.strokeText(text, w / 2, h * 0.45);
    ctx.fillStyle = "white";
    ctx.fillText(text, w / 2, h * 0.45);

    ctx.font = "500 14px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("Spectating...", w / 2, h * 0.52);

    ctx.restore();
  }

  // ── Multiplayer: Results ─────────────────────────────────

  private drawMultiResult(state: Readonly<GameState>): void {
    const { ctx } = this;
    const { canvasWidth: w, canvasHeight: h, multi } = state;
    if (!multi) return;
    const cx = w / 2;

    ctx.save();

    // Dark overlay
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, w, h);

    // Title
    ctx.font = "bold 32px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeText("Results", cx, h * 0.12);
    ctx.fillStyle = "white";
    ctx.fillText("Results", cx, h * 0.12);

    // Error message
    if (multi.error) {
      ctx.font = "500 14px system-ui";
      ctx.fillStyle = "#FF6B6B";
      ctx.fillText(multi.error, cx, h * 0.2);
    }

    // Build ranked list (highest score first)
    const entries: { name: string; score: number; colorIndex: number }[] = [];
    entries.push({
      name: multi.playerName,
      score: state.score,
      colorIndex: multi.playerIndex,
    });
    for (const opp of multi.opponents) {
      entries.push({
        name: opp.name,
        score: opp.score,
        colorIndex: opp.playerIndex,
      });
    }
    entries.sort((a, b) => b.score - a.score);

    const startY = h * 0.25;
    const rowHeight = 36;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const y = startY + i * rowHeight;
      const colors = CAT_COLORS[entry.colorIndex % CAT_COLORS.length];
      const isPlayer = entry.colorIndex === multi.playerIndex;

      // Placement number
      ctx.font = "bold 18px system-ui";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = i === 0 ? "#FFD700" : "rgba(255,255,255,0.7)";
      ctx.fillText(`#${i + 1}`, cx - 80, y);

      // Color dot
      ctx.fillStyle = colors.body;
      ctx.beginPath();
      ctx.arc(cx - 62, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Name
      ctx.font = isPlayer ? "bold 15px system-ui" : "500 15px system-ui";
      ctx.textAlign = "left";
      ctx.fillStyle = isPlayer ? "white" : "rgba(255,255,255,0.7)";
      ctx.fillText(entry.name, cx - 48, y);

      // Score
      ctx.textAlign = "right";
      ctx.fillText(String(entry.score), cx + 90, y);

      // Crown for #1
      if (i === 0) {
        this.drawCrown(cx - 62, y - 18);
      }
    }

    // Bottom: restart or exit
    const bottomY = h * 0.88;
    if (multi.isHost && !multi.error) {
      this.drawButton(cx, bottomY, 160, 38, "Play Again", "#4CAF50", "white");
    } else if (multi.error) {
      const pulse = 0.5 + 0.5 * Math.sin(this.frameCount * 0.06);
      ctx.globalAlpha = pulse;
      ctx.font = "600 18px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "white";
      ctx.fillText("Tap to Exit", cx, bottomY);
    } else {
      ctx.font = "500 14px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#888";
      const dots = ".".repeat((Math.floor(this.frameCount / 30) % 3) + 1);
      ctx.fillText(`Waiting for host${dots}`, cx, bottomY);
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
    ctx.moveTo(x - 8, y + 2);
    ctx.lineTo(x - 6, y - 5);
    ctx.lineTo(x - 3, y - 1);
    ctx.lineTo(x, y - 8);
    ctx.lineTo(x + 3, y - 1);
    ctx.lineTo(x + 6, y - 5);
    ctx.lineTo(x + 8, y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

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
