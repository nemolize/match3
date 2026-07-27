import { BOARD_SIZE } from "@/constants/game";

import type { BoardLayout } from "./types";

type BoardLayoutInput = Omit<BoardLayout, "cellSize">;

export const createBoardLayout = (input: BoardLayoutInput): BoardLayout => ({
  ...input,
  cellSize: (input.boardSize - input.gap * (BOARD_SIZE - 1)) / BOARD_SIZE,
});
