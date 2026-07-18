import { TIMING_CONFIG } from "@/config/timing";
import { BOARD_GAP_REM } from "@/constants/game";
import type { AnimationPhase, Gem } from "@/types/game";

export const gravityEase = (progress: number): number => progress * progress;

export const getDropLayoutTransition = (fallDistance: number) => ({
  type: "tween" as const,
  duration:
    (TIMING_CONFIG.dropDuration / 1000) * Math.sqrt(Math.max(fallDistance, 1)),
  ease: gravityEase,
});

export const getGravityTransition = (
  gem: Gem,
  animationPhase: AnimationPhase,
) => {
  if (animationPhase !== "drop" || gem.fallDistance === undefined) return {};

  const transition = getDropLayoutTransition(gem.fallDistance);
  return gem.entersFromAbove === true
    ? { y: transition }
    : { layout: transition };
};

export const getGemInitial = (gem: Gem, animationPhase: AnimationPhase) => {
  if (
    animationPhase !== "drop" ||
    gem.entersFromAbove !== true ||
    gem.fallDistance === undefined
  ) {
    return { scale: 0.8, opacity: 0 };
  }

  return {
    // The motion wrapper spans one full grid track; the shared grid gap
    // sits outside its 100% transform distance.
    y: `calc(-${gem.fallDistance * 100}% - ${gem.fallDistance * BOARD_GAP_REM}rem)`,
    scale: 1,
    opacity: 1,
  };
};
