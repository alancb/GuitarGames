import { createCalibrationProfile } from "./audio/fingerprint";
import {
  FRUIT_HEIGHT,
  FRUIT_WIDTH,
  createInitialFruitSlashState,
  sliceFruitByChord,
  updateFruitSlashState
} from "./games/fruitSlash";
import {
  chordDirectionMap,
  createInitialSnakeState,
  queueSnakeDirection,
  stepSnakeState,
  type Direction
} from "./games/snake";
import {
  createDefaultStorageSchema,
  loadStorage,
  saveStorage,
  updateHighScore
} from "./lib/storage";
import type {
  AudioInput,
  AudioMonitor,
  CalibrationDraftChord,
  CalibrationProfile,
  ChordId,
  GameKey,
  StorageLike,
  StorageSchema
} from "./types";

const DEFAULT_CHORD_LABELS = ["G Major", "C Major", "D Major", "E Minor"];
const CHORD_COLORS = ["#ff8f3f", "#4ecdc4", "#f72585", "#ffd166"];

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createCalibrationDraft(): CalibrationDraftChord[] {
  return DEFAULT_CHORD_LABELS.map((label) => ({
    label,
    samples: []
  }));
}

function getChordActionLabel(game: GameKey, chordId: ChordId): string {
  if (game === "snake") {
    const directionLabels: Record<Direction, string> = {
      up: "Move Up",
      right: "Move Right",
      down: "Move Down",
      left: "Move Left"
    };
    return directionLabels[chordDirectionMap[chordId]];
  }

  return "Slice Matching Fruit";
}

function createSparklineMarkup(chord: CalibrationDraftChord): string {
  return chord.samples
    .map(
      () => '<span class="sample-dot sample-dot--filled" aria-hidden="true"></span>'
    )
    .join("")
    .concat(
      new Array(Math.max(0, 3 - chord.samples.length))
        .fill('<span class="sample-dot" aria-hidden="true"></span>')
        .join("")
    );
}

function drawNoiseStripes(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();
  ctx.globalAlpha = 0.06;
  for (let index = 0; index < 18; index += 1) {
    ctx.fillStyle = index % 2 === 0 ? "#ffe4bf" : "#0c4b6e";
    ctx.fillRect((width / 18) * index, 0, width / 36, height);
  }
  ctx.restore();
}

interface GameRuntime {
  destroy(): void;
  restart(): void;
  togglePause(): void;
}

export interface AppDependencies {
  audio: AudioInput;
  storage?: StorageLike;
}

export class App {
  private readonly container: HTMLElement;
  private readonly audio: AudioInput;
  private readonly storage: StorageLike;
  private data: StorageSchema;
  private screen: "landing" | "permission" | "calibration" | "menu" | "practice" | "snake" | "fruit" =
    "landing";
  private calibrationDraft = createCalibrationDraft();
  private calibrationMessage = "Name four chords you want to practice, then capture three strong strums for each.";
  private calibrationBusyIndex: number | null = null;
  private pendingGame: GameKey = "snake";
  private heardChordIds = new Set<ChordId>();
  private lastHeardLabel = "";
  private activeMonitor: AudioMonitor | null = null;
  private activeRuntime: GameRuntime | null = null;

  constructor(container: HTMLElement, dependencies: AppDependencies) {
    this.container = container;
    this.audio = dependencies.audio;
    this.storage = dependencies.storage ?? window.localStorage;
    this.data = loadStorage(this.storage);
  }

  mount(): void {
    this.render();
  }

  destroy(): void {
    this.stopMonitor();
    this.activeRuntime?.destroy();
    this.audio.dispose();
  }

  private render(): void {
    switch (this.screen) {
      case "landing":
        this.renderLanding();
        break;
      case "permission":
        this.renderPermission();
        break;
      case "calibration":
        this.renderCalibration();
        break;
      case "menu":
        this.renderMenu();
        break;
      case "practice":
        this.renderPractice();
        break;
      case "snake":
        this.renderSnake();
        break;
      case "fruit":
        this.renderFruit();
        break;
    }
  }

  private setScreen(
    screen: "landing" | "permission" | "calibration" | "menu" | "practice" | "snake" | "fruit"
  ): void {
    const leavingGame = this.screen === "snake" || this.screen === "fruit";
    const leavingPractice = this.screen === "practice";

    if (leavingGame) {
      this.activeRuntime?.destroy();
      this.activeRuntime = null;
      this.stopMonitor();
    }

    if (leavingPractice) {
      this.stopMonitor();
    }

    this.screen = screen;
    this.render();
  }

  private setView(content: string): void {
    this.container.innerHTML = `
      <div class="site-shell">
        <div class="ambient ambient--one"></div>
        <div class="ambient ambient--two"></div>
        <main class="app-frame">${content}</main>
      </div>
    `;
  }

  private renderLanding(): void {
    const hasCalibration = Boolean(this.data.calibrationProfile);
    const unsupported = !this.audio.isSupported();

    this.setView(`
      <section class="hero-screen" data-screen="landing">
        <div class="hero-copy">
          <p class="eyebrow">Static guitar arcade</p>
          <h1>Chord Current</h1>
          <p class="lede">
            Ride your own four-chord pocket through two browser-local games.
            Your calibration and scores stay on this device, and nowhere else.
          </p>
          <div class="hero-actions">
            <button class="button button--primary" data-action="start">
              ${hasCalibration ? "Jump Back In" : "Tune Up & Play"}
            </button>
            <button class="button button--ghost" data-action="recalibrate">
              ${hasCalibration ? "Recalibrate Chords" : "See Setup Flow"}
            </button>
          </div>
          ${
            unsupported
              ? `<div class="warning-card">
                   <strong>Mic support missing.</strong>
                   <span>This browser needs Web Audio + microphone permissions to play.</span>
                 </div>`
              : ""
          }
        </div>
        <div class="score-panel">
          <div class="score-tile">
            <span>Snake high score</span>
            <strong>${this.data.snakeHighScore}</strong>
          </div>
          <div class="score-tile">
            <span>Fruit Slash high score</span>
            <strong>${this.data.fruitSlashHighScore}</strong>
          </div>
          <div class="score-note">
            <span>Signal path</span>
            <strong>Microphone only</strong>
            <small>Best on laptop speakers muted and the guitar close to your mic.</small>
          </div>
        </div>
      </section>
    `);

    this.container.querySelector('[data-action="start"]')?.addEventListener("click", () => {
      if (unsupported) {
        return;
      }

      if (hasCalibration) {
        this.setScreen("menu");
      } else {
        this.setScreen("permission");
      }
    });

    this.container
      .querySelector('[data-action="recalibrate"]')
      ?.addEventListener("click", () => {
        this.calibrationDraft = createCalibrationDraft();
        this.calibrationMessage = "Name four chords you want to practice, then capture three strong strums for each.";
        this.setScreen(unsupported ? "landing" : "permission");
      });
  }

  private renderPermission(): void {
    this.setView(`
      <section class="card-screen" data-screen="permission">
        <div class="panel panel--wide">
          <p class="eyebrow">Step 1</p>
          <h2>Open the microphone lane</h2>
          <p>
            We only use live microphone input in this tab. Nothing is uploaded,
            stored remotely, or shared.
          </p>
          <ul class="simple-list">
            <li>Use a quiet room if you can.</li>
            <li>Place the guitar close to the laptop or USB mic.</li>
            <li>Mute browser audio to avoid feedback during calibration.</li>
          </ul>
          <div class="hero-actions">
            <button class="button button--primary" data-action="grant">Enable Microphone</button>
            <button class="button button--ghost" data-action="back">Back</button>
          </div>
          <p class="inline-note" data-permission-status></p>
        </div>
      </section>
    `);

    const status = this.container.querySelector("[data-permission-status]") as HTMLElement;
    this.container.querySelector('[data-action="back"]')?.addEventListener("click", () => {
      this.setScreen("landing");
    });

    this.container.querySelector('[data-action="grant"]')?.addEventListener("click", async () => {
      status.textContent = "Requesting microphone permission...";
      try {
        await this.audio.requestPermission();
        this.setScreen("calibration");
      } catch (error) {
        status.textContent =
          error instanceof Error
            ? error.message
            : "Microphone access was blocked.";
      }
    });
  }

  private syncCalibrationLabels(): void {
    const inputs = Array.from(
      this.container.querySelectorAll<HTMLInputElement>("[data-label-input]")
    );

    inputs.forEach((input, index) => {
      this.calibrationDraft[index].label = input.value.trim() || DEFAULT_CHORD_LABELS[index];
    });
  }

  private renderCalibration(): void {
    const allReady = this.calibrationDraft.every((chord) => chord.samples.length >= 3);
    this.setView(`
      <section class="card-screen" data-screen="calibration">
        <div class="panel panel--wide panel--calibration">
          <div class="section-header">
            <div class="section-heading">
              <p class="eyebrow">Step 2</p>
              <h2>Calibrate your four-chord control set</h2>
            </div>
            <button class="button button--ghost" data-action="cancel">Cancel</button>
          </div>
          <p class="inline-note">${escapeHtml(this.calibrationMessage)}</p>
          <div class="chord-grid">
            ${this.calibrationDraft
              .map(
                (chord, index) => `
                  <article class="chord-card chord-card--calibration">
                    <label class="field-label" for="chord-${index}">Chord ${index + 1}</label>
                    <input
                      id="chord-${index}"
                      class="text-input"
                      data-label-input
                      data-index="${index}"
                      value="${escapeHtml(chord.label)}"
                    />
                    <div class="sample-row">${createSparklineMarkup(chord)}</div>
                    <button
                      class="button button--secondary"
                      data-capture-index="${index}"
                      ${this.calibrationBusyIndex !== null ? "disabled" : ""}
                    >
                      Capture Strum ${chord.samples.length + 1} / 3
                    </button>
                  </article>
                `
              )
              .join("")}
          </div>
          <div class="hero-actions hero-actions--form">
            <button class="button button--primary" data-action="finish" ${allReady ? "" : "disabled"}>
              Save Calibration
            </button>
            <button class="button button--ghost" data-action="reset">Reset Samples</button>
          </div>
        </div>
      </section>
    `);

    this.container.querySelector('[data-action="cancel"]')?.addEventListener("click", () => {
      this.setScreen("landing");
    });

    this.container.querySelector('[data-action="reset"]')?.addEventListener("click", () => {
      this.calibrationDraft = createCalibrationDraft();
      this.calibrationMessage = "Fresh slate ready. Capture three clean strums for each chord.";
      this.render();
    });

    this.container.querySelector('[data-action="finish"]')?.addEventListener("click", () => {
      this.syncCalibrationLabels();
      const profile = createCalibrationProfile(this.calibrationDraft);
      this.data = {
        ...this.data,
        calibrationProfile: profile
      };
      saveStorage(this.data, this.storage);
      this.calibrationMessage = "Calibration saved locally.";
      this.setScreen("menu");
    });

    this.container.querySelectorAll<HTMLElement>("[data-capture-index]").forEach((button) => {
      button.addEventListener("click", async () => {
        this.syncCalibrationLabels();
        const index = Number(button.dataset.captureIndex);
        this.calibrationBusyIndex = index;
        this.calibrationMessage = `Listening for ${this.calibrationDraft[index].label}. Strum once, clearly.`;
        this.render();

        try {
          const sample = await this.audio.captureCalibrationSample(this.calibrationDraft[index].label);
          const samples = this.calibrationDraft[index].samples.slice(0, 2);
          this.calibrationDraft[index].samples = [...samples, sample];
          this.calibrationMessage = `${this.calibrationDraft[index].label} sample ${this.calibrationDraft[index].samples.length} captured.`;
        } catch (error) {
          this.calibrationMessage =
            error instanceof Error
              ? error.message
              : "Sample capture failed. Try again.";
        } finally {
          this.calibrationBusyIndex = null;
          this.render();
        }
      });
    });
  }

  private renderMenu(): void {
    const profile = this.data.calibrationProfile;
    if (!profile) {
      this.data = createDefaultStorageSchema();
      saveStorage(this.data, this.storage);
      this.setScreen("landing");
      return;
    }

    this.setView(`
      <section class="card-screen" data-screen="menu">
        <div class="panel panel--wide">
          <div class="section-header">
            <div>
              <p class="eyebrow">Chord deck ready</p>
              <h2>Pick a wave</h2>
            </div>
            <button class="button button--ghost" data-action="home">Home</button>
          </div>
          <div class="chip-row">
            ${profile.templates
              .map(
                (template, index) => `
                  <span class="chord-chip" style="--chip-color:${CHORD_COLORS[index]}">
                    ${escapeHtml(template.label)}
                  </span>
                `
              )
              .join("")}
          </div>
          <div class="game-grid">
            <article class="game-card">
              <p class="eyebrow">Grid chase</p>
              <h3>Snake</h3>
              <p>Each chord is a direction. Apples speed everything up.</p>
              <strong>Best: ${this.data.snakeHighScore}</strong>
              <button class="button button--primary" data-game="snake">Control Check</button>
            </article>
            <article class="game-card">
              <p class="eyebrow">Arcade timing</p>
              <h3>Fruit Slash</h3>
              <p>Strum the matching chord while fruits cross the hit window.</p>
              <strong>Best: ${this.data.fruitSlashHighScore}</strong>
              <button class="button button--primary" data-game="fruit">Control Check</button>
            </article>
          </div>
          <div class="hero-actions">
            <button class="button button--ghost" data-action="recalibrate">Recalibrate</button>
          </div>
        </div>
      </section>
    `);

    this.container.querySelector('[data-action="home"]')?.addEventListener("click", () => {
      this.setScreen("landing");
    });
    this.container
      .querySelector('[data-action="recalibrate"]')
      ?.addEventListener("click", () => {
        this.calibrationDraft = createCalibrationDraft();
        this.calibrationMessage = "Swap out any chords you want, then capture three new strums each.";
        this.setScreen("calibration");
      });
    this.container.querySelectorAll<HTMLElement>("[data-game]").forEach((button) => {
      button.addEventListener("click", () => {
        this.pendingGame = button.dataset.game === "fruit" ? "fruit" : "snake";
        this.heardChordIds.clear();
        this.lastHeardLabel = "";
        this.startPracticeMonitor();
        this.setScreen("practice");
      });
    });
  }

  private startPracticeMonitor(): void {
    const profile = this.data.calibrationProfile;
    if (!profile) {
      return;
    }

    this.stopMonitor();
    this.activeMonitor = this.audio.createMonitor(profile, (result) => {
      if (result.chordId === null) {
        return;
      }
      this.heardChordIds.add(result.chordId);
      this.lastHeardLabel = result.label ?? profile.templates[result.chordId].label;
      if (this.screen === "practice") {
        this.render();
      }
    });
  }

  private stopMonitor(): void {
    this.activeMonitor?.stop();
    this.activeMonitor = null;
  }

  private renderPractice(): void {
    const profile = this.data.calibrationProfile as CalibrationProfile | null;
    if (!profile) {
      this.setScreen("landing");
      return;
    }

    this.setView(`
      <section class="card-screen" data-screen="practice">
        <div class="panel panel--wide">
          <div class="section-header">
            <div>
              <p class="eyebrow">Control check</p>
              <h2>${this.pendingGame === "snake" ? "Verify directions" : "Verify hit chords"}</h2>
            </div>
            <button class="button button--ghost" data-action="back">Back</button>
          </div>
          <p class="inline-note">
            Strum each chord once. ${this.lastHeardLabel ? `Last heard: ${escapeHtml(this.lastHeardLabel)}.` : ""}
          </p>
          <div class="chord-grid">
            ${profile.templates
              .map(
                (template, index) => `
                  <article class="practice-card ${this.heardChordIds.has(index as ChordId) ? "practice-card--heard" : ""}">
                    <span class="practice-pill" style="--pill-color:${CHORD_COLORS[index]}">
                      ${escapeHtml(template.label)}
                    </span>
                    <strong>${escapeHtml(getChordActionLabel(this.pendingGame, index as ChordId))}</strong>
                  </article>
                `
              )
              .join("")}
          </div>
          <div class="hero-actions">
            <button class="button button--primary" data-action="continue" ${this.heardChordIds.size === 4 ? "" : "disabled"}>
              Start ${this.pendingGame === "snake" ? "Snake" : "Fruit Slash"}
            </button>
          </div>
        </div>
      </section>
    `);

    this.container.querySelector('[data-action="back"]')?.addEventListener("click", () => {
      this.setScreen("menu");
    });
    this.container.querySelector('[data-action="continue"]')?.addEventListener("click", () => {
      this.setScreen(this.pendingGame);
    });
  }

  private renderSnake(): void {
    const profile = this.data.calibrationProfile;
    if (!profile) {
      this.setScreen("landing");
      return;
    }

    this.setView(`
      <section class="game-screen" data-screen="snake">
        <div class="panel panel--wide">
          <div class="section-header">
            <div>
              <p class="eyebrow">Snake</p>
              <h2>Strum to steer the current</h2>
            </div>
            <div class="hero-actions">
              <button class="button button--ghost" data-action="menu">Menu</button>
              <button class="button button--ghost" data-action="restart">Restart</button>
              <button class="button button--primary" data-action="pause">Pause</button>
            </div>
          </div>
          <div class="hud-row">
            <span>Score <strong data-score>0</strong></span>
            <span>Best <strong data-best>${this.data.snakeHighScore}</strong></span>
            <span data-status>Ride the first turn.</span>
          </div>
          <div class="chip-row">
            ${profile.templates
              .map(
                (template, index) => `
                  <span class="chord-chip" style="--chip-color:${CHORD_COLORS[index]}">
                    ${escapeHtml(template.label)} → ${escapeHtml(getChordActionLabel("snake", index as ChordId))}
                  </span>
                `
              )
              .join("")}
          </div>
          <canvas class="game-canvas" data-canvas width="620" height="620"></canvas>
        </div>
      </section>
    `);

    const canvas = this.container.querySelector("[data-canvas]") as HTMLCanvasElement;
    const score = this.container.querySelector("[data-score]") as HTMLElement;
    const best = this.container.querySelector("[data-best]") as HTMLElement;
    const status = this.container.querySelector("[data-status]") as HTMLElement;
    const pauseButton = this.container.querySelector('[data-action="pause"]') as HTMLButtonElement;

    this.activeRuntime = this.startSnakeRuntime(canvas, score, best, status, pauseButton);

    this.container.querySelector('[data-action="menu"]')?.addEventListener("click", () => {
      this.setScreen("menu");
    });
    this.container.querySelector('[data-action="restart"]')?.addEventListener("click", () => {
      this.activeRuntime?.restart();
    });
    pauseButton.addEventListener("click", () => {
      this.activeRuntime?.togglePause();
    });
  }

  private renderFruit(): void {
    const profile = this.data.calibrationProfile;
    if (!profile) {
      this.setScreen("landing");
      return;
    }

    this.setView(`
      <section class="game-screen" data-screen="fruit">
        <div class="panel panel--wide">
          <div class="section-header">
            <div>
              <p class="eyebrow">Fruit Slash</p>
              <h2>Strum when the labels cross the bay</h2>
            </div>
            <div class="hero-actions">
              <button class="button button--ghost" data-action="menu">Menu</button>
              <button class="button button--ghost" data-action="restart">Restart</button>
              <button class="button button--primary" data-action="pause">Pause</button>
            </div>
          </div>
          <div class="hud-row">
            <span>Score <strong data-score>0</strong></span>
            <span>Lives <strong data-lives>3</strong></span>
            <span>Best <strong data-best>${this.data.fruitSlashHighScore}</strong></span>
            <span data-status>Catch the window, not the noise.</span>
          </div>
          <div class="chip-row">
            ${profile.templates
              .map(
                (template, index) => `
                  <span class="chord-chip" style="--chip-color:${CHORD_COLORS[index]}">
                    ${escapeHtml(template.label)}
                  </span>
                `
              )
              .join("")}
          </div>
          <canvas class="game-canvas game-canvas--wide" data-canvas width="${FRUIT_WIDTH}" height="${FRUIT_HEIGHT}"></canvas>
        </div>
      </section>
    `);

    const canvas = this.container.querySelector("[data-canvas]") as HTMLCanvasElement;
    const score = this.container.querySelector("[data-score]") as HTMLElement;
    const lives = this.container.querySelector("[data-lives]") as HTMLElement;
    const best = this.container.querySelector("[data-best]") as HTMLElement;
    const status = this.container.querySelector("[data-status]") as HTMLElement;
    const pauseButton = this.container.querySelector('[data-action="pause"]') as HTMLButtonElement;

    this.activeRuntime = this.startFruitRuntime(canvas, score, lives, best, status, pauseButton);

    this.container.querySelector('[data-action="menu"]')?.addEventListener("click", () => {
      this.setScreen("menu");
    });
    this.container.querySelector('[data-action="restart"]')?.addEventListener("click", () => {
      this.activeRuntime?.restart();
    });
    pauseButton.addEventListener("click", () => {
      this.activeRuntime?.togglePause();
    });
  }

  private startSnakeRuntime(
    canvas: HTMLCanvasElement,
    scoreElement: HTMLElement,
    bestElement: HTMLElement,
    statusElement: HTMLElement,
    pauseButton: HTMLButtonElement
  ): GameRuntime {
    const profile = this.data.calibrationProfile as CalibrationProfile;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas rendering is unavailable in this browser.");
    }

    let state = createInitialSnakeState();
    let timeoutId: number | null = null;
    let stopped = false;

    const draw = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      const cellSize = canvas.width / state.gridSize;
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, "#0c4b6e");
      gradient.addColorStop(1, "#06263f");
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      drawNoiseStripes(context, canvas.width, canvas.height);

      context.strokeStyle = "rgba(255,255,255,0.08)";
      for (let index = 0; index <= state.gridSize; index += 1) {
        const position = index * cellSize;
        context.beginPath();
        context.moveTo(position, 0);
        context.lineTo(position, canvas.height);
        context.moveTo(0, position);
        context.lineTo(canvas.width, position);
        context.stroke();
      }

      context.fillStyle = "#ffd166";
      context.beginPath();
      context.arc(
        state.apple.x * cellSize + cellSize / 2,
        state.apple.y * cellSize + cellSize / 2,
        cellSize * 0.33,
        0,
        Math.PI * 2
      );
      context.fill();

      state.snake.forEach((segment, index) => {
        context.fillStyle = index === 0 ? "#ff8f3f" : "#4ecdc4";
        context.fillRect(
          segment.x * cellSize + 3,
          segment.y * cellSize + 3,
          cellSize - 6,
          cellSize - 6
        );
      });

      if (state.isGameOver || state.isPaused) {
        context.fillStyle = "rgba(4, 18, 29, 0.64)";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#fff6e8";
        context.font = '700 38px "Rockwell", "Georgia", serif';
        context.textAlign = "center";
        context.fillText(
          state.isGameOver ? "Run Ended" : "Paused",
          canvas.width / 2,
          canvas.height / 2
        );
      }
    };

    const syncHud = () => {
      scoreElement.textContent = `${state.score}`;
      bestElement.textContent = `${this.data.snakeHighScore}`;
      if (state.isGameOver) {
        statusElement.textContent = state.highScoreBeat
          ? "New local best. Hit restart to run it back."
          : "Wall or tail caught you. Hit restart to try again.";
      } else if (state.isPaused) {
        statusElement.textContent = "Paused between turns.";
      } else {
        statusElement.textContent = "Each apple tightens the tempo.";
      }
      pauseButton.textContent = state.isPaused ? "Resume" : "Pause";
      draw();
    };

    const tick = () => {
      if (stopped || state.isPaused || state.isGameOver) {
        return;
      }

      state = stepSnakeState(state, Math.random, this.data.snakeHighScore);

      if (state.score > this.data.snakeHighScore) {
        this.data = updateHighScore("snake", state.score, this.storage);
      }

      syncHud();

      if (!state.isGameOver) {
        timeoutId = window.setTimeout(tick, state.stepIntervalMs);
      }
    };

    this.stopMonitor();
    this.activeMonitor = this.audio.createMonitor(profile, (result) => {
      if (result.chordId === null || state.isGameOver) {
        return;
      }

      state = queueSnakeDirection(state, chordDirectionMap[result.chordId]);
      statusElement.textContent = `${result.label ?? profile.templates[result.chordId].label} locked in.`;
      draw();
    });

    timeoutId = window.setTimeout(tick, state.stepIntervalMs);
    syncHud();

    return {
      destroy: () => {
        stopped = true;
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
      },
      restart: () => {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        state = createInitialSnakeState();
        syncHud();
        timeoutId = window.setTimeout(tick, state.stepIntervalMs);
      },
      togglePause: () => {
        state = {
          ...state,
          isPaused: !state.isPaused
        };
        if (!state.isPaused && !state.isGameOver) {
          timeoutId = window.setTimeout(tick, state.stepIntervalMs);
        } else if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        syncHud();
      }
    };
  }

  private startFruitRuntime(
    canvas: HTMLCanvasElement,
    scoreElement: HTMLElement,
    livesElement: HTMLElement,
    bestElement: HTMLElement,
    statusElement: HTMLElement,
    pauseButton: HTMLButtonElement
  ): GameRuntime {
    const profile = this.data.calibrationProfile as CalibrationProfile;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas rendering is unavailable in this browser.");
    }

    let state = createInitialFruitSlashState();
    let frameId: number | null = null;
    let lastFrame = performance.now();
    let stopped = false;

    const labels = profile.templates.map((template) => template.label);

    const draw = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, "#091e2b");
      gradient.addColorStop(1, "#154c79");
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      drawNoiseStripes(context, canvas.width, canvas.height);

      context.fillStyle = "rgba(255, 255, 255, 0.14)";
      context.fillRect(0, 120, canvas.width, 6);
      context.fillRect(0, canvas.height - 96, canvas.width, 6);

      state.fruits.forEach((fruit) => {
        context.fillStyle = fruit.color;
        context.beginPath();
        context.arc(fruit.x, fruit.y, fruit.radius, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = "#07273e";
        context.font = '700 16px "Avenir Next", "Trebuchet MS", sans-serif';
        context.textAlign = "center";
        context.fillText(fruit.label, fruit.x, fruit.y + 5);
      });

      if (state.isGameOver || state.isPaused) {
        context.fillStyle = "rgba(4, 18, 29, 0.64)";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#fff6e8";
        context.font = '700 34px "Rockwell", "Georgia", serif';
        context.textAlign = "center";
        context.fillText(
          state.isGameOver ? "Session Over" : "Paused",
          canvas.width / 2,
          canvas.height / 2
        );
      }
    };

    const syncHud = () => {
      scoreElement.textContent = `${state.score}`;
      livesElement.textContent = `${state.lives}`;
      bestElement.textContent = `${this.data.fruitSlashHighScore}`;
      if (state.isGameOver) {
        statusElement.textContent = state.highScoreBeat
          ? "New local best. Queue another round whenever you're ready."
          : "Three misses ended the set. Restart for another pass.";
      } else if (state.isPaused) {
        statusElement.textContent = "Paused above the hit lane.";
      } else {
        statusElement.textContent = "Slice only when the chord label matches.";
      }
      pauseButton.textContent = state.isPaused ? "Resume" : "Pause";
      draw();
    };

    const frame = (timestamp: number) => {
      if (stopped) {
        return;
      }

      const dt = Math.min(32, timestamp - lastFrame);
      lastFrame = timestamp;

      if (!state.isPaused && !state.isGameOver) {
        state = updateFruitSlashState(
          state,
          dt,
          labels,
          Math.random,
          this.data.fruitSlashHighScore
        );
        if (state.score > this.data.fruitSlashHighScore) {
          this.data = updateHighScore("fruit", state.score, this.storage);
        }
      }

      syncHud();
      frameId = window.requestAnimationFrame(frame);
    };

    this.stopMonitor();
    this.activeMonitor = this.audio.createMonitor(profile, (result) => {
      if (result.chordId === null || state.isGameOver) {
        return;
      }

      state = sliceFruitByChord(state, result.chordId, this.data.fruitSlashHighScore);
      if (state.score > this.data.fruitSlashHighScore) {
        this.data = updateHighScore("fruit", state.score, this.storage);
      }
      statusElement.textContent = `${result.label ?? profile.templates[result.chordId].label} cut through the lane.`;
      syncHud();
    });

    frameId = window.requestAnimationFrame(frame);
    syncHud();

    return {
      destroy: () => {
        stopped = true;
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId);
        }
      },
      restart: () => {
        state = createInitialFruitSlashState();
        lastFrame = performance.now();
        syncHud();
      },
      togglePause: () => {
        state = {
          ...state,
          isPaused: !state.isPaused
        };
        syncHud();
      }
    };
  }
}

export function createApp(container: HTMLElement, dependencies: AppDependencies): App {
  const app = new App(container, dependencies);
  app.mount();
  return app;
}
