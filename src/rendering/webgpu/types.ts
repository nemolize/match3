import type { AnimationPhase, Gem, Match, Position } from "@/types/game";
import type { ParticleWorkloadSnapshot } from "@/types/performance";

export type BoardRendererStatus =
  | { state: "initializing" }
  | { state: "ready" }
  | { state: "unavailable"; message: string }
  | { state: "lost"; message: string };

export interface BoardLayout {
  canvasHeight: number;
  canvasWidth: number;
  boardSize: number;
  boardX: number;
  boardY: number;
  cellSize: number;
  devicePixelRatio: number;
  gap: number;
}

export interface BoardSceneUpdate {
  animationPhase: AnimationPhase;
  board: readonly (readonly (Gem | null)[])[];
  matches: readonly Match[];
  particleRandom?: () => number;
  reducedMotion: boolean;
  selectedGem: Position | null;
}

export interface BoardRendererCallbacks {
  onStatusChange: (status: BoardRendererStatus) => void;
  onWorkloadChange?: (snapshot: ParticleWorkloadSnapshot) => void;
}

export interface BoardRendererEnvironment {
  cancelFrame: (handle: number) => void;
  gpu: GPU | undefined;
  now: () => number;
  requestFrame: (callback: FrameRequestCallback) => number;
}

export interface BoardRenderer {
  dispose: () => void;
  resize: (layout: BoardLayout) => void;
  updateScene: (scene: BoardSceneUpdate) => void;
}

export interface GpuTimingPass {
  durationNs: number;
  sampleCount: number;
  status?: "inactive";
}

export interface RendererGpuTimings {
  passes?: Record<string, GpuTimingPass>;
  reason?: string;
  supported: boolean;
  timestampPeriodNs?: number;
}

declare global {
  interface Window {
    __match3RendererPerformance?: {
      readGpuTimings: () => Promise<RendererGpuTimings>;
      resetGpuTimings: () => Promise<void>;
    };
  }
}
