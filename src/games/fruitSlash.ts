import type { ChordId, GameSessionState } from "../types";

export interface Fruit {
  id: number;
  chordId: ChordId;
  label: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export interface FruitSlashState extends GameSessionState {
  fruits: Fruit[];
  lives: number;
  spawnTimerMs: number;
  elapsedMs: number;
  nextFruitId: number;
}

const WIDTH = 720;
const HEIGHT = 540;
const GRAVITY = 720;
const BASE_INTERVAL = 1100;
const MIN_INTERVAL = 430;
const HIT_ZONE_TOP = 120;
const HIT_ZONE_BOTTOM = HEIGHT - 96;

export const FRUIT_WIDTH = WIDTH;
export const FRUIT_HEIGHT = HEIGHT;
export const fruitPalette = ["#ff8f3f", "#4ecdc4", "#f72585", "#ffd166"];

export function createInitialFruitSlashState(): FruitSlashState {
  return {
    fruits: [],
    lives: 3,
    spawnTimerMs: 650,
    elapsedMs: 0,
    nextFruitId: 1,
    score: 0,
    isPaused: false,
    isGameOver: false,
    highScoreBeat: false
  };
}

function getSpawnInterval(state: FruitSlashState): number {
  return Math.max(MIN_INTERVAL, BASE_INTERVAL - state.score * 16 - state.elapsedMs * 0.06);
}

function createFruit(state: FruitSlashState, random: () => number, labels: string[]): Fruit {
  const chordId = Math.floor(random() * 4) as ChordId;
  const x = 120 + random() * (WIDTH - 240);
  const vx = (random() - 0.5) * 110;
  const vy = -(470 + random() * 120);

  return {
    id: state.nextFruitId,
    chordId,
    label: labels[chordId] ?? `Chord ${chordId + 1}`,
    color: fruitPalette[chordId],
    x,
    y: HEIGHT + 24,
    vx,
    vy,
    radius: 28 + random() * 12
  };
}

export function updateFruitSlashState(
  state: FruitSlashState,
  dtMs: number,
  labels: string[],
  random: () => number = Math.random,
  highScore = 0
): FruitSlashState {
  if (state.isPaused || state.isGameOver) {
    return state;
  }

  let nextState: FruitSlashState = {
    ...state,
    elapsedMs: state.elapsedMs + dtMs,
    spawnTimerMs: state.spawnTimerMs - dtMs,
    fruits: state.fruits.map((fruit) => ({
      ...fruit,
      x: fruit.x + fruit.vx * (dtMs / 1000),
      y: fruit.y + fruit.vy * (dtMs / 1000),
      vy: fruit.vy + GRAVITY * (dtMs / 1000)
    }))
  };

  while (nextState.spawnTimerMs <= 0) {
    const spawnedFruit = createFruit(nextState, random, labels);
    nextState = {
      ...nextState,
      fruits: [...nextState.fruits, spawnedFruit],
      nextFruitId: nextState.nextFruitId + 1,
      spawnTimerMs: nextState.spawnTimerMs + getSpawnInterval(nextState)
    };
  }

  let livesLost = 0;
  nextState = {
    ...nextState,
    fruits: nextState.fruits.filter((fruit) => {
      if (fruit.y - fruit.radius > HEIGHT) {
        livesLost += 1;
        return false;
      }
      return true;
    }),
    lives: Math.max(0, nextState.lives - livesLost)
  };

  if (nextState.lives === 0) {
    nextState = {
      ...nextState,
      isGameOver: true
    };
  }

  nextState.highScoreBeat = nextState.score > highScore;
  return nextState;
}

export function sliceFruitByChord(
  state: FruitSlashState,
  chordId: ChordId,
  highScore = 0
): FruitSlashState {
  if (state.isGameOver) {
    return state;
  }

  const hittableFruits = state.fruits.filter(
    (fruit) =>
      fruit.chordId === chordId &&
      fruit.y >= HIT_ZONE_TOP &&
      fruit.y <= HIT_ZONE_BOTTOM
  );

  if (!hittableFruits.length) {
    return state;
  }

  const removedIds = new Set(hittableFruits.map((fruit) => fruit.id));
  const nextScore = state.score + hittableFruits.length * 10;

  return {
    ...state,
    fruits: state.fruits.filter((fruit) => !removedIds.has(fruit.id)),
    score: nextScore,
    highScoreBeat: nextScore > highScore
  };
}
