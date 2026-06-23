import {
  averageFingerprints,
  captureFingerprintFromAnalyser,
  fingerprintSimilarity
} from "./fingerprint";
import type {
  AudioFingerprint,
  AudioInput,
  AudioMonitor,
  CalibrationProfile,
  ClassifierResult
} from "../types";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export class BrowserChordInput implements AudioInput {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;

  private readFingerprint(): AudioFingerprint {
    if (!this.context || !this.analyser) {
      throw new Error("Microphone analyzer failed to initialize.");
    }

    return captureFingerprintFromAnalyser(
      this.analyser,
      this.context.sampleRate
    );
  }

  private async measureBaseline(sampleCount = 6, intervalMs = 45): Promise<number> {
    const levels: number[] = [];

    for (let index = 0; index < sampleCount; index += 1) {
      levels.push(this.readFingerprint().level);
      await delay(intervalMs);
    }

    levels.sort((left, right) => left - right);
    const median = levels[Math.floor(levels.length / 2)] ?? 0;
    return Math.max(median, 0.00035);
  }

  isSupported(): boolean {
    return Boolean(
      "mediaDevices" in navigator &&
        typeof navigator.mediaDevices.getUserMedia === "function" &&
        ("AudioContext" in window || "webkitAudioContext" in window)
    );
  }

  async requestPermission(): Promise<void> {
    if (!this.isSupported()) {
      throw new Error("This browser does not support the microphone APIs required for play.");
    }

    const ContextCtor = window.AudioContext ?? window.webkitAudioContext;
    if (!ContextCtor) {
      throw new Error("No compatible AudioContext constructor is available.");
    }

    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
    }

    if (!this.context) {
      this.context = new ContextCtor();
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    if (!this.source || !this.analyser) {
      this.source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 4096;
      this.analyser.smoothingTimeConstant = 0.55;
      this.source.connect(this.analyser);
    }
  }

  async captureCalibrationSample(_label: string): Promise<AudioFingerprint> {
    await this.requestPermission();

    if (!this.context || !this.analyser) {
      throw new Error("Microphone analyzer failed to initialize.");
    }

    const baselineLevel = await this.measureBaseline();
    const triggerLevel = Math.max(
      baselineLevel * 2.1,
      baselineLevel + 0.0016,
      0.0016
    );
    const sustainLevel = Math.max(
      baselineLevel * 1.4,
      baselineLevel + 0.00075,
      0.00095
    );
    const startTime = performance.now();
    let peakLevel = baselineLevel;

    while (performance.now() - startTime < 4200) {
      const fingerprint = this.readFingerprint();
      peakLevel = Math.max(peakLevel, fingerprint.level);

      if (fingerprint.level >= triggerLevel) {
        const burst: AudioFingerprint[] = [fingerprint];
        const burstStart = performance.now();

        while (performance.now() - burstStart < 420) {
          await delay(45);
          const nextFingerprint = this.readFingerprint();
          peakLevel = Math.max(peakLevel, nextFingerprint.level);

          if (nextFingerprint.level >= sustainLevel) {
            burst.push(nextFingerprint);
          }
        }

        if (burst.length >= 3) {
          const strongestFrames = burst
            .slice()
            .sort((left, right) => right.level - left.level)
            .slice(0, Math.min(6, burst.length));

          return averageFingerprints(strongestFrames);
        }
      }

      await delay(45);
    }

    throw new Error(
      `No clean strum was detected. Peak level reached ${peakLevel.toFixed(4)}. Try moving closer to the mic and let the chord ring a moment longer.`
    );
  }

  createMonitor(
    profile: CalibrationProfile,
    onResult: (result: ClassifierResult) => void
  ): AudioMonitor {
    if (!this.context || !this.analyser) {
      throw new Error("Microphone access must be granted before monitoring starts.");
    }

    let stopped = false;
    let lastEmission = 0;
    let lastChord: number | null = null;
    let ambientLevel = Math.max(profile.noiseFloor * 0.6, 0.00035);

    const intervalId = window.setInterval(() => {
      if (stopped || !this.context || !this.analyser) {
        return;
      }

      const fingerprint = this.readFingerprint();
      const gateLevel = Math.max(
        profile.noiseFloor * 0.58,
        ambientLevel * 1.75,
        0.00085
      );

      if (fingerprint.level < gateLevel) {
        ambientLevel = ambientLevel * 0.88 + fingerprint.level * 0.12;
        return;
      }

      const ranked = profile.templates
        .map((template) => ({
          template,
          confidence: fingerprintSimilarity(template.fingerprint, fingerprint)
        }))
        .sort((left, right) => right.confidence - left.confidence);

      const bestMatch = ranked[0];
      const runnerUp = ranked[1];

      if (!bestMatch) {
        return;
      }

      const margin = bestMatch.confidence - (runnerUp?.confidence ?? 0);
      const now = Date.now();
      const confidenceFloor = Math.max(
        0.72,
        bestMatch.template.threshold - 0.05
      );

      if (
        bestMatch.confidence < confidenceFloor ||
        margin < 0.015 ||
        (lastChord === bestMatch.template.chordId && now - lastEmission < profile.debounceMs)
      ) {
        return;
      }

      lastChord = bestMatch.template.chordId;
      lastEmission = now;

      onResult({
        chordId: bestMatch.template.chordId,
        confidence: bestMatch.confidence,
        inputLevel: fingerprint.level,
        timestamp: now,
        label: bestMatch.template.label
      });
    }, 90);

    return {
      stop: () => {
        stopped = true;
        window.clearInterval(intervalId);
      }
    };
  }

  dispose(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.context?.close().catch(() => undefined);
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.context = null;
  }
}
