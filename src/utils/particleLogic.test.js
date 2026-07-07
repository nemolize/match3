import { describe, expect, test } from "vitest";

import { createParticles, updateParticles } from "./particleLogic";

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

  describe("updateParticles", () => {
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

      const updated = updateParticles({
        particles: initialParticles,
        elapsed: 0,
      });

      expect(updated[0].x).toBe(105); // 100 + 5
      expect(updated[0].y).toBe(103); // 100 + 3
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

      const updated = updateParticles({
        particles: initialParticles,
        elapsed: 0,
      });

      expect(updated[0].vy).toBe(gravity);
    });

    test("should apply air resistance to horizontal velocity", () => {
      const airResistance = 0.98;
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

      const updated = updateParticles({
        particles: initialParticles,
        elapsed: 0,
      });

      expect(updated[0].vx).toBe(10 * airResistance);
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

      const updated = updateParticles({
        particles: initialParticles,
        elapsed: 0,
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
      const updated0 = updateParticles({
        particles: initialParticles,
        elapsed: 0,
        lifetime,
      });
      expect(updated0[0].opacity).toBe(1);

      // At 500ms: opacity = 0.5
      const updated500 = updateParticles({
        particles: initialParticles,
        elapsed: 500,
        lifetime,
      });
      expect(updated500[0].opacity).toBe(0.5);

      // At 1000ms: opacity = 0
      const updated1000 = updateParticles({
        particles: initialParticles,
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

      const updated = updateParticles({
        particles: initialParticles,
        elapsed: 2000,
        lifetime: 1000,
      });

      expect(updated[0].opacity).toBe(0);
      expect(updated[0].opacity).toBeGreaterThanOrEqual(0);
    });

    test("should scale integration with deltaMs (frame-rate independent)", () => {
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

      // Half a 60fps frame (as on a 120Hz display) moves half as far
      const updated = updateParticles({
        particles: initialParticles,
        elapsed: 0,
        deltaMs: 1000 / 120,
      });

      expect(updated[0].x).toBeCloseTo(105); // 100 + 10 * 0.5
      expect(updated[0].rotation).toBeCloseTo(3); // 6 * 0.5
      expect(updated[0].vy).toBeCloseTo(0.25); // gravity 0.5 * 0.5
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

      const updated = updateParticles({
        particles: initialParticles,
        elapsed: 500,
        lifetime: 1000,
      });

      // First particle
      expect(updated[0].x).toBe(105);
      expect(updated[0].y).toBe(103);
      expect(updated[0].rotation).toBe(10);

      // Second particle
      expect(updated[1].x).toBe(197); // 200 + (-3)
      expect(updated[1].y).toBe(207);
      expect(updated[1].rotation).toBe(85); // 90 + (-5)

      // Both should have same opacity (based on elapsed time)
      expect(updated[0].opacity).toBe(0.5);
      expect(updated[1].opacity).toBe(0.5);
    });
  });
});
