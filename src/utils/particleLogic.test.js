import { describe, expect, test } from "vitest";

import {
  createParticles,
  sampleParticlesAtElapsed,
  sampleParticlesAtElapsedInPlace,
} from "./particleLogic";

const CELL_PADDING = 4;

describe("particleLogic", () => {
  describe("createParticles", () => {
    test("should create the specified number of particles", () => {
      const particles = createParticles({
        x: 0,
        y: 0,
        size: 50,
        count: 8,
      });

      expect(particles).toHaveLength(8);
    });

    test("uses an injected random source for reproducible particles", () => {
      const particles = createParticles({
        x: 0,
        y: 0,
        size: 40,
        count: 1,
        random: () => 0.5,
      });

      expect(particles[0]).toMatchObject({
        vx: 4.5,
        vy: -2,
        rotation: 180,
        rotationSpeed: 0,
        size: 12.5,
      });
    });

    test("should position particles at gem center accounting for cell padding", () => {
      const x = 100;
      const y = 200;
      const size = 50;

      const particles = createParticles({ x, y, size, count: 8 });

      const expectedCenterX = x + CELL_PADDING + size / 2;
      const expectedCenterY = y + CELL_PADDING + size / 2;

      particles.forEach((particle) => {
        // All particles should start at the gem center
        expect(particle.x).toBe(expectedCenterX);
        expect(particle.y).toBe(expectedCenterY);
      });
    });

    test("should position particles correctly with different cell positions", () => {
      const testCases = [
        { x: 0, y: 0, size: 40 },
        { x: 50, y: 100, size: 60 },
        { x: 200, y: 300, size: 80 },
      ];

      testCases.forEach(({ x, y, size }) => {
        const particles = createParticles({ x, y, size, count: 4 });

        const expectedX = x + CELL_PADDING + size / 2;
        const expectedY = y + CELL_PADDING + size / 2;

        particles.forEach((particle) => {
          expect(particle.x).toBe(expectedX);
          expect(particle.y).toBe(expectedY);
        });
      });
    });

    test("should create particles with velocities in different directions", () => {
      const particles = createParticles({
        x: 0,
        y: 0,
        size: 50,
        count: 8,
      });

      // Collect velocity directions
      const hasPositiveVx = particles.some((p) => p.vx > 0);
      const hasNegativeVx = particles.some((p) => p.vx < 0);
      const hasPositiveVy = particles.some((p) => p.vy > 0);
      const hasNegativeVy = particles.some((p) => p.vy < 0);

      // Particles should be created in multiple directions
      expect(hasPositiveVx).toBe(true);
      expect(hasNegativeVx).toBe(true);
      expect(hasPositiveVy).toBe(true);
      expect(hasNegativeVy).toBe(true);
    });

    test("should create particles with initial opacity of 1", () => {
      const particles = createParticles({
        x: 0,
        y: 0,
        size: 50,
        count: 4,
      });

      particles.forEach((particle) => {
        expect(particle.opacity).toBe(1);
      });
    });

    test("should create particles with varying sizes", () => {
      const gemSize = 60;
      const particles = createParticles({
        x: 0,
        y: 0,
        size: gemSize,
        count: 10,
      });

      const sizes = particles.map((p) => p.size);
      const uniqueSizes = new Set(sizes);

      // Due to randomness, we should have multiple different sizes
      // (though theoretically could have duplicates)
      expect(uniqueSizes.size).toBeGreaterThan(1);

      // All sizes should be within expected range: gemSize/4 to gemSize/4 + gemSize/8
      const minSize = gemSize / 4;
      const maxSize = gemSize / 4 + gemSize / 8;

      particles.forEach((particle) => {
        expect(particle.size).toBeGreaterThanOrEqual(minSize);
        expect(particle.size).toBeLessThanOrEqual(maxSize);
      });
    });

    test("should create particles with unique IDs", () => {
      const particles = createParticles({
        x: 0,
        y: 0,
        size: 50,
        count: 8,
      });

      const ids = particles.map((p) => p.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(particles.length);
    });
  });

  describe("sampleParticlesAtElapsed", () => {
    test("should update the renderer-owned particles without allocating replacements", () => {
      const initialParticles = [
        {
          id: "1",
          x: 100,
          y: 100,
          vx: 5,
          vy: 3,
          rotation: 0,
          rotationSpeed: 10,
          size: 10,
          opacity: 1,
        },
      ];
      const particles = initialParticles.map((particle) => ({ ...particle }));
      const particle = particles[0];

      sampleParticlesAtElapsedInPlace({
        initialParticles,
        particles,
        elapsed: 500,
        lifetime: 1000,
      });

      expect(particles[0]).toBe(particle);
      expect(particle.x).toBeCloseTo(250);
      expect(particle.y).toBeCloseTo(415);
      expect(particle.vx).toBe(5);
      expect(particle.vy).toBeCloseTo(18);
      expect(particle.rotation).toBeCloseTo(300);
      expect(particle.opacity).toBe(0.5);
      expect(initialParticles[0].x).toBe(100);
    });

    test("should reject aliased initial and output particles", () => {
      const particles = [
        {
          id: "1",
          x: 100,
          y: 100,
          vx: 5,
          vy: 3,
          rotation: 0,
          rotationSpeed: 10,
          size: 10,
          opacity: 1,
        },
      ];

      expect(() =>
        sampleParticlesAtElapsedInPlace({
          initialParticles: particles,
          particles,
          elapsed: 500,
        }),
      ).toThrow("Initial particles must not share output objects");
    });

    test("should update particle positions based on velocity", () => {
      const initialParticles = [
        {
          id: "1",
          x: 100,
          y: 100,
          vx: 5,
          vy: 3,
          rotation: 0,
          rotationSpeed: 0,
          size: 10,
          opacity: 1,
        },
      ];

      const updated = sampleParticlesAtElapsed({
        initialParticles,
        elapsed: 1000 / 60,
      });

      expect(updated[0].x).toBe(105); // 100 + 5
      expect(updated[0].y).toBe(103.25); // 100 + 3 + 0.5 * 0.5
    });

    test("should apply gravity to vertical velocity", () => {
      const gravity = 0.5;
      const initialParticles = [
        {
          id: "1",
          x: 100,
          y: 100,
          vx: 0,
          vy: 0,
          rotation: 0,
          rotationSpeed: 0,
          size: 10,
          opacity: 1,
        },
      ];

      const updated = sampleParticlesAtElapsed({
        initialParticles,
        elapsed: 1000 / 60,
      });

      expect(updated[0].vy).toBe(gravity);
      expect(updated[0].y).toBe(100.25);
    });

    test("should keep horizontal velocity constant", () => {
      const initialParticles = [
        {
          id: "1",
          x: 100,
          y: 100,
          vx: 10,
          vy: 0,
          rotation: 0,
          rotationSpeed: 0,
          size: 10,
          opacity: 1,
        },
      ];

      const updated = sampleParticlesAtElapsed({
        initialParticles,
        elapsed: 500,
      });

      expect(updated[0].x).toBeCloseTo(400);
      expect(updated[0].vx).toBe(10);
    });

    test("should update rotation based on rotation speed", () => {
      const initialParticles = [
        {
          id: "1",
          x: 100,
          y: 100,
          vx: 0,
          vy: 0,
          rotation: 45,
          rotationSpeed: 10,
          size: 10,
          opacity: 1,
        },
      ];

      const updated = sampleParticlesAtElapsed({
        initialParticles,
        elapsed: 1000 / 60,
      });

      expect(updated[0].rotation).toBe(55); // 45 + 10
    });

    test("should decrease opacity over time", () => {
      const initialParticles = [
        {
          id: "1",
          x: 100,
          y: 100,
          vx: 0,
          vy: 0,
          rotation: 0,
          rotationSpeed: 0,
          size: 10,
          opacity: 1,
        },
      ];

      const lifetime = 1000;

      // At 0ms: opacity = 1
      const updated0 = sampleParticlesAtElapsed({
        initialParticles,
        elapsed: 0,
        lifetime,
      });
      expect(updated0[0].opacity).toBe(1);

      // At 500ms: opacity = 0.5
      const updated500 = sampleParticlesAtElapsed({
        initialParticles,
        elapsed: 500,
        lifetime,
      });
      expect(updated500[0].opacity).toBe(0.5);

      // At 1000ms: opacity = 0
      const updated1000 = sampleParticlesAtElapsed({
        initialParticles,
        elapsed: 1000,
        lifetime,
      });
      expect(updated1000[0].opacity).toBe(0);
    });

    test("should not allow negative opacity", () => {
      const initialParticles = [
        {
          id: "1",
          x: 100,
          y: 100,
          vx: 0,
          vy: 0,
          rotation: 0,
          rotationSpeed: 0,
          size: 10,
          opacity: 1,
        },
      ];

      const updated = sampleParticlesAtElapsed({
        initialParticles,
        elapsed: 2000,
        lifetime: 1000,
      });

      expect(updated[0].opacity).toBe(0);
      expect(updated[0].opacity).toBeGreaterThanOrEqual(0);
    });

    test("should sample a long frame gap from absolute elapsed time", () => {
      const initialParticles = [
        {
          id: "1",
          x: 100,
          y: 100,
          vx: 10,
          vy: 0,
          rotation: 0,
          rotationSpeed: 0,
          size: 10,
          opacity: 1,
        },
      ];

      const updated = sampleParticlesAtElapsed({
        initialParticles,
        elapsed: 500,
      });

      expect(updated[0].x).toBeCloseTo(400);
      expect(updated[0].y).toBeCloseTo(325);
      expect(updated[0].opacity).toBe(0.5);
    });

    test("should produce the same result for every frame schedule", () => {
      const initialParticles = [
        {
          id: "1",
          x: 100,
          y: 100,
          vx: 10,
          vy: 0,
          rotation: 0,
          rotationSpeed: 6,
          size: 10,
          opacity: 1,
        },
      ];

      const sampleSchedule = (schedule) => {
        const particles = initialParticles.map((particle) => ({ ...particle }));
        schedule.forEach((elapsed) => {
          sampleParticlesAtElapsedInPlace({
            initialParticles,
            particles,
            elapsed,
          });
        });
        return particles[0];
      };
      const schedules = [
        Array.from({ length: 60 }, (_, i) => ((i + 1) * 500) / 60),
        Array.from({ length: 30 }, (_, i) => ((i + 1) * 500) / 30),
        Array.from({ length: 120 }, (_, i) => ((i + 1) * 500) / 120),
        [16, 49, 83, 150, 311, 500],
      ];
      const expected = sampleSchedule(schedules[0]);

      schedules.slice(1).forEach((schedule) => {
        expect(sampleSchedule(schedule)).toEqual(expected);
      });
    });

    test("should update multiple particles independently", () => {
      const initialParticles = [
        {
          id: "1",
          x: 100,
          y: 100,
          vx: 5,
          vy: 3,
          rotation: 0,
          rotationSpeed: 10,
          size: 10,
          opacity: 1,
        },
        {
          id: "2",
          x: 200,
          y: 200,
          vx: -3,
          vy: 7,
          rotation: 90,
          rotationSpeed: -5,
          size: 15,
          opacity: 1,
        },
      ];

      const updated = sampleParticlesAtElapsed({
        initialParticles,
        elapsed: 500,
        lifetime: 1000,
      });

      // First particle
      expect(updated[0].x).toBeCloseTo(250);
      expect(updated[0].y).toBeCloseTo(415);
      expect(updated[0].rotation).toBeCloseTo(300);

      // Second particle
      expect(updated[1].x).toBeCloseTo(110);
      expect(updated[1].y).toBeCloseTo(635);
      expect(updated[1].rotation).toBeCloseTo(-60);

      // Both should have same opacity (based on elapsed time)
      expect(updated[0].opacity).toBe(0.5);
      expect(updated[1].opacity).toBe(0.5);
    });
  });
});
