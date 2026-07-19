import { describe, expect, test } from "vitest";

import { TIMING_CONFIG } from "../config/timing";
import {
  getDropLayoutTransition,
  getGemInitial,
  getGravityTransition,
  gravityEase,
} from "./gemAnimation";

const fallingGem = {
  id: "falling",
  type: "red",
  position: { row: 3, col: 0 },
  fallDistance: 3,
};

describe("gemAnimation", () => {
  test("uses constant-acceleration progress", () => {
    expect(gravityEase(0)).toBe(0);
    expect(gravityEase(0.5)).toBe(0.25);
    expect(gravityEase(1)).toBe(1);
  });

  test("scales fall time with the square root of distance", () => {
    const oneCell = getDropLayoutTransition(1);
    const fourCells = getDropLayoutTransition(4);

    expect(oneCell.type).toBe("tween");
    expect(oneCell.duration).toBe(TIMING_CONFIG.dropDuration / 1000);
    expect(fourCells.duration).toBeCloseTo(oneCell.duration * 2);
    expect(TIMING_CONFIG.dropAnimationWait).toBeGreaterThan(
      getDropLayoutTransition(8).duration * 1000,
    );
  });

  test("uses the gravity tween only during the drop phase", () => {
    expect(getGravityTransition(fallingGem, "swap")).toEqual({});
    expect(getGravityTransition(fallingGem, "drop")).toHaveProperty("layout");
  });

  test("keeps existing gems visible when their drop starts", () => {
    expect(getGemInitial(fallingGem, "drop")).toEqual({
      scale: 1,
      opacity: 1,
    });
  });

  test("starts refill gems above the board with the gravity tween on y", () => {
    const refillGem = { ...fallingGem, entersFromAbove: true };

    expect(getGemInitial(refillGem, "drop")).toEqual({
      y: "calc(-300% - 0.75rem)",
      scale: 1,
      opacity: 1,
    });
    expect(getGravityTransition(refillGem, "drop")).toHaveProperty("y");
  });
});
