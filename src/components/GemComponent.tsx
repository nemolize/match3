import { memo, type MouseEvent } from "react";

import { GEM_NAMES } from "@/constants/game";
import type { Gem } from "@/types/game";

interface GemComponentProps {
  gem: Gem;
  isSelected: boolean;
  onActivate: () => void;
}

export const GemComponent = memo(function GemComponent({
  gem,
  isSelected,
  onActivate,
}: GemComponentProps) {
  const gemName = GEM_NAMES[gem.type];

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
      className="relative h-full w-full cursor-pointer rounded-lg bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-cyan-900"
      onClick={handleClick}
    />
  );
});
