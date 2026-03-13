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
  apiUrl: string;
  multiSetup: MultiplayerSetup | null;
  nameEntryDone: number;
  onRequestMultiSetup: () => void;
  onRequestNameEntry: () => void;
}

export default function GameCanvas({
  config,
  apiUrl,
  multiSetup,
  nameEntryDone,
  onRequestMultiSetup,
  onRequestNameEntry,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<GameController | null>(null);

  // Create and destroy the Controller with the component lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const controller = new GameController(canvas, config, apiUrl);
    controllerRef.current = controller;
    controller.onRequestMultiSetup = onRequestMultiSetup;
    controller.onRequestNameEntry = onRequestNameEntry;
    controller.start();

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [config, apiUrl]);

  // Update callback refs when they change
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.onRequestMultiSetup = onRequestMultiSetup;
      controllerRef.current.onRequestNameEntry = onRequestNameEntry;
    }
  }, [onRequestMultiSetup, onRequestNameEntry]);

  // When multiplayer setup completes, tell the Controller
  useEffect(() => {
    if (multiSetup && controllerRef.current) {
      controllerRef.current.startMultiplayer(multiSetup);
    }
  }, [multiSetup]);

  // When name entry completes, tell the Controller to submit the pending score
  useEffect(() => {
    if (nameEntryDone > 0 && controllerRef.current) {
      controllerRef.current.completeNameEntry();
    }
  }, [nameEntryDone]);

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
