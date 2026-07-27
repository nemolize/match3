import "./performance.css";

import { MotionConfig } from "motion/react";
import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";

import type { ParticleWorkloadSnapshot } from "@/components/BreakingGemsLayer";
import { GameBoard } from "@/components/GameBoard";
import { TIMING_CONFIG } from "@/config/timing";
import { BOARD_SIZE, GEM_TYPES } from "@/constants/game";
import type { Gem, Match } from "@/types/game";

const createBoard = (): Gem[][] =>
  Array.from({ length: BOARD_SIZE }, (_, row) =>
    Array.from({ length: BOARD_SIZE }, (_, col) => ({
      id: `gem-${row}-${col}`,
      type: GEM_TYPES[(row * 3 + col) % GEM_TYPES.length] ?? "red",
      position: { row, col },
    })),
  );

const PERFORMANCE_BOARD = createBoard();
const START_BUSY =
  new URLSearchParams(window.location.search).get("busy") === "1";
const PARTICLE_RANDOM_SEED = 0x8badf00d;

interface WorkloadTelemetrySnapshot extends ParticleWorkloadSnapshot {
  completed: boolean;
  peakBurstCount: number;
  peakParticleCount: number;
}

const workloadTelemetry: WorkloadTelemetrySnapshot & {
  hadActiveWorkload: boolean;
} = {
  burstCount: 0,
  completed: false,
  hadActiveWorkload: false,
  particleCount: 0,
  peakBurstCount: 0,
  peakParticleCount: 0,
};

const resetWorkloadTelemetry = () => {
  Object.assign(workloadTelemetry, {
    burstCount: 0,
    completed: false,
    hadActiveWorkload: false,
    particleCount: 0,
    peakBurstCount: 0,
    peakParticleCount: 0,
  });
};

const readWorkloadTelemetry = (): WorkloadTelemetrySnapshot => ({
  burstCount: workloadTelemetry.burstCount,
  completed: workloadTelemetry.completed,
  particleCount: workloadTelemetry.particleCount,
  peakBurstCount: workloadTelemetry.peakBurstCount,
  peakParticleCount: workloadTelemetry.peakParticleCount,
});

Object.assign(window, {
  __match3BenchmarkWorkload: {
    read: readWorkloadTelemetry,
    reset: resetWorkloadTelemetry,
  },
});

const createSeededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const STRESS_MATCHES: Match[] = [
  {
    positions: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ],
    type: "red",
    score: 400,
  },
  {
    positions: [
      { row: 3, col: 2 },
      { row: 3, col: 3 },
      { row: 3, col: 4 },
      { row: 3, col: 5 },
    ],
    type: "blue",
    score: 400,
  },
  {
    positions: [
      { row: 6, col: 4 },
      { row: 6, col: 5 },
      { row: 6, col: 6 },
      { row: 6, col: 7 },
    ],
    type: "green",
    score: 400,
  },
];

const PerformanceFixture = () => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [particleRandom] = useState(() =>
    createSeededRandom(PARTICLE_RANDOM_SEED),
  );
  const triggerBursts = () => {
    resetWorkloadTelemetry();
    setMatches(STRESS_MATCHES);
  };
  const handleParticleWorkloadChange = useCallback(
    ({ burstCount, particleCount }: ParticleWorkloadSnapshot) => {
      workloadTelemetry.burstCount = burstCount;
      workloadTelemetry.particleCount = particleCount;
      workloadTelemetry.peakBurstCount = Math.max(
        workloadTelemetry.peakBurstCount,
        burstCount,
      );
      workloadTelemetry.peakParticleCount = Math.max(
        workloadTelemetry.peakParticleCount,
        particleCount,
      );
      if (burstCount > 0) workloadTelemetry.hadActiveWorkload = true;
      if (workloadTelemetry.hadActiveWorkload && burstCount === 0) {
        workloadTelemetry.completed = true;
      }
    },
    [],
  );

  return (
    <MotionConfig reducedMotion="never">
      <main
        className="mx-auto w-full max-w-md p-4"
        data-testid="performance-fixture"
      >
        <button
          type="button"
          data-burst-duration-ms={TIMING_CONFIG.particleLifetime}
          data-expected-burst-count="12"
          data-expected-particle-count={12 * TIMING_CONFIG.particleCount}
          data-particle-random-seed={PARTICLE_RANDOM_SEED}
          data-testid="trigger-bursts"
          onClick={triggerBursts}
        >
          Trigger 12 bursts
        </button>
        <GameBoard
          board={PERFORMANCE_BOARD}
          matches={matches}
          selectedGem={null}
          animationPhase="idle"
          onSwipe={() => {}}
          onGemTap={() => {}}
          isAnimating={START_BUSY || matches.length > 0}
          onParticleWorkloadChange={handleParticleWorkloadChange}
          particleRandom={particleRandom}
        />
      </main>
    </MotionConfig>
  );
};

const root = document.getElementById("root");
if (!root) throw new Error("Failed to find fixture root");
createRoot(root).render(<PerformanceFixture />);
