import { motion } from "motion/react";
import { useEffect, useState } from "react";

import { TIMING_CONFIG } from "@/config/timing";
import type { GemType } from "@/types/game";
import {
  createParticles,
  GEM_COLORS,
  type Particle,
  updateParticles as updateParticlesLogic,
} from "@/utils/particleLogic";

interface GemParticlesProps {
  gemType: GemType;
  x: number; // Position in pixels
  y: number; // Position in pixels
  size: number; // Size of the gem in pixels
  onComplete: () => void;
}

export const GemParticles = ({
  gemType,
  x,
  y,
  size,
  onComplete,
}: GemParticlesProps) => {
  const [particles, setParticles] = useState<Particle[]>(() =>
    createParticles({ x, y, size }),
  );

  useEffect(() => {
    const startTime = Date.now();
    let animationFrame: number;

    const animate = () => {
      const elapsed = Date.now() - startTime;

      if (elapsed >= TIMING_CONFIG.particleLifetime) {
        onComplete();
        return;
      }

      setParticles((prevParticles) =>
        updateParticlesLogic({ particles: prevParticles, elapsed }),
      );

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);

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
            left: particle.x - particle.size / 2,
            top: particle.y - particle.size / 2,
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
