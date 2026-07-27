import { useEffect, useRef, useState } from "react";

import { TIMING_CONFIG } from "@/config/timing";
import type { GemType } from "@/types/game";
import {
  createParticles,
  GEM_PARTICLE_COLORS,
  type Particle,
  sampleParticlesAtElapsedInPlace,
} from "@/utils/particleLogic";

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
  random?: () => number;
}

export const GemParticles = ({
  id,
  gemType,
  x,
  y,
  size,
  onComplete,
  random,
}: GemParticlesProps) => {
  // Render descriptors stay immutable; every frame samples the absolute-time
  // trajectory into a separate buffer before writing it to the DOM.
  const [{ initialParticles, simulationParticles }] = useState(() => {
    const particles = createParticles({ x, y, size, random });
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
    let animationFrame: number;

    const animate = (now: number) => {
      const elapsed = now - startTime;

      if (elapsed >= TIMING_CONFIG.particleLifetime) {
        onCompleteRef.current(id);
        return;
      }

      sampleParticlesAtElapsedInPlace({
        initialParticles,
        particles: particlesRef.current,
        elapsed,
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
  }, [id, initialParticles]);

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
