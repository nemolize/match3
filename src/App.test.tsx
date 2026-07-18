import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";

import App from "@/App";

const { reducedMotionSpy } = vi.hoisted(() => ({ reducedMotionSpy: vi.fn() }));

vi.mock("motion/react", () => ({
  MotionConfig: ({
    children,
    reducedMotion,
  }: {
    children: ReactNode;
    reducedMotion: string;
  }) => {
    reducedMotionSpy(reducedMotion);
    return children;
  },
}));

vi.mock("@/components/Match3Game", () => ({
  Match3Game: () => null,
}));

test("respects the user's reduced-motion preference", () => {
  render(<App />);

  expect(reducedMotionSpy).toHaveBeenCalledWith("user");
});
