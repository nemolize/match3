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

// Cap the per-frame integration step at ~4 frames of 60fps (~67ms). Bigger
// gaps than that are almost always the tab having been backgrounded or a
// major jank spike, not real frame time we want to simulate through.
const MAX_DELTA_MS = (1000 / 60) * 4;

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

      // Clamp deltaMs so a big gap between frames — the tab going into the
      // background then resuming, or a jank spike — does not translate into
      // a single frame of position/velocity that flings particles across
      // the screen. Also swallows the first-frame edge case where the ref
      // integrator would otherwise see whatever wall-clock elapsed since
      // startTime as `deltaMs`.
      const rawDeltaMs = now - lastTime;
      const deltaMs = Math.min(rawDeltaMs, MAX_DELTA_MS);
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
