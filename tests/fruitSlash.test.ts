import {
  createInitialFruitSlashState,
  sliceFruitByChord,
  updateFruitSlashState
} from "../src/games/fruitSlash";

describe("fruit slash logic", () => {
  it("spawns fruit over time", () => {
    const initial = createInitialFruitSlashState();
    const next = updateFruitSlashState(initial, 800, ["G", "C", "D", "Em"], () => 0.5, 0);

    expect(next.fruits.length).toBeGreaterThan(0);
  });

  it("removes matching fruit in the hit lane", () => {
    const initial = createInitialFruitSlashState();
    const prepared = {
      ...initial,
      fruits: [
        {
          id: 1,
          chordId: 2 as const,
          label: "D",
          color: "#fff",
          x: 200,
          y: 220,
          vx: 0,
          vy: 0,
          radius: 24
        }
      ]
    };

    const next = sliceFruitByChord(prepared, 2, 0);

    expect(next.score).toBe(10);
    expect(next.fruits).toHaveLength(0);
  });

  it("costs a life when fruit falls past the screen", () => {
    const initial = createInitialFruitSlashState();
    const prepared = {
      ...initial,
      fruits: [
        {
          id: 1,
          chordId: 0 as const,
          label: "G",
          color: "#fff",
          x: 50,
          y: 580,
          vx: 0,
          vy: 0,
          radius: 20
        }
      ]
    };

    const next = updateFruitSlashState(prepared, 16, ["G", "C", "D", "Em"], () => 0.5, 0);

    expect(next.lives).toBe(2);
    expect(next.fruits).toHaveLength(0);
  });
});
