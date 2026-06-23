import {
  STORAGE_KEY,
  createDefaultStorageSchema,
  loadStorage,
  saveStorage,
  updateHighScore
} from "../src/lib/storage";
import type { StorageLike } from "../src/types";

function createMemoryStorage(): StorageLike {
  const memory = new Map<string, string>();
  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      memory.set(key, value);
    },
    removeItem: (key) => {
      memory.delete(key);
    }
  };
}

describe("storage helpers", () => {
  it("falls back to defaults for invalid payloads", () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEY, "not json");

    expect(loadStorage(storage)).toEqual(createDefaultStorageSchema());
  });

  it("persists and merges high scores", () => {
    const storage = createMemoryStorage();
    saveStorage(createDefaultStorageSchema(), storage);

    updateHighScore("snake", 12, storage);
    updateHighScore("snake", 8, storage);
    updateHighScore("fruit", 30, storage);

    expect(loadStorage(storage)).toMatchObject({
      snakeHighScore: 12,
      fruitSlashHighScore: 30
    });
  });
});
