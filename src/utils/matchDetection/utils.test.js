import { describe, expect, test } from "vitest";

import { removeDuplicateMatches } from "./utils";

describe("Utils", () => {
  test("should prioritize longer matches over shorter ones", () => {
    const matches = [
      {
        positions: [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
          { row: 0, col: 2 },
        ],
        type: "red",
        score: 300,
      },
      {
        positions: [
          { row: 0, col: 0 },
          { row: 1, col: 0 },
          { row: 2, col: 0 },
          { row: 3, col: 0 },
        ],
        type: "red",
        score: 400,
      },
    ];

    const result = removeDuplicateMatches(matches);

    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(400); // Longer match should be kept
    expect(result[0].positions).toHaveLength(4);
  });

  test("should keep non-overlapping matches", () => {
    const matches = [
      {
        positions: [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
          { row: 0, col: 2 },
        ],
        type: "red",
        score: 300,
      },
      {
        positions: [
          { row: 2, col: 0 },
          { row: 2, col: 1 },
          { row: 2, col: 2 },
        ],
        type: "blue",
        score: 300,
      },
    ];

    const result = removeDuplicateMatches(matches);

    expect(result).toHaveLength(2);
  });

  test("should handle empty matches array", () => {
    const result = removeDuplicateMatches([]);
    expect(result).toHaveLength(0);
  });
});
