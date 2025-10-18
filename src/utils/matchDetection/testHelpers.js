// Helper function to create a gem
export const createGem = (type, row, col) => ({
  id: `${type}-${row}-${col}`,
  type,
  position: { row, col },
});

// Helper function to create an empty 8x8 board
export const createEmptyBoard = () => {
  return Array(8)
    .fill(null)
    .map(() => Array(8).fill(null));
};
