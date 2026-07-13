import { memo, type MouseEvent } from "react";

import { GEM_COLORS, GEM_NAMES, GEM_STYLES } from "@/constants/game";
import type { Gem } from "@/types/game";
import { cn } from "@/utils/cn";

interface GemComponentProps {
  gem: Gem;
  isSelected: boolean;
  onActivate: () => void;
}

// Scale/opacity animation (entry/exit, `whileHover`/`whileTap`) is owned
// by the motion wrapper in BoardCell; this component intentionally applies
// no scale/opacity styling of its own so the two layers don't animate the
// same properties against each other.
//
// **Do NOT restore `transition-all` or `active:scale-95` on the button
// below.** Both would put a second scale animator on top of the motion
// wrapper's scale, which is a compounded-transform bug (e.g. 0.95 × 0.95
// during a tap) and produces duplicate style recalcs. Uniformity refactors
// that copy the pattern from GameHeader must stop at GemComponent's edge.
export const GemComponent = memo(function GemComponent({
  gem,
  isSelected,
  onActivate,
}: GemComponentProps) {
  const gemColorClass = GEM_COLORS[gem.type];
  const gemName = GEM_NAMES[gem.type];
  const gemShadowClass = GEM_STYLES[gem.type];

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    // Pointer taps are handled by the gesture layer in GameBoard; only
    // keyboard activation (Enter/Space => detail === 0) is handled here,
    // so a tap doesn't toggle the selection twice.
    if (event.detail === 0) {
      onActivate();
    }
  };

  return (
    <button
      type="button"
      key={gem.id}
      aria-label={`${gemName} gem`}
      aria-pressed={isSelected}
      className={cn(
        "gem-crystal relative h-full w-full cursor-pointer shadow-lg transition-[filter] duration-200 select-none hover:brightness-110",
        gemColorClass,
        gemShadowClass,
      )}
      onClick={handleClick}
    >
      <div aria-hidden="true" className="gem-crystal__surface" />
      <div aria-hidden="true" className="gem-crystal__pattern" />
      <div aria-hidden="true" className="gem-crystal__gloss" />

      {/* Selection indicator */}
      {isSelected && (
        <div aria-hidden="true" className="gem-crystal__selection" />
      )}
    </button>
  );
});
