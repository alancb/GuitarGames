import type {
  AudioFingerprint,
  CalibrationDraftChord,
  CalibrationProfile,
  ChordTemplate
} from "../types";

const DEFAULT_BAND_COUNT = 8;
const MIN_FREQUENCY = 70;
const MAX_FREQUENCY = 1200;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalize(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return values.map(() => 0);
  }
  return values.map((value) => value / total);
}

function toMagnitude(db: number): number {
  return Number.isFinite(db) ? Math.pow(10, db / 20) : 0;
}

export function createFingerprintFromSpectrum(
  spectrumDb: Float32Array,
  sampleRate: number,
  bandCount = DEFAULT_BAND_COUNT
): AudioFingerprint {
  const nyquist = sampleRate / 2;
  const minIndex = Math.max(0, Math.floor((MIN_FREQUENCY / nyquist) * spectrumDb.length));
  const maxIndex = Math.min(
    spectrumDb.length - 1,
    Math.ceil((MAX_FREQUENCY / nyquist) * spectrumDb.length)
  );
  const relevantLength = Math.max(1, maxIndex - minIndex + 1);
  const bandSize = Math.max(1, Math.floor(relevantLength / bandCount));
  const rawBands = new Array(bandCount).fill(0);
  let dominantIndex = minIndex;
  let dominantValue = -Infinity;
  let weightedFrequency = 0;
  let totalMagnitude = 0;

  for (let index = minIndex; index <= maxIndex; index += 1) {
    const magnitude = toMagnitude(spectrumDb[index]);
    const frequency = (index / spectrumDb.length) * nyquist;
    const bandIndex = Math.min(
      bandCount - 1,
      Math.floor((index - minIndex) / bandSize)
    );

    rawBands[bandIndex] += magnitude;
    weightedFrequency += magnitude * frequency;
    totalMagnitude += magnitude;

    if (magnitude > dominantValue) {
      dominantValue = magnitude;
      dominantIndex = index;
    }
  }

  const centroid = totalMagnitude > 0 ? weightedFrequency / totalMagnitude : 0;
  let spreadAccumulator = 0;

  for (let index = minIndex; index <= maxIndex; index += 1) {
    const magnitude = toMagnitude(spectrumDb[index]);
    const frequency = (index / spectrumDb.length) * nyquist;
    spreadAccumulator += magnitude * Math.pow(frequency - centroid, 2);
  }

  const spread = totalMagnitude > 0 ? Math.sqrt(spreadAccumulator / totalMagnitude) : 0;
  const dominantFrequency = (dominantIndex / spectrumDb.length) * nyquist;
  const normalizedBands = normalize(rawBands);
  const level = totalMagnitude / relevantLength;

  return {
    bands: normalizedBands,
    dominantFrequency,
    spectralCentroid: centroid,
    spectralSpread: spread,
    level
  };
}

export function averageFingerprints(samples: AudioFingerprint[]): AudioFingerprint {
  const firstSample = samples[0];

  if (!firstSample) {
    throw new Error("Cannot average an empty sample set.");
  }

  const bandCount = firstSample.bands.length;
  const bands = new Array(bandCount).fill(0);
  let dominantFrequency = 0;
  let spectralCentroid = 0;
  let spectralSpread = 0;
  let level = 0;

  for (const sample of samples) {
    sample.bands.forEach((band, index) => {
      bands[index] += band;
    });
    dominantFrequency += sample.dominantFrequency;
    spectralCentroid += sample.spectralCentroid;
    spectralSpread += sample.spectralSpread;
    level += sample.level;
  }

  return {
    bands: normalize(bands),
    dominantFrequency: dominantFrequency / samples.length,
    spectralCentroid: spectralCentroid / samples.length,
    spectralSpread: spectralSpread / samples.length,
    level: level / samples.length
  };
}

function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (!leftMagnitude || !rightMagnitude) {
    return 0;
  }

  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

export function fingerprintSimilarity(
  left: AudioFingerprint,
  right: AudioFingerprint
): number {
  const bandScore = cosineSimilarity(left.bands, right.bands);
  const dominantScore = 1 - clamp(Math.abs(left.dominantFrequency - right.dominantFrequency) / 420, 0, 1);
  const centroidScore = 1 - clamp(Math.abs(left.spectralCentroid - right.spectralCentroid) / 550, 0, 1);
  const spreadScore = 1 - clamp(Math.abs(left.spectralSpread - right.spectralSpread) / 700, 0, 1);

  return clamp(
    bandScore * 0.6 + dominantScore * 0.2 + centroidScore * 0.15 + spreadScore * 0.05,
    0,
    1
  );
}

function calculateStability(template: AudioFingerprint, samples: AudioFingerprint[]): number {
  const similarities = samples.map((sample) => fingerprintSimilarity(sample, template));
  return similarities.reduce((sum, value) => sum + value, 0) / similarities.length;
}

function buildTemplate(chordId: 0 | 1 | 2 | 3, draft: CalibrationDraftChord): ChordTemplate {
  const fingerprint = averageFingerprints(draft.samples);
  const stability = calculateStability(fingerprint, draft.samples);
  const threshold = clamp(0.72 + stability * 0.2, 0.78, 0.94);

  return {
    chordId,
    label: draft.label.trim() || `Chord ${chordId + 1}`,
    fingerprint,
    threshold,
    stability
  };
}

export function createCalibrationProfile(drafts: CalibrationDraftChord[]): CalibrationProfile {
  if (drafts.length !== 4 || drafts.some((draft) => draft.samples.length < 3)) {
    throw new Error("All four chords need at least three samples.");
  }

  const templates = drafts.map((draft, index) =>
    buildTemplate(index as 0 | 1 | 2 | 3, draft)
  );
  const averageLevel =
    templates.reduce((sum, template) => sum + template.fingerprint.level, 0) / templates.length;

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    debounceMs: 325,
    noiseFloor: averageLevel * 0.34,
    templates
  };
}

export function captureFingerprintFromAnalyser(
  analyser: AnalyserNode,
  sampleRate: number
): AudioFingerprint {
  const frequencyData = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(frequencyData);
  return createFingerprintFromSpectrum(frequencyData, sampleRate);
}
