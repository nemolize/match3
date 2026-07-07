export type GemType = "red" | "blue" | "green" | "yellow" | "purple" | "orange";

export interface Position {
  row: number;
  col: number;
}

export interface Gem {
  id: string;
  type: GemType;
  position: Position;
}

export interface Match {
  positions: Position[];
  type: GemType;
  score: number;
}

export interface GameState {
  board: (Gem | null)[][];
  score: number;
  selectedGem: Position | null;
  isAnimating: boolean;
  matches: Match[];
  gameOver: boolean;
  level: number;
}
