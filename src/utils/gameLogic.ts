import { BOARD_SIZE, GEM_TYPES, MIN_MATCH_LENGTH } from "@/constants/game";
import type { Gem, GemType, Match, Position } from "@/types/game";
import { findMatches as detectMatches } from "@/utils/matchDetection";

export const generateId = (): string => {
  return Math.random().toString(36).slice(2, 11);
};

export const getRandomGemType = (): GemType => {
  const randomIndex = Math.floor(Math.random() * GEM_TYPES.length);
  const gemType = GEM_TYPES[randomIndex];
  if (!gemType) {
    return "red"; // fallback
  }
  return gemType;
};

export const createGem = (row: number, col: number): Gem => {
  return {
    id: generateId(),
    type: getRandomGemType(),
    position: { row, col },
  };
};

const createBoardCandidate = (): (Gem | null)[][] => {
  const board: (Gem | null)[][] = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    board[row] = [];
    for (let col = 0; col < BOARD_SIZE; col++) {
      let gem: Gem;
      let attempts = 0;

      // Prevent initial matches by checking surrounding gems
      do {
        gem = createGem(row, col);
        attempts++;
      } while (attempts < 10 && wouldCreateMatch(board, gem, row, col));

      const boardRow = board[row];
      if (boardRow) {
        boardRow[col] = gem;
      }
    }
  }

  return board;
};

const MAX_INITIAL_BOARD_ATTEMPTS = 100;

export const createInitialBoard = (): (Gem | null)[][] => {
  for (let attempt = 0; attempt < MAX_INITIAL_BOARD_ATTEMPTS; attempt++) {
    const board = createBoardCandidate();

    if (findMatches(board).length === 0 && hasValidMoves(board)) {
      return board;
    }
  }

  throw new Error("Unable to generate a playable initial board");
};

const wouldCreateMatch = (
  board: (Gem | null)[][],
  gem: Gem,
  row: number,
  col: number,
): boolean => {
  // Check horizontal match
  let horizontalCount = 1;
  const leftGem1 = board[row]?.[col - 1];
  const leftGem2 = board[row]?.[col - 2];
  if (col >= 2 && leftGem1?.type === gem.type && leftGem2?.type === gem.type) {
    horizontalCount = 3;
  }

  // Check vertical match
  let verticalCount = 1;
  const upGem1 = board[row - 1]?.[col];
  const upGem2 = board[row - 2]?.[col];
  if (row >= 2 && upGem1?.type === gem.type && upGem2?.type === gem.type) {
    verticalCount = 3;
  }

  return (
    horizontalCount >= MIN_MATCH_LENGTH || verticalCount >= MIN_MATCH_LENGTH
  );
};

export const findMatches = (board: (Gem | null)[][]): Match[] => {
  return detectMatches(board);
};

export const removeMatches = (
  board: (Gem | null)[][],
  matches: Match[],
): (Gem | null)[][] => {
  const newBoard = board.map((row) => [...row]);

  matches.forEach((match) => {
    match.positions.forEach((pos) => {
      const boardRow = newBoard[pos.row];
      if (boardRow) {
        boardRow[pos.col] = null;
      }
    });
  });

  return newBoard;
};

export const applyGravity = (board: (Gem | null)[][]): (Gem | null)[][] => {
  const newBoard = board.map((row) => [...row]);

  for (let col = 0; col < BOARD_SIZE; col++) {
    const column = [];

    // Collect all non-null gems in this column
    for (let row = BOARD_SIZE - 1; row >= 0; row--) {
      const gem = newBoard[row]?.[col];
      if (gem !== null && gem !== undefined) {
        column.push(gem);
      }
    }

    // Fill the column from bottom to top
    for (let row = BOARD_SIZE - 1; row >= 0; row--) {
      const gem = column[BOARD_SIZE - 1 - row];
      const boardRow = newBoard[row];
      if (boardRow) {
        if (gem) {
          boardRow[col] = {
            ...gem,
            position: { row, col },
          };
        } else {
          boardRow[col] = null;
        }
      }
    }
  }

  return newBoard;
};

export const fillEmptySpaces = (board: (Gem | null)[][]): (Gem | null)[][] => {
  const newBoard = board.map((row) => [...row]);

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const boardRow = newBoard[row];
      if (boardRow && boardRow[col] === null) {
        boardRow[col] = createGem(row, col);
      }
    }
  }

  return newBoard;
};

export const areAdjacent = (pos1: Position, pos2: Position): boolean => {
  const dRow = Math.abs(pos1.row - pos2.row);
  const dCol = Math.abs(pos1.col - pos2.col);
  return (dRow === 1 && dCol === 0) || (dRow === 0 && dCol === 1);
};

const matchKey = (match: Match): string => {
  const positions = match.positions
    .map(({ row, col }) => `${row},${col}`)
    .sort()
    .join("|");
  return `${match.type}:${positions}`;
};

const isValidSwapWithExistingMatches = (
  board: (Gem | null)[][],
  pos1: Position,
  pos2: Position,
  existingMatches: ReadonlySet<string>,
): boolean => {
  if (!areAdjacent(pos1, pos2)) {
    return false;
  }

  // Simulate the swap on a copy; the original board is never mutated
  const simulatedBoard = swapGems(board, pos1, pos2);
  return findMatches(simulatedBoard).some(
    (match) =>
      !existingMatches.has(matchKey(match)) &&
      match.positions.some(
        (position) =>
          (position.row === pos1.row && position.col === pos1.col) ||
          (position.row === pos2.row && position.col === pos2.col),
      ),
  );
};

export const isValidSwap = (
  board: (Gem | null)[][],
  pos1: Position,
  pos2: Position,
): boolean => {
  const existingMatches = new Set(findMatches(board).map(matchKey));
  return isValidSwapWithExistingMatches(board, pos1, pos2, existingMatches);
};

export const swapGems = (
  board: (Gem | null)[][],
  pos1: Position,
  pos2: Position,
): (Gem | null)[][] => {
  const newBoard = board.map((row) => [...row]);
  const row1 = newBoard[pos1.row];
  const row2 = newBoard[pos2.row];

  if (row1 && row2) {
    const gem1 = row1[pos1.col] ?? null;
    const gem2 = row2[pos2.col] ?? null;

    // Place cloned gems with updated positions; original gems stay untouched
    row1[pos1.col] = gem2
      ? { ...gem2, position: { row: pos1.row, col: pos1.col } }
      : null;
    row2[pos2.col] = gem1
      ? { ...gem1, position: { row: pos2.row, col: pos2.col } }
      : null;
  }

  return newBoard;
};

export const hasValidMoves = (board: (Gem | null)[][]): boolean => {
  const existingMatches = new Set(findMatches(board).map(matchKey));

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const currentPos = { row, col };

      // Right and down cover every undirected adjacent pair exactly once.
      const adjacent = [
        { row: row + 1, col },
        { row, col: col + 1 },
      ];

      for (const adjPos of adjacent) {
        if (
          adjPos.row >= 0 &&
          adjPos.row < BOARD_SIZE &&
          adjPos.col >= 0 &&
          adjPos.col < BOARD_SIZE
        ) {
          if (
            isValidSwapWithExistingMatches(
              board,
              currentPos,
              adjPos,
              existingMatches,
            )
          ) {
            return true;
          }
        }
      }
    }
  }

  return false;
};
