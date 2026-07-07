import { useCallback, useEffect, useRef, useState } from "react";

import { GemParticles } from "@/components/GemParticles";
import type { Gem, GemType, Match } from "@/types/game";
import type { ParticleOrigin } from "@/utils/boardLayout";

interface BreakingGem extends ParticleOrigin {
  id: string;
  type: GemType;
}

export interface BreakingGemsLayerProps {
  board: (Gem | null)[][];
  matches: Match[];
  /**
   * Given a board cell, return the pixel origin/size of the particle burst
   * to spawn there. Owned by the ref holder (GameBoard) so this component
   * stays decoupled from the rendered grid's DOM shape.
   */
  resolveOrigin: (row: number, col: number) => ParticleOrigin | null;
}

/**
 * Owns the breaking-gem particle effects. Isolating this state from the
 * grid means per-particle spawn/complete updates re-render only this layer,
 * not the 64 board cells.
 */
export const BreakingGemsLayer = ({
  board,
  matches,
  resolveOrigin,
}: BreakingGemsLayerProps) => {
  const [breakingGems, setBreakingGems] = useState<BreakingGem[]>([]);
  const prevMatchesRef = useRef<Match[]>([]);

  // Detect new matches and create breaking gem particles
  useEffect(() => {
    // Check if we have new matches
    const newMatchPositions = matches.flatMap((match) => match.positions);
    const prevMatchPositions = prevMatchesRef.current.flatMap(
      (match) => match.positions,
    );

    const hasNewMatches =
      newMatchPositions.length > 0 &&
      (prevMatchPositions.length !== newMatchPositions.length ||
        !newMatchPositions.every((pos, i) =>
          prevMatchPositions[i]
            ? pos.row === prevMatchPositions[i].row &&
              pos.col === prevMatchPositions[i].col
            : false,
        ));

    if (hasNewMatches) {
      const newBreakingGems: BreakingGem[] = [];

      matches.forEach((match) => {
        match.positions.forEach((pos) => {
          const gem = board[pos.row]?.[pos.col];
          if (!gem) return;
          const origin = resolveOrigin(pos.row, pos.col);
          if (!origin) return;
          newBreakingGems.push({
            id: `breaking-${gem.id}-${Date.now()}`,
            type: gem.type,
            ...origin,
          });
        });
      });

      // Use setTimeout to avoid calling setState synchronously in effect
      setTimeout(() => {
        setBreakingGems((prev) => [...prev, ...newBreakingGems]);
      }, 0);
    }

    prevMatchesRef.current = matches;
  }, [matches, board, resolveOrigin]);

  const handleParticleComplete = useCallback((id: string) => {
    setBreakingGems((prev) => prev.filter((gem) => gem.id !== id));
  }, []);

  return (
    <>
      {breakingGems.map((breakingGem) => (
        <GemParticles
          key={breakingGem.id}
          id={breakingGem.id}
          gemType={breakingGem.type}
          x={breakingGem.x}
          y={breakingGem.y}
          size={breakingGem.size}
          onComplete={handleParticleComplete}
        />
      ))}
    </>
  );
};
