import { useEffect, useRef, useState } from "react";

import { TIMING_CONFIG } from "@/config/timing";
import type { GemType } from "@/types/game";
import {
  createParticles,
  GEM_PARTICLE_COLORS,
  type Particle,
  updateParticlesInPlace,
} from "@/utils/particleLogic";

// Cap the per-frame integration step at ~4 frames of 60fps (~67ms). Bigger
// gaps than that are almost always the tab having been backgrounded or a
// major jank spike, not real frame time we want to simulate through.
const MAX_DELTA_MS = (1000 / 60) * 4;

// Per-frame values are written straight to the DOM (see the rAF loop
// below), bypassing React: routing them through setState forced a reconcile
// of every particle on every frame, which under load (cascades, weak CPUs)
// overflowed the frame budget and made burst speed visibly unstable.
const applyParticleStyle = (element: HTMLElement, particle: Particle) => {
  element.style.transform = `translate(${particle.x - particle.size / 2}px, ${
    particle.y - particle.size / 2
  }px) rotate(${particle.rotation}deg)`;
  element.style.opacity = String(particle.opacity);
};

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
  // Rendered once; every later frame mutates these elements imperatively.
  // React re-renders (from the parent) diff against the same initial style
  // values, so they never clobber the imperative writes.
  const [{ initialParticles, simulationParticles }] = useState(() => {
    const particles = createParticles({ x, y, size });
    return {
      initialParticles: particles,
      simulationParticles: particles.map((particle) => ({ ...particle })),
    };
  });
  const particlesRef = useRef<Particle[]>(simulationParticles);
  const elementsRef = useRef<(HTMLElement | null)[]>([]);

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

      updateParticlesInPlace({
        particles: particlesRef.current,
        elapsed,
        deltaMs,
      });
      particlesRef.current.forEach((particle, i) => {
        const element = elementsRef.current[i];
        if (element) applyParticleStyle(element, particle);
      });

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [id]);

  const color = GEM_PARTICLE_COLORS[gemType];

  return (
    <div className="pointer-events-none absolute inset-0">
      {initialParticles.map((particle, i) => (
        <div
          key={particle.id}
          ref={(element) => {
            elementsRef.current[i] = element;
          }}
          className="absolute top-0 left-0 rounded-sm"
          style={{
            width: particle.size,
            height: particle.size,
            backgroundColor: color,
            boxShadow: `0 0 ${particle.size / 2}px ${color}`,
            transform: `translate(${particle.x - particle.size / 2}px, ${
              particle.y - particle.size / 2
            }px) rotate(${particle.rotation}deg)`,
            opacity: particle.opacity,
          }}
        />
      ))}
    </div>
  );
};
