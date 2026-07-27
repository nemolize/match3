import { useReducedMotion } from "motion/react";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

import { createBoardRenderer } from "@/rendering/webgpu/createBoardRenderer";
import { createBoardLayout } from "@/rendering/webgpu/layout";
import type {
  BoardRenderer,
  BoardRendererStatus,
  BoardSceneUpdate,
} from "@/rendering/webgpu/types";
import type { AnimationPhase, Gem, Match, Position } from "@/types/game";
import type { ParticleWorkloadSnapshot } from "@/types/performance";

const MAX_DEVICE_PIXEL_RATIO = 2;

interface WebGpuBoardCanvasProps {
  animationPhase: AnimationPhase;
  board: readonly (readonly (Gem | null)[])[];
  boardRef: RefObject<HTMLDivElement | null>;
  matches: readonly Match[];
  onParticleWorkloadChange?: (snapshot: ParticleWorkloadSnapshot) => void;
  onStatusChange?: (status: BoardRendererStatus) => void;
  particleRandom?: () => number;
  selectedGem: Position | null;
}

export const WebGpuBoardCanvas = ({
  animationPhase,
  board,
  boardRef,
  matches,
  onParticleWorkloadChange,
  onStatusChange,
  particleRandom,
  selectedGem,
}: WebGpuBoardCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<BoardRenderer | null>(null);
  const sceneRef = useRef<BoardSceneUpdate | null>(null);
  const callbacksRef = useRef({
    onParticleWorkloadChange,
    onStatusChange,
  });
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [status, setStatus] = useState<BoardRendererStatus>({
    state: "initializing",
  });

  useEffect(() => {
    callbacksRef.current = { onParticleWorkloadChange, onStatusChange };
  });

  useEffect(() => {
    const scene: BoardSceneUpdate = {
      animationPhase,
      board,
      matches,
      particleRandom,
      reducedMotion: shouldReduceMotion,
      selectedGem,
    };
    sceneRef.current = scene;
    rendererRef.current?.updateScene(scene);
  }, [
    animationPhase,
    board,
    matches,
    particleRandom,
    selectedGem,
    shouldReduceMotion,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const boardElement = boardRef.current;
    if (!canvas || !boardElement) return;
    const host = canvas.offsetParent;
    if (!(host instanceof HTMLElement)) {
      const nextStatus: BoardRendererStatus = {
        state: "unavailable",
        message: "The board render surface could not be measured.",
      };
      setStatus(nextStatus);
      callbacksRef.current.onStatusChange?.(nextStatus);
      return;
    }

    let cancelled = false;
    let renderer: BoardRenderer | null = null;
    const updateStatus = (nextStatus: BoardRendererStatus) => {
      if (cancelled) return;
      setStatus(nextStatus);
      callbacksRef.current.onStatusChange?.(nextStatus);
    };
    const resize = () => {
      if (!renderer) return;
      const gap = Number.parseFloat(getComputedStyle(boardElement).columnGap);
      const boardSize = boardElement.clientWidth;
      if (
        host.clientWidth <= 0 ||
        host.clientHeight <= 0 ||
        boardSize <= 0 ||
        !Number.isFinite(gap)
      ) {
        return;
      }
      const layout = createBoardLayout({
        canvasHeight: host.clientHeight,
        canvasWidth: host.clientWidth,
        boardSize,
        boardX: boardElement.offsetLeft,
        boardY: boardElement.offsetTop,
        devicePixelRatio: Math.min(
          window.devicePixelRatio || 1,
          MAX_DEVICE_PIXEL_RATIO,
        ),
        gap,
      });
      if (layout.cellSize <= 0) return;
      renderer.resize(layout);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    observer.observe(boardElement);
    window.addEventListener("resize", resize);

    void createBoardRenderer(canvas, {
      onStatusChange: updateStatus,
      onWorkloadChange: (snapshot) => {
        callbacksRef.current.onParticleWorkloadChange?.(snapshot);
      },
    }).then((createdRenderer) => {
      if (cancelled) {
        createdRenderer?.dispose();
        return;
      }
      renderer = createdRenderer;
      rendererRef.current = createdRenderer;
      if (!createdRenderer) return;
      resize();
      if (sceneRef.current) createdRenderer.updateScene(sceneRef.current);
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener("resize", resize);
      rendererRef.current = null;
      renderer?.dispose();
    };
  }, [boardRef]);

  const diagnostic =
    status.state === "unavailable" || status.state === "lost"
      ? status.message
      : null;

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full rounded-2xl bg-[#1494bf]"
        data-renderer="webgpu"
        data-renderer-status={status.state}
      />
      <div aria-hidden="true" data-particle-renderer="webgpu" />
      {diagnostic !== null && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-slate-950/90 p-6 text-center text-sm text-white"
          role="alert"
        >
          {diagnostic}
        </div>
      )}
    </>
  );
};
