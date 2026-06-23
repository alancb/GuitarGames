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
      this.analyser.smoothingTimeConstant = 0.72;
      this.source.connect(this.analyser);
    }
  }

  async captureCalibrationSample(_label: string): Promise<AudioFingerprint> {
    await this.requestPermission();

    if (!this.context || !this.analyser) {
      throw new Error("Microphone analyzer failed to initialize.");
    }

    const samples: AudioFingerprint[] = [];
    const startTime = performance.now();
    let armed = false;

    while (performance.now() - startTime < 2800) {
      const fingerprint = captureFingerprintFromAnalyser(
        this.analyser,
        this.context.sampleRate
      );

      if (fingerprint.level > 0.0055) {
        armed = true;
      }

      if (armed && fingerprint.level > 0.0125) {
        samples.push(fingerprint);
      }

      if (samples.length >= 5) {
        return averageFingerprints(samples);
      }

      await delay(70);
    }

    throw new Error("No strong strum was detected. Move closer to the mic and try again.");
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

    const intervalId = window.setInterval(() => {
      if (stopped || !this.context || !this.analyser) {
        return;
      }

      const fingerprint = captureFingerprintFromAnalyser(
        this.analyser,
        this.context.sampleRate
      );

      if (fingerprint.level < profile.noiseFloor) {
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

      if (
        bestMatch.confidence < bestMatch.template.threshold ||
        margin < 0.025 ||
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
