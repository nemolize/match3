import { motion } from "motion/react";
import { useEffect, useState } from "react";

import { TIMING_CONFIG } from "@/config/timing";
import type { GemType } from "@/types/game";

interface Particle {
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

interface GemParticlesProps {
  gemType: GemType;
  x: number; // Position in pixels
  y: number; // Position in pixels
  size: number; // Size of the gem in pixels
  onComplete: () => void;
}

const GEM_COLORS: Record<GemType, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  purple: "#a855f7",
  orange: "#f97316",
};

const GRAVITY = 0.5;
const INITIAL_VELOCITY_RANGE = 5;

export const GemParticles = ({
  gemType,
  x,
  y,
  size,
  onComplete,
}: GemParticlesProps) => {
  const [particles, setParticles] = useState<Particle[]>(() => {
    // Create particles in a circular pattern
    return Array.from({ length: TIMING_CONFIG.particleCount }, (_, i) => {
      const angle = (i / TIMING_CONFIG.particleCount) * Math.PI * 2;
      const speed = 2 + Math.random() * INITIAL_VELOCITY_RANGE;

      return {
        id: `particle-${i}`,
        x: x + size / 2,
        y: y + size / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2, // Slight upward bias
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 20,
        size: size / 4 + Math.random() * (size / 8),
        opacity: 1,
      };
    });
  });

  useEffect(() => {
    const startTime = Date.now();
    let animationFrame: number;

    const updateParticles = () => {
      const elapsed = Date.now() - startTime;

      if (elapsed >= TIMING_CONFIG.particleLifetime) {
        onComplete();
        return;
      }

      setParticles((prevParticles) =>
        prevParticles.map((particle) => ({
          ...particle,
          x: particle.x + particle.vx,
          y: particle.y + particle.vy,
          vx: particle.vx * 0.98, // Air resistance
          vy: particle.vy + GRAVITY,
          rotation: particle.rotation + particle.rotationSpeed,
          opacity: Math.max(0, 1 - elapsed / TIMING_CONFIG.particleLifetime),
        })),
      );

      animationFrame = requestAnimationFrame(updateParticles);
    };

    animationFrame = requestAnimationFrame(updateParticles);

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [onComplete]);

  const color = GEM_COLORS[gemType];

  return (
    <div className="pointer-events-none absolute inset-0">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-sm"
          style={{
            left: particle.x,
            top: particle.y,
            width: particle.size,
            height: particle.size,
            backgroundColor: color,
            opacity: particle.opacity,
            transform: `rotate(${particle.rotation}deg)`,
            boxShadow: `0 0 ${particle.size / 2}px ${color}`,
          }}
        />
      ))}
    </div>
  );
};
