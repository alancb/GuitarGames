import type { ChordId, GameSessionState } from "../types";

export type Direction = "up" | "right" | "down" | "left";

export interface Point {
  x: number;
  y: number;
}

export interface SnakeState extends GameSessionState {
  gridSize: number;
  snake: Point[];
  direction: Direction;
  pendingDirection: Direction | null;
  apple: Point;
  stepIntervalMs: number;
}

const GRID_SIZE = 20;
const INITIAL_INTERVAL = 260;
const MIN_INTERVAL = 95;

const directionVectors: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }
};

export const chordDirectionMap: Record<ChordId, Direction> = {
  0: "up",
  1: "right",
  2: "down",
  3: "left"
};

function arePointsEqual(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y;
}

function isOpposite(left: Direction, right: Direction): boolean {
  return (
    (left === "up" && right === "down") ||
    (left === "down" && right === "up") ||
    (left === "left" && right === "right") ||
    (left === "right" && right === "left")
  );
}

function spawnApple(snake: Point[], random: () => number): Point {
  const occupied = new Set(snake.map((segment) => `${segment.x},${segment.y}`));

  for (let attempts = 0; attempts < 500; attempts += 1) {
    const candidate = {
      x: Math.floor(random() * GRID_SIZE),
      y: Math.floor(random() * GRID_SIZE)
    };

    if (!occupied.has(`${candidate.x},${candidate.y}`)) {
      return candidate;
    }
  }

  return { x: 0, y: 0 };
}

export function createInitialSnakeState(random: () => number = Math.random): SnakeState {
  const snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 }
  ];

  return {
    gridSize: GRID_SIZE,
    snake,
    direction: "right",
    pendingDirection: null,
    apple: spawnApple(snake, random),
    stepIntervalMs: INITIAL_INTERVAL,
    score: 0,
    isPaused: false,
    isGameOver: false,
    highScoreBeat: false
  };
}

export function queueSnakeDirection(
  state: SnakeState,
  direction: Direction
): SnakeState {
  if (state.isGameOver) {
    return state;
  }

  const activeDirection = state.pendingDirection ?? state.direction;
  if (isOpposite(activeDirection, direction) || activeDirection === direction) {
    return state;
  }

  return {
    ...state,
    pendingDirection: direction
  };
}

export function stepSnakeState(
  state: SnakeState,
  random: () => number = Math.random,
  highScore = 0
): SnakeState {
  if (state.isPaused || state.isGameOver) {
    return state;
  }

  const direction = state.pendingDirection ?? state.direction;
  const vector = directionVectors[direction];
  const nextHead = {
    x: state.snake[0].x + vector.x,
    y: state.snake[0].y + vector.y
  };

  const hitsWall =
    nextHead.x < 0 ||
    nextHead.x >= state.gridSize ||
    nextHead.y < 0 ||
    nextHead.y >= state.gridSize;
  const hitsSelf = state.snake.some((segment) => arePointsEqual(segment, nextHead));

  if (hitsWall || hitsSelf) {
    return {
      ...state,
      direction,
      pendingDirection: null,
      isGameOver: true
    };
  }

  const ateApple = arePointsEqual(nextHead, state.apple);
  const snake = [nextHead, ...state.snake];

  if (!ateApple) {
    snake.pop();
  }

  const nextScore = state.score + (ateApple ? 1 : 0);
  return {
    ...state,
    snake,
    direction,
    pendingDirection: null,
    apple: ateApple ? spawnApple(snake, random) : state.apple,
    score: nextScore,
    stepIntervalMs: ateApple
      ? Math.max(MIN_INTERVAL, state.stepIntervalMs - 9)
      : state.stepIntervalMs,
    highScoreBeat: nextScore > highScore
  };
}
