import {
  createInitialSnakeState,
  queueSnakeDirection,
  stepSnakeState
} from "../src/games/snake";

describe("snake logic", () => {
  it("ignores invalid reverse turns", () => {
    const initial = createInitialSnakeState(() => 0.1);
    const reversed = queueSnakeDirection(initial, "left");

    expect(reversed.pendingDirection).toBeNull();
  });

  it("grows and speeds up when eating apples", () => {
    const initial = createInitialSnakeState(() => 0.1);
    const aligned = {
      ...initial,
      apple: { x: 11, y: 10 }
    };

    const next = stepSnakeState(aligned, () => 0.2, 0);

    expect(next.score).toBe(1);
    expect(next.snake).toHaveLength(initial.snake.length + 1);
    expect(next.stepIntervalMs).toBeLessThan(initial.stepIntervalMs);
  });

  it("ends the run on wall collision", () => {
    const initial = createInitialSnakeState(() => 0.1);
    const nearWall = {
      ...initial,
      snake: [{ x: 19, y: 10 }, { x: 18, y: 10 }, { x: 17, y: 10 }]
    };

    const next = stepSnakeState(nearWall, () => 0.1, 0);

    expect(next.isGameOver).toBe(true);
  });
});
