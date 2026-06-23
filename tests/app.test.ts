import { createApp } from "../src/app";
import type {
  AudioFingerprint,
  AudioInput,
  AudioMonitor,
  CalibrationProfile,
  ClassifierResult,
  StorageLike
} from "../src/types";

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

function makeFingerprint(): AudioFingerprint {
  return {
    bands: [0.25, 0.25, 0.25, 0.25],
    dominantFrequency: 220,
    spectralCentroid: 280,
    spectralSpread: 120,
    level: 0.04
  };
}

class FakeAudioInput implements AudioInput {
  private listener: ((result: ClassifierResult) => void) | null = null;
  private sampleQueue = new Array(16).fill(null).map(() => makeFingerprint());

  isSupported(): boolean {
    return true;
  }

  async requestPermission(): Promise<void> {
    return Promise.resolve();
  }

  async captureCalibrationSample(): Promise<AudioFingerprint> {
    return this.sampleQueue.shift() ?? makeFingerprint();
  }

  createMonitor(
    _profile: CalibrationProfile,
    onResult: (result: ClassifierResult) => void
  ): AudioMonitor {
    this.listener = onResult;
    return {
      stop: () => {
        this.listener = null;
      }
    };
  }

  emitChord(chordId: 0 | 1 | 2 | 3, label: string): void {
    this.listener?.({
      chordId,
      confidence: 0.92,
      inputLevel: 0.05,
      timestamp: Date.now(),
      label
    });
  }

  dispose(): void {
    this.listener = null;
  }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("app flow", () => {
  it("walks through setup to the game menu", async () => {
    const audio = new FakeAudioInput();
    const storage = createMemoryStorage();
    const root = document.createElement("div");
    document.body.append(root);

    createApp(root, { audio, storage });

    root.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();
    expect(root.querySelector('[data-screen="permission"]')).not.toBeNull();

    root.querySelector<HTMLButtonElement>('[data-action="grant"]')?.click();
    await flushPromises();
    expect(root.querySelector('[data-screen="calibration"]')).not.toBeNull();

    const captureButtons = () =>
      root.querySelectorAll<HTMLButtonElement>("[data-capture-index]");

    for (let chordIndex = 0; chordIndex < 4; chordIndex += 1) {
      for (let sampleIndex = 0; sampleIndex < 3; sampleIndex += 1) {
        captureButtons()[chordIndex].click();
        await flushPromises();
      }

      expect(captureButtons()[chordIndex].disabled).toBe(true);
      expect(captureButtons()[chordIndex].textContent).toContain("Captured 3 / 3");
    }

    root.querySelector<HTMLButtonElement>('[data-action="finish"]')?.click();
    expect(root.querySelector('[data-screen="menu"]')).not.toBeNull();
  });

  it("unlocks the practice screen after hearing all four chords", async () => {
    const audio = new FakeAudioInput();
    const storage = createMemoryStorage();
    const root = document.createElement("div");
    document.body.append(root);

    createApp(root, { audio, storage });
    root.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-action="grant"]')?.click();
    await flushPromises();
    expect(root.querySelector('[data-screen="calibration"]')).not.toBeNull();

    const captureButtons = () =>
      root.querySelectorAll<HTMLButtonElement>("[data-capture-index]");
    for (let chordIndex = 0; chordIndex < 4; chordIndex += 1) {
      for (let sampleIndex = 0; sampleIndex < 3; sampleIndex += 1) {
        captureButtons()[chordIndex].click();
        await flushPromises();
      }
    }
    root.querySelector<HTMLButtonElement>('[data-action="finish"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-game="snake"]')?.click();

    expect(root.querySelector('[data-screen="practice"]')).not.toBeNull();
    const continueButton = root.querySelector<HTMLButtonElement>('[data-action="continue"]');
    expect(continueButton?.disabled).toBe(true);

    audio.emitChord(0, "G");
    audio.emitChord(1, "C");
    audio.emitChord(2, "D");
    audio.emitChord(3, "Em");

    expect(root.querySelector<HTMLButtonElement>('[data-action="continue"]')?.disabled).toBe(false);
  });
});
