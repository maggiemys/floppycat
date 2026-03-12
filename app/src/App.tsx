import { useState, useEffect, useLayoutEffect } from "react";

export default function App() {
  const [config, setConfig] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetch("/config.csv")
      .then((r) => r.text())
      .then((text) => {
        const lines = text.trim().split("\n").slice(1);
        const map = new Map<string, string>();
        for (const line of lines) {
          const [key, ...rest] = line.split(",");
          map.set(key.trim(), rest.join(",").trim());
        }
        setConfig(map);
      });
  }, []);

  // ── Viewport management ──────────────────────────────────
  // Keeps --app-height, --game-height, --game-width in sync with the
  // real visible area. Handles mobile URL bar show/hide, keyboard popup,
  // orientation changes, and pinch zoom — all the things that make
  // mobile viewport sizing unreliable with pure CSS.
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

  return (
    <div className="app-shell relative mx-auto flex w-full flex-col overflow-hidden">
      <div className="game-screen flex flex-col items-center justify-center gap-6">
        {/* Replace with your logo: drop an image in data/sprites/logo.png */}
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
          <span className="text-white text-4xl font-bold">?</span>
        </div>
        <h1 className="text-2xl font-bold ink-strong">
          {config.get("app_name") || "Loading..."}
        </h1>
        <p className="text-sm ink-soft">v0.1.0</p>
        <button className="ui-cta mt-4">Start</button>
      </div>
    </div>
  );
}
