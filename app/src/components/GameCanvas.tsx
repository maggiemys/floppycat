/**
 * GameCanvas — React bridge to the MVC game engine.
 *
 * This component owns the <canvas> DOM element and manages the
 * GameController lifecycle. It is the ONLY point of contact
 * between React and the imperative canvas game engine.
 *
 * Responsibilities:
 *   - Mount/unmount the Controller with React's lifecycle
 *   - Keep the canvas sized correctly via ResizeObserver
 *   - Pass the data-driven GameConfig to the engine
 *   - Pass PVP connection info (wsUrl, room ID) when applicable
 */

import { useRef, useEffect } from "react";
import { GameController } from "@/engine/GameController";
import { GameConfig } from "@/engine/types";

interface GameCanvasProps {
  config: GameConfig;
  wsUrl: string;
  pvpRoomId: string | null;
}

export default function GameCanvas({ config, wsUrl, pvpRoomId }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<GameController | null>(null);

  // Create and destroy the Controller with the component lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const controller = new GameController(canvas, config, wsUrl, pvpRoomId);
    controllerRef.current = controller;
    controller.start();

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [config, wsUrl, pvpRoomId]);

  // Keep canvas sized correctly via ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (controllerRef.current) {
          controllerRef.current.resize(width, height);
        }
      }
    });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ touchAction: "none" }}
    />
  );
}
