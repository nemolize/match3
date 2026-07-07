import { memo } from "react";

import { GEM_COLORS, GEM_STYLES } from "@/constants/game";
import type { Gem, Position } from "@/types/game";
import { cn } from "@/utils/cn";

interface GemComponentProps {
  gem: Gem;
  isSelected: boolean;
  onClick: (position: Position) => void;
}

// The match animation (scale/opacity) is owned by the motion wrapper in
// GameBoard; this component intentionally applies no matched styling so
// the two layers don't animate the same properties against each other.
export const GemComponent = memo(function GemComponent({
  gem,
  isSelected,
  onClick,
}: GemComponentProps) {
  const gemColorClass = GEM_COLORS[gem.type];
  const gemShadowClass = GEM_STYLES[gem.type];

  const handleClick = () => {
    onClick(gem.position);
  };

  return (
    <button
      type="button"
      key={gem.id}
      className={cn(
        "relative h-full w-full cursor-pointer rounded-lg shadow-lg transition-[filter] duration-200 select-none hover:brightness-110",
        gemColorClass,
        gemShadowClass,
        isSelected && "ring-opacity-80 scale-105 ring-4 ring-white",
      )}
      onClick={handleClick}
    >
      {/* Gem highlight effect */}
      <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/30 to-transparent" />

      {/* Gem icon/symbol */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-4 w-4 rounded-full bg-white/40" />
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute inset-0 rounded-lg border-2 border-white" />
      )}
    </button>
  );
});
