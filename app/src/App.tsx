import { useState, useEffect, useLayoutEffect, useCallback } from "react";
import { loadConfig } from "@/data/loadData";
import GameCanvas from "@/components/GameCanvas";
import { GameConfig } from "@/engine/types";
import { NetworkClient } from "@/engine/networkClient";
import { MultiplayerSetup } from "@/engine/GameController";

const DEFAULT_WS_URL = "wss://floppycat.onrender.com";
const WS_URL = import.meta.env.VITE_WS_URL ?? DEFAULT_WS_URL;
const API_URL =
  import.meta.env.VITE_API_URL ??
  WS_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
const NAME_KEY = "floppycat_name";

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
    countdownSeconds: num("countdown_seconds", 3),
    multiMaxPlayers: num("multi_max_players", 10),
    multiLastAliveTimeout: num("multi_last_alive_timeout", 10),
  };
}

type SetupStep = "name" | "choice" | "join" | "connecting";

export default function App() {
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [multiSetup, setMultiSetup] = useState<MultiplayerSetup | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [setupStep, setSetupStep] = useState<SetupStep>("name");
  const [playerName, setPlayerName] = useState(() => localStorage.getItem(NAME_KEY) ?? "");
  const [roomCode, setRoomCode] = useState("");
  const [setupError, setSetupError] = useState("");
  const [showNameEntry, setShowNameEntry] = useState(false);
  const [nameEntryDone, setNameEntryDone] = useState(0);

  useEffect(() => {
    loadConfig().then((map) => setGameConfig(parseGameConfig(map)));
  }, []);

  // Check URL for ?room= param (link join)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room && gameConfig) {
      setRoomCode(room.toUpperCase());
      setShowSetup(true);
      // If they already have a name, skip to connecting
      if (playerName.trim()) {
        setSetupStep("connecting");
        joinRoom(room.toUpperCase(), playerName.trim());
      } else {
        setSetupStep("name");
      }
      // Clear the URL param
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [gameConfig]);

  // ── Viewport management ──────────────────────────────────
  useLayoutEffect(() => {
    const root = document.documentElement;
    let rafId = 0;
    const update = () => {
      const vv = window.visualViewport;
      const w = vv?.width ?? window.innerWidth;
      const h = vv?.height ?? window.innerHeight;
      const maxW =
        parseFloat(
          getComputedStyle(root).getPropertyValue("--app-max-width")
        ) || 400;
      const maxH =
        parseFloat(
          getComputedStyle(root).getPropertyValue("--app-max-height")
        ) || 800;
      root.style.setProperty("--app-height", `${Math.round(h)}px`);
      root.style.setProperty(
        "--game-width",
        `${Math.round(Math.min(w, maxW))}px`
      );
      root.style.setProperty(
        "--game-height",
        `${Math.min(Math.round(h), maxH)}px`
      );
    };
    const schedule = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        update();
      });
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

  // ── Multiplayer setup flow ───────────────────────────────

  const handleRequestMultiSetup = useCallback(() => {
    setSetupError("");
    setRoomCode("");
    setShowSetup(true);
    setSetupStep(playerName.trim() ? "choice" : "name");
  }, [playerName]);

  const handleRequestNameEntry = useCallback(() => {
    setShowNameEntry(true);
  }, []);

  const handleNameForScore = () => {
    const name = playerName.trim();
    if (!name) return;
    localStorage.setItem(NAME_KEY, name);
    setShowNameEntry(false);
    setNameEntryDone((n) => n + 1);
  };

  const handleNameSubmit = () => {
    const name = playerName.trim();
    if (!name) return;
    localStorage.setItem(NAME_KEY, name);
    // If we came from a URL with a room code, go straight to connecting
    if (roomCode) {
      setSetupStep("connecting");
      joinRoom(roomCode, name);
    } else {
      setSetupStep("choice");
    }
  };

  const handleCreateRoom = async () => {
    const name = playerName.trim();
    if (!name) return;
    setSetupStep("connecting");
    setSetupError("");

    const client = new NetworkClient(WS_URL);
    client.onRoomCreated = (roomId, playerIndex) => {
      setShowSetup(false);
      setMultiSetup({
        client,
        playerIndex,
        playerName: name,
        roomId,
        isHost: true,
      });
    };
    client.onError = (msg) => {
      setSetupError(msg);
      setSetupStep("choice");
    };

    try {
      await client.connect();
      client.createRoom(gameConfig?.multiMaxPlayers ?? 10, name);
    } catch {
      setSetupError("Failed to connect to server");
      setSetupStep("choice");
    }
  };

  const handleJoinSubmit = () => {
    const code = roomCode.trim().toUpperCase();
    if (!code) return;
    joinRoom(code, playerName.trim());
  };

  const joinRoom = async (code: string, name: string) => {
    setSetupStep("connecting");
    setSetupError("");

    const client = new NetworkClient(WS_URL);
    client.onRoomJoined = (data) => {
      setShowSetup(false);
      setMultiSetup({
        client,
        playerIndex: data.playerIndex,
        playerName: name,
        roomId: data.room,
        isHost: false,
        existingPlayers: data.players,
        alreadyStarted: data.started,
        seed: data.seed,
        startedAt: data.startedAt,
      });
    };
    client.onError = (msg) => {
      setSetupError(msg);
      setSetupStep("join");
    };

    try {
      await client.connect();
      client.joinRoom(code, name);
    } catch {
      setSetupError("Failed to connect to server");
      setSetupStep("join");
    }
  };

  const handleBack = () => {
    if (setupStep === "join") {
      setSetupStep("choice");
      setSetupError("");
    } else if (setupStep === "choice") {
      setShowSetup(false);
    } else {
      setShowSetup(false);
    }
  };

  // ── Render ───────────────────────────────────────────────

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
        <GameCanvas
          config={gameConfig}
          apiUrl={API_URL}
          multiSetup={multiSetup}
          nameEntryDone={nameEntryDone}
          onRequestMultiSetup={handleRequestMultiSetup}
          onRequestNameEntry={handleRequestNameEntry}
        />

        {/* Name entry overlay (game over, first time) */}
        {showNameEntry && (
          <div
            className="app-screen flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.6)", zIndex: 10 }}
          >
            <div className="ui-panel" style={{ width: 300, maxWidth: "90%" }}>
              <div className="flex flex-col gap-3">
                <h2 className="ink-strong text-center text-lg font-bold">
                  Enter Your Name
                </h2>
                <p className="ink-soft text-center text-sm">
                  Save your score to the leaderboard
                </p>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleNameForScore()}
                  placeholder="Your name"
                  maxLength={16}
                  className="rounded-lg border px-3 py-2 text-center text-lg"
                  style={{
                    borderColor: "var(--border)",
                    background: "white",
                    color: "var(--text)",
                  }}
                  autoFocus
                />
                <button className="ui-cta" onClick={handleNameForScore}>
                  Save Score
                </button>
                <button
                  className="ui-button"
                  onClick={() => setShowNameEntry(false)}
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Multiplayer setup overlay */}
        {showSetup && (
          <div
            className="app-screen flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.6)", zIndex: 10 }}
          >
            <div className="ui-panel" style={{ width: 300, maxWidth: "90%" }}>
              {setupStep === "name" && (
                <div className="flex flex-col gap-3">
                  <h2 className="ink-strong text-center text-lg font-bold">
                    Enter Your Name
                  </h2>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
                    placeholder="Your name"
                    maxLength={16}
                    className="rounded-lg border px-3 py-2 text-center text-lg"
                    style={{
                      borderColor: "var(--border)",
                      background: "white",
                      color: "var(--text)",
                    }}
                    autoFocus
                  />
                  <button className="ui-cta" onClick={handleNameSubmit}>
                    Continue
                  </button>
                  <button className="ui-button" onClick={handleBack}>
                    Cancel
                  </button>
                </div>
              )}

              {setupStep === "choice" && (
                <div className="flex flex-col gap-3">
                  <h2 className="ink-strong text-center text-lg font-bold">
                    Multiplayer
                  </h2>
                  <p className="ink-soft text-center text-sm">
                    Playing as {playerName}
                  </p>
                  {setupError && (
                    <p className="text-center text-sm" style={{ color: "#FF6B6B" }}>
                      {setupError}
                    </p>
                  )}
                  <button className="ui-cta" onClick={handleCreateRoom}>
                    Create Room
                  </button>
                  <button
                    className="ui-button"
                    onClick={() => {
                      setSetupStep("join");
                      setSetupError("");
                    }}
                  >
                    Join Room
                  </button>
                  <button className="ui-button" onClick={handleBack}>
                    Back
                  </button>
                </div>
              )}

              {setupStep === "join" && (
                <div className="flex flex-col gap-3">
                  <h2 className="ink-strong text-center text-lg font-bold">
                    Enter Room Code
                  </h2>
                  {setupError && (
                    <p className="text-center text-sm" style={{ color: "#FF6B6B" }}>
                      {setupError}
                    </p>
                  )}
                  <input
                    type="text"
                    value={roomCode}
                    onChange={(e) =>
                      setRoomCode(e.target.value.toUpperCase().slice(0, 6))
                    }
                    onKeyDown={(e) => e.key === "Enter" && handleJoinSubmit()}
                    placeholder="ABC123"
                    maxLength={6}
                    className="rounded-lg border px-3 py-2 text-center text-2xl font-mono tracking-widest"
                    style={{
                      borderColor: "var(--border)",
                      background: "white",
                      color: "var(--text)",
                    }}
                    autoFocus
                  />
                  <button className="ui-cta" onClick={handleJoinSubmit}>
                    Join
                  </button>
                  <button className="ui-button" onClick={handleBack}>
                    Back
                  </button>
                </div>
              )}

              {setupStep === "connecting" && (
                <div className="flex flex-col gap-3 items-center">
                  <h2 className="ink-strong text-lg font-bold">
                    Connecting...
                  </h2>
                  <p className="ink-soft text-sm">
                    Setting up your room
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
