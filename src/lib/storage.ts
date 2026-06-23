import type { CalibrationProfile, StorageLike, StorageSchema } from "../types";

export const STORAGE_KEY = "chord-current.storage.v1";

export function createDefaultStorageSchema(): StorageSchema {
  return {
    version: 1,
    calibrationProfile: null,
    snakeHighScore: 0,
    fruitSlashHighScore: 0,
    settings: {
      muted: false,
      helpDismissed: false
    }
  };
}

export function loadStorage(storage: StorageLike = window.localStorage): StorageSchema {
  const rawValue = storage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return createDefaultStorageSchema();
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StorageSchema> | null;
    if (!parsed || parsed.version !== 1) {
      return createDefaultStorageSchema();
    }

    return {
      ...createDefaultStorageSchema(),
      ...parsed,
      settings: {
        ...createDefaultStorageSchema().settings,
        ...parsed.settings
      }
    };
  } catch {
    return createDefaultStorageSchema();
  }
}

export function saveStorage(
  schema: StorageSchema,
  storage: StorageLike = window.localStorage
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(schema));
}

export function saveCalibrationProfile(
  profile: CalibrationProfile,
  storage: StorageLike = window.localStorage
): StorageSchema {
  const schema = loadStorage(storage);
  schema.calibrationProfile = profile;
  saveStorage(schema, storage);
  return schema;
}

export function updateHighScore(
  game: "snake" | "fruit",
  nextScore: number,
  storage: StorageLike = window.localStorage
): StorageSchema {
  const schema = loadStorage(storage);

  if (game === "snake") {
    schema.snakeHighScore = Math.max(schema.snakeHighScore, nextScore);
  } else {
    schema.fruitSlashHighScore = Math.max(schema.fruitSlashHighScore, nextScore);
  }

  saveStorage(schema, storage);
  return schema;
}
