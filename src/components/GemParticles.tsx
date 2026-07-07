import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { TIMING_CONFIG } from "@/config/timing";
import type { GemType } from "@/types/game";
import {
  createParticles,
  GEM_COLORS,
  type Particle,
  updateParticles as updateParticlesLogic,
} from "@/utils/particleLogic";

interface GemParticlesProps {
  id: string;
  gemType: GemType;
  x: number; // Position in pixels
  y: number; // Position in pixels
  size: number; // Size of the gem in pixels
  onComplete: (id: string) => void;
}

export const GemParticles = ({
  id,
  gemType,
  x,
  y,
  size,
  onComplete,
}: GemParticlesProps) => {
  const [particles, setParticles] = useState<Particle[]>(() =>
    createParticles({ x, y, size }),
  );

  // Keep the latest callback in a ref so the animation timer below is not
  // reset when the parent re-renders with a new callback identity.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    const startTime = performance.now();
    let lastTime = startTime;
    let animationFrame: number;

    const animate = (now: number) => {
      const elapsed = now - startTime;

      if (elapsed >= TIMING_CONFIG.particleLifetime) {
        onCompleteRef.current(id);
        return;
      }

      const deltaMs = now - lastTime;
      lastTime = now;

      setParticles((prevParticles) =>
        updateParticlesLogic({ particles: prevParticles, elapsed, deltaMs }),
      );

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [id]);

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
