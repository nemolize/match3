import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { GemParticles } from "@/components/GemParticles";
import { TIMING_CONFIG } from "@/config/timing";

/**
 * Extract each particle element's inline `left` position so the tests can
 * observe that motion is progressing (they don't need exact pixel values —
 * physics is unit-tested elsewhere; here we assert continuity).
 */
const readLefts = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>("div[style]")]
    .map((el) => el.style.left)
    .filter((s) => s !== "");

describe("GemParticles", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("swapping the onComplete callback identity does not reset the lifetime timer", () => {
    const onComplete1 = vi.fn();
    const onComplete2 = vi.fn();

    const { container, rerender } = render(
      <GemParticles
        id="p1"
        gemType="red"
        x={100}
        y={100}
        size={40}
        onComplete={onComplete1}
      />,
    );

    // Advance halfway through the lifetime. The animation loop keeps
    // stepping via rAF, and the ref should hold onto onComplete1.
    act(() => {
      vi.advanceTimersByTime(TIMING_CONFIG.particleLifetime / 2);
    });
    const halfwayLefts = readLefts(container);
    expect(halfwayLefts.length).toBeGreaterThan(0);

    // Now swap the callback identity mid-flight. The critical guarantee:
    // the effect is NOT re-run, so the startTime clock is untouched.
    rerender(
      <GemParticles
        id="p1"
        gemType="red"
        x={100}
        y={100}
        size={40}
        onComplete={onComplete2}
      />,
    );

    // Positions right after rerender must equal the pre-rerender snapshot:
    // no restart means no `createParticles` re-seed.
    expect(readLefts(container)).toEqual(halfwayLefts);

    // Advance past the remaining lifetime; onComplete2 (the current ref)
    // fires, onComplete1 (stale) does not.
    act(() => {
      vi.advanceTimersByTime(TIMING_CONFIG.particleLifetime);
    });
    expect(onComplete2).toHaveBeenCalledWith("p1");
    expect(onComplete1).not.toHaveBeenCalled();
  });

  test("particle positions advance continuously across frames", () => {
    const { container } = render(
      <GemParticles
        id="p1"
        gemType="red"
        x={100}
        y={100}
        size={40}
        onComplete={vi.fn()}
      />,
    );

    // Snapshot at t≈0, mid, later. Positions must change; particles have
    // non-zero velocity so `left` cannot be identical across snapshots.
    const t0 = readLefts(container);
    expect(t0.length).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    const t1 = readLefts(container);
    expect(t1).not.toEqual(t0);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    const t2 = readLefts(container);
    expect(t2).not.toEqual(t1);
  });
});
