/**
 * GameCanvas — React bridge to the MVC game engine.
 *
 * This component owns the <canvas> DOM element and manages the
 * GameController lifecycle. It is the ONLY point of contact
 * between React and the imperative canvas game engine.
 */

import { useRef, useEffect } from "react";
import { GameController, MultiplayerSetup } from "@/engine/GameController";
import { GameConfig } from "@/engine/types";

interface GameCanvasProps {
  config: GameConfig;
  multiSetup: MultiplayerSetup | null;
  onRequestMultiSetup: () => void;
}

export default function GameCanvas({ config, multiSetup, onRequestMultiSetup }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<GameController | null>(null);

  // Create and destroy the Controller with the component lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const controller = new GameController(canvas, config);
    controllerRef.current = controller;
    controller.onRequestMultiSetup = onRequestMultiSetup;
    controller.start();

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [config]);

  // Update callback ref when it changes
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.onRequestMultiSetup = onRequestMultiSetup;
    }
  }, [onRequestMultiSetup]);

  // When multiplayer setup completes, tell the Controller
  useEffect(() => {
    if (multiSetup && controllerRef.current) {
      controllerRef.current.startMultiplayer(multiSetup);
    }
  }, [multiSetup]);

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
