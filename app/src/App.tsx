import { useState, useEffect, useLayoutEffect } from "react";
import { loadConfig } from "@/data/loadData";
import GameCanvas from "@/components/GameCanvas";
import { GameConfig } from "@/engine/types";

const DEFAULT_WS_URL = "wss://floppycat.onrender.com";
const WS_URL = import.meta.env.VITE_WS_URL ?? DEFAULT_WS_URL;

/** Parse the flat config map from CSV into a typed GameConfig. */
function parseGameConfig(configMap: Map<string, string>): GameConfig {
  const num = (key: string, fallback: number): number => {
    const val = configMap.get(key);
    return val !== undefined ? parseFloat(val) : fallback;
  };
  return {
    gravity: num("gravity", 1200),
    jumpVelocity: num("jump_velocity", -420),
    scrollSpeed: num("scroll_speed", 150),
    pipeWidth: num("pipe_width", 52),
    pipeGapHeight: num("pipe_gap_height", 150),
    pipeSpacing: num("pipe_spacing", 220),
    minGapHeight: num("min_gap_height", 100),
    difficultyInterval: num("difficulty_interval", 10),
    gapShrinkPerStep: num("gap_shrink_per_step", 5),
    speedIncreasePerStep: num("speed_increase_per_step", 10),
    catWidth: num("cat_width", 40),
    catHeight: num("cat_height", 30),
    catX: num("cat_x", 0.2),
    groundHeight: num("ground_height", 60),
    maxVelocity: num("max_velocity", 600),
    rotationFactor: num("rotation_factor", 0.002),
    pvpResultTimeout: num("pvp_result_timeout", 10),
    pvpCountdownSeconds: num("pvp_countdown_seconds", 3),
  };
}

/** Extract ?room= parameter from URL. */
function getPvpRoomId(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("room");
}

export default function App() {
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [pvpRoomId] = useState<string | null>(() => getPvpRoomId());

  useEffect(() => {
    loadConfig().then((map) => setGameConfig(parseGameConfig(map)));
  }, []);

  // ── Viewport management ──────────────────────────────────
  useLayoutEffect(() => {
    const root = document.documentElement;
    let rafId = 0;
    const update = () => {
      const vv = window.visualViewport;
      const w = vv?.width ?? window.innerWidth;
      const h = vv?.height ?? window.innerHeight;
      const maxW = parseFloat(getComputedStyle(root).getPropertyValue("--app-max-width")) || 400;
      const maxH = parseFloat(getComputedStyle(root).getPropertyValue("--app-max-height")) || 800;
      root.style.setProperty("--app-height", `${Math.round(h)}px`);
      root.style.setProperty("--game-width", `${Math.round(Math.min(w, maxW))}px`);
      root.style.setProperty("--game-height", `${Math.min(Math.round(h), maxH)}px`);
    };
    const schedule = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => { rafId = 0; update(); });
    };
    update();
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, []);

  if (!gameConfig) {
    return (
      <div className="app-shell relative mx-auto flex w-full flex-col overflow-hidden">
        <div className="game-screen flex flex-col items-center justify-center">
          <p className="ink-soft">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell relative mx-auto flex w-full flex-col overflow-hidden">
      <div className="game-screen">
        <GameCanvas config={gameConfig} wsUrl={WS_URL} pvpRoomId={pvpRoomId} />
      </div>
    </div>
  );
}
