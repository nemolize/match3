import { TIMING_CONFIG } from "@/config/timing";
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
const AIR_RESISTANCE = 0.98;
const INITIAL_VELOCITY_RANGE = 5;
const CELL_PADDING = 4; // p-1 = 4px padding from the cell
const BASE_FRAME_MS = 1000 / 60;

export interface CreateParticlesOptions {
  x: number; // Cell top-left x position in pixels
  y: number; // Cell top-left y position in pixels
  size: number; // Gem size in pixels (cell size minus padding)
  count?: number; // Number of particles to create
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
}: CreateParticlesOptions): Particle[] => {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const speed = 2 + Math.random() * INITIAL_VELOCITY_RANGE;

    return {
      id: `particle-${i}`,
      // Position at gem center: cell position + padding + half gem size
      x: x + CELL_PADDING + size / 2,
      y: y + CELL_PADDING + size / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2, // Slight upward bias
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 20,
      size: size / 4 + Math.random() * (size / 8),
      opacity: 1,
    };
  });
};

export interface UpdateParticlesOptions {
  particles: Particle[];
  elapsed: number; // Time elapsed since start in milliseconds
  lifetime?: number; // Particle lifetime in milliseconds
  deltaMs?: number; // Time since the previous update in milliseconds
}

/**
 * Updates particle positions, velocities, and opacity based on physics
 * simulation. Physics constants are tuned in 60fps-frame units; `deltaMs`
 * scales the integration step so motion speed is frame-rate independent
 * (e.g. identical on 60Hz and 120Hz displays).
 */
export const updateParticles = ({
  particles,
  elapsed,
  lifetime = TIMING_CONFIG.particleLifetime,
  deltaMs = BASE_FRAME_MS,
}: UpdateParticlesOptions): Particle[] => {
  const dt = deltaMs / BASE_FRAME_MS;

  return particles.map((particle) => ({
    ...particle,
    x: particle.x + particle.vx * dt,
    y: particle.y + particle.vy * dt,
    vx: particle.vx * Math.pow(AIR_RESISTANCE, dt),
    vy: particle.vy + GRAVITY * dt,
    rotation: particle.rotation + particle.rotationSpeed * dt,
    opacity: Math.max(0, 1 - elapsed / lifetime),
  }));
};

export const GEM_COLORS: Record<GemType, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  purple: "#a855f7",
  orange: "#f97316",
};
