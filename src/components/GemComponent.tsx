import { GEM_COLORS, GEM_STYLES } from "@/constants/game";
import type { Gem, Position } from "@/types/game";
import { cn } from "@/utils/cn";

interface GemComponentProps {
  gem: Gem;
  isSelected: boolean;
  isMatched: boolean;
  onClick: (position: Position) => void;
}

export const GemComponent = ({
  gem,
  isSelected,
  isMatched,
  onClick,
}: GemComponentProps) => {
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
        "relative h-full w-full cursor-pointer rounded-lg shadow-lg transition-all duration-200 select-none hover:brightness-110 active:scale-95",
        gemColorClass,
        gemShadowClass,
        isSelected && "ring-opacity-80 scale-105 ring-4 ring-white",
        isMatched && "scale-75 opacity-30",
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
};
