import { TIMING_CONFIG } from "@/config/timing";
import { GEM_CELL_PADDING_PX } from "@/constants/game";
import type { GemType } from "@/types/game";

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  opacity: number;
}

const GRAVITY = 0.5;
const INITIAL_VELOCITY_RANGE = 5;
const BASE_FRAME_MS = 1000 / 60;

export interface CreateParticlesOptions {
  x: number; // Cell top-left x position in pixels
  y: number; // Cell top-left y position in pixels
  size: number; // Gem size in pixels (cell size minus padding)
  count?: number; // Number of particles to create
  random?: () => number;
}

/**
 * Creates initial particles positioned at the center of a gem,
 * accounting for cell padding.
 */
export const createParticles = ({
  x,
  y,
  size,
  count = TIMING_CONFIG.particleCount,
  random = Math.random,
}: CreateParticlesOptions): Particle[] => {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const speed = 2 + random() * INITIAL_VELOCITY_RANGE;

    return {
      id: `particle-${i}`,
      // Position at gem center: cell position + padding + half gem size
      x: x + GEM_CELL_PADDING_PX + size / 2,
      y: y + GEM_CELL_PADDING_PX + size / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2, // Slight upward bias
      rotation: random() * 360,
      rotationSpeed: (random() - 0.5) * 20,
      size: size / 4 + random() * (size / 8),
      opacity: 1,
    };
  });
};

export interface SampleParticlesOptions {
  initialParticles: readonly Readonly<Particle>[];
  elapsed: number;
  lifetime?: number;
}

interface SampleParticlesInPlaceOptions extends SampleParticlesOptions {
  particles: Particle[];
}

export const sampleParticlesAtElapsedInPlace = ({
  initialParticles,
  particles,
  elapsed,
  lifetime = TIMING_CONFIG.particleLifetime,
}: SampleParticlesInPlaceOptions): void => {
  if (particles.length !== initialParticles.length) {
    throw new Error("Particle buffers must have matching lengths");
  }

  const normalizedElapsed = Math.max(0, elapsed);
  const time = normalizedElapsed / BASE_FRAME_MS;
  const opacity = Math.max(0, 1 - normalizedElapsed / lifetime);

  for (let i = 0; i < particles.length; i += 1) {
    const initialParticle = initialParticles[i];
    const particle = particles[i];
    if (!initialParticle || !particle) continue;
    if (initialParticle === particle) {
      throw new Error("Initial particles must not share output objects");
    }

    particle.x = initialParticle.x + initialParticle.vx * time;
    particle.y =
      initialParticle.y +
      initialParticle.vy * time +
      (GRAVITY * time * time) / 2;
    particle.vx = initialParticle.vx;
    particle.vy = initialParticle.vy + GRAVITY * time;
    particle.rotation =
      initialParticle.rotation + initialParticle.rotationSpeed * time;
    particle.opacity = opacity;
  }
};

/**
 * Samples the ballistic trajectory from absolute elapsed time, independent
 * of how the interval was divided into animation frames.
 */
export const sampleParticlesAtElapsed = ({
  initialParticles,
  elapsed,
  lifetime = TIMING_CONFIG.particleLifetime,
}: SampleParticlesOptions): Particle[] => {
  const sampledParticles = initialParticles.map((particle) => ({
    ...particle,
  }));
  sampleParticlesAtElapsedInPlace({
    initialParticles,
    particles: sampledParticles,
    elapsed,
    lifetime,
  });
  return sampledParticles;
};

export const GEM_PARTICLE_COLORS: Record<GemType, string> = {
  red: "#bd1745",
  blue: "#35c9dd",
  green: "#20aa73",
  yellow: "#edc531",
  purple: "#a54ac4",
  orange: "#df792e",
};
