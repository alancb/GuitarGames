export type ChordId = 0 | 1 | 2 | 3;

export interface AudioFingerprint {
  bands: number[];
  dominantFrequency: number;
  spectralCentroid: number;
  spectralSpread: number;
  level: number;
}

export interface ChordTemplate {
  chordId: ChordId;
  label: string;
  fingerprint: AudioFingerprint;
  threshold: number;
  stability: number;
}

export interface CalibrationProfile {
  version: 1;
  createdAt: string;
  debounceMs: number;
  noiseFloor: number;
  templates: ChordTemplate[];
}

export interface ClassifierResult {
  chordId: ChordId | null;
  confidence: number;
  inputLevel: number;
  timestamp: number;
  label?: string;
}

export interface GameSessionState {
  score: number;
  isPaused: boolean;
  isGameOver: boolean;
  highScoreBeat: boolean;
}

export interface StorageSchema {
  version: 1;
  calibrationProfile: CalibrationProfile | null;
  snakeHighScore: number;
  fruitSlashHighScore: number;
  settings: {
    muted: boolean;
    helpDismissed: boolean;
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AudioMonitor {
  stop(): void;
}

export interface AudioInput {
  isSupported(): boolean;
  requestPermission(): Promise<void>;
  captureCalibrationSample(label: string): Promise<AudioFingerprint>;
  createMonitor(
    profile: CalibrationProfile,
    onResult: (result: ClassifierResult) => void
  ): AudioMonitor;
  dispose(): void;
}

export interface CalibrationDraftChord {
  label: string;
  samples: AudioFingerprint[];
}

export type GameKey = "snake" | "fruit";
