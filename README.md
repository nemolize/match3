# Match-3 Puzzle Game

A modern match-3 puzzle game built with React, TypeScript, and Vite. Features smooth animations, mobile-optimized swipe controls, and cascading match effects.

## Game Features

- **Match-3 Gameplay**: Match 3 or more gems of the same color to clear them
- **Swipe Controls**: Mobile-optimized swipe gestures for gem swapping
- **Smooth Animations**: Fluid swap, drop, and match-clearing animations
- **Cascading Matches**: Automatic chain reactions when gems fall into new matches
- **Progressive Scoring**: Score multipliers for combo matches
- **Responsive Design**: Optimized for both desktop and mobile devices

## Technical Features

- **React** with TypeScript
- **Motion** for smooth animations
- **@use-gesture/react** for touch gesture handling
- **Vite** for fast development and building
- **ESLint** and **Prettier** for linting and formatting
- **Vitest** for unit testing with Testing Library
- **Playwright** for end-to-end testing
- **Renovate** for automated dependency updates

## Getting Started

### Prerequisites

- Node.js (see `mise.toml` for version requirements)
- pnpm package manager

### Installation

```bash
pnpm install
```

### Development

Start the development server:

```bash
pnpm run dev
```

The game will be available at `http://localhost:5173`

## How to Play

1. **Swipe to Swap**: Swipe any gem in any direction to swap it with an adjacent gem
2. **Create Matches**: Only swaps that create matches of 3 or more gems are allowed
3. **Chain Reactions**: Watch for cascading matches as gems fall into place
4. **Score Points**: Earn points for matches, with bonus multipliers for combo chains
5. **Keep Playing**: The game continues until no more valid moves are available

### Building

Build for production:

```bash
pnpm run build
```

Preview the production build:

```bash
pnpm run preview
```

### Testing

Run unit tests:

```bash
pnpm run test
```

Run end-to-end tests:

```bash
pnpm run test:e2e
```

### Code Quality

Check code style and issues:

```bash
pnpm run lint
```

Fix code style issues:

```bash
pnpm run fix
```

Run type checking:

```bash
pnpm run lint:typecheck
```

## License

MIT
