import { GEM_COLORS, GEM_STYLES } from "../constants/game";
import type { Gem, Position } from "../types/game";

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
      className={`
        relative w-full h-full rounded-lg cursor-pointer select-none
        ${gemColorClass}
        ${gemShadowClass}
        ${isSelected ? "ring-4 ring-white ring-opacity-80 scale-105" : ""}
        ${isMatched ? "opacity-30 scale-75" : ""}
        shadow-lg
        active:scale-95
        hover:brightness-110
        transition-all duration-200
      `}
      onClick={handleClick}
    >
      {/* Gem highlight effect */}
      <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/30 to-transparent" />

      {/* Gem icon/symbol */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-4 h-4 bg-white/40 rounded-full" />
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute inset-0 rounded-lg border-2 border-white" />
      )}
    </button>
  );
};
