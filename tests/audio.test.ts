import {
  averageFingerprints,
  createCalibrationProfile,
  fingerprintSimilarity
} from "../src/audio/fingerprint";
import type { AudioFingerprint, CalibrationDraftChord } from "../src/types";

function makeFingerprint(
  bands: number[],
  dominantFrequency: number,
  spectralCentroid: number,
  level = 0.04
): AudioFingerprint {
  return {
    bands,
    dominantFrequency,
    spectralCentroid,
    spectralSpread: 120,
    level
  };
}

describe("audio fingerprint helpers", () => {
  it("keeps identical fingerprints highly similar", () => {
    const fingerprint = makeFingerprint([0.1, 0.3, 0.25, 0.35], 220, 280);

    expect(fingerprintSimilarity(fingerprint, fingerprint)).toBeGreaterThan(0.99);
  });

  it("separates clearly different fingerprints", () => {
    const left = makeFingerprint([0.5, 0.3, 0.15, 0.05], 196, 250);
    const right = makeFingerprint([0.05, 0.1, 0.35, 0.5], 440, 620);

    expect(fingerprintSimilarity(left, right)).toBeLessThan(0.75);
  });

  it("builds a calibration profile with bounded thresholds", () => {
    const drafts: CalibrationDraftChord[] = [
      {
        label: "G",
        samples: [
          makeFingerprint([0.2, 0.4, 0.2, 0.2], 200, 260),
          makeFingerprint([0.22, 0.39, 0.2, 0.19], 204, 262),
          averageFingerprints([
            makeFingerprint([0.2, 0.4, 0.2, 0.2], 200, 260),
            makeFingerprint([0.22, 0.39, 0.2, 0.19], 204, 262)
          ])
        ]
      },
      {
        label: "C",
        samples: new Array(3).fill(null).map(() =>
          makeFingerprint([0.18, 0.22, 0.3, 0.3], 175, 245)
        )
      },
      {
        label: "D",
        samples: new Array(3).fill(null).map(() =>
          makeFingerprint([0.28, 0.22, 0.22, 0.28], 235, 310)
        )
      },
      {
        label: "Em",
        samples: new Array(3).fill(null).map(() =>
          makeFingerprint([0.12, 0.36, 0.28, 0.24], 164, 220)
        )
      }
    ];

    const profile = createCalibrationProfile(drafts);

    expect(profile.templates).toHaveLength(4);
    expect(profile.templates.every((template) => template.threshold >= 0.74)).toBe(true);
    expect(profile.noiseFloor).toBeGreaterThan(0);
  });
});
