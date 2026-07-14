/**
 * Procedural sound — a tiny Web Audio synth (no asset files, no deps). It plays
 * short cues on key events: ending a turn, a tech completing, a region captured or
 * lost, a rival eliminated, war/peace, danger (famine/bankruptcy), and win/lose.
 *
 * Everything is synthesised from oscillators + gain envelopes at play time, so the
 * bundle ships no audio and `package.json` deps stay `{}`. The module is UI-only:
 * it observes what the sim reports and makes noise; it never touches game state.
 *
 * Autoplay policy: browsers block audio until a user gesture, so the AudioContext
 * is created lazily on the first `play()` (which always follows a click/keypress)
 * and `resume()`d each time. A persisted master mute silences everything.
 *
 * The cue-selection logic (`outcomeCue`) is a pure function of the turn summary so
 * it can be unit-tested in the DOM-less test environment.
 */

import type { TurnSummary } from "@/systems/summary";

export type Cue =
  | "endTurn"
  | "build"
  | "tech"
  | "capture"
  | "loss"
  | "war"
  | "peace"
  | "eliminate"
  | "victory"
  | "defeat"
  | "alert";

/**
 * The single most salient cue a resolved turn should sound, or null for a quiet
 * turn. Pure and side-effect free — ordered so the most important news wins when
 * several things happened at once (losing ground and danger over good news).
 */
export function outcomeCue(s: TurnSummary): Cue | null {
  if (s.regionsLost.length > 0) return "loss";
  if (s.bankrupt || s.famine) return "alert";
  if (s.eliminated.length > 0) return "eliminate";
  if (s.regionsGained.length > 0) return "capture";
  if (s.warsDeclared.length > 0) return "war";
  if (s.techsCompleted.length > 0) return "tech";
  if (s.peaceMade.length > 0) return "peace";
  return null;
}

const MUTE_KEY = "gaime2:muted";

/** A cue as a short sequence of notes: [frequency Hz, start offset s, length s]. */
type Note = [freq: number, at: number, len: number];

interface CueSpec {
  wave: OscillatorType;
  notes: Note[];
  /** Peak gain for this cue (0..1) — kept low so cues never startle. */
  gain: number;
}

// Hand-tuned little motifs. Rising = good, falling = bad, dense/low = danger.
const CUES: Record<Cue, CueSpec> = {
  endTurn: { wave: "triangle", gain: 0.16, notes: [[392, 0, 0.07]] },
  build: { wave: "square", gain: 0.12, notes: [[523, 0, 0.05], [784, 0.06, 0.06]] },
  tech: { wave: "sine", gain: 0.2, notes: [[523, 0, 0.09], [659, 0.09, 0.09], [784, 0.18, 0.14]] },
  capture: { wave: "triangle", gain: 0.22, notes: [[440, 0, 0.09], [660, 0.09, 0.14]] },
  loss: { wave: "triangle", gain: 0.22, notes: [[440, 0, 0.1], [330, 0.1, 0.18]] },
  war: { wave: "sawtooth", gain: 0.18, notes: [[147, 0, 0.14], [110, 0.13, 0.22]] },
  peace: { wave: "sine", gain: 0.18, notes: [[523, 0, 0.12], [392, 0.12, 0.16]] },
  eliminate: { wave: "triangle", gain: 0.22, notes: [[392, 0, 0.09], [494, 0.09, 0.09], [587, 0.18, 0.16]] },
  victory: {
    wave: "triangle",
    gain: 0.26,
    notes: [[523, 0, 0.11], [659, 0.11, 0.11], [784, 0.22, 0.11], [1046, 0.33, 0.28]],
  },
  defeat: { wave: "sine", gain: 0.24, notes: [[440, 0, 0.16], [349, 0.16, 0.16], [262, 0.32, 0.32]] },
  alert: { wave: "square", gain: 0.16, notes: [[880, 0, 0.08], [880, 0.14, 0.08]] },
};

const VOLUME_KEY = "gaime2:volume";
const DEFAULT_VOLUME = 0.7;

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = readMuted();
let volume = readVolume();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function readVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    return clampVolume(Number(raw));
  } catch {
    return DEFAULT_VOLUME;
  }
}

/** Keep volume a finite number in [0, 1]; fall back to the default on garbage. */
function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_VOLUME;
  return Math.max(0, Math.min(1, v));
}

/** Current master volume, 0..1 (drives the options slider). */
export function getVolume(): number {
  return volume;
}

/** Set and persist the master volume (0..1); applies live to the mix. */
export function setVolume(next: number): number {
  volume = clampVolume(next);
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    /* storage unavailable — volume simply won't persist */
  }
  if (masterGain) masterGain.gain.value = volume;
  return volume;
}

/** Whether sound is currently muted (drives the toggle's icon/label). */
export function isMuted(): boolean {
  return muted;
}

/** Set and persist the master mute. Returns the new state for convenience. */
export function setMuted(next: boolean): boolean {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    /* storage unavailable — mute simply won't persist */
  }
  return muted;
}

/** Flip and persist the master mute; returns the new state. */
export function toggleMuted(): boolean {
  return setMuted(!muted);
}

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
      // All cues route through one master gain so the volume slider is a single knob.
      masterGain = ctx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  return ctx;
}

/** The node cues connect to — the master gain if present, else the raw output. */
function outputNode(ac: AudioContext): AudioNode {
  return masterGain ?? ac.destination;
}

/** Play a cue. No-op when muted or when Web Audio is unavailable. */
export function play(cue: Cue): void {
  if (muted) return;
  const ac = audioContext();
  if (!ac) return;
  // Autoplay policy: a context can start suspended until a gesture resumes it.
  if (ac.state === "suspended") void ac.resume();

  const spec = CUES[cue];
  const t0 = ac.currentTime;
  for (const [freq, at, len] of spec.notes) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = spec.wave;
    osc.frequency.setValueAtTime(freq, t0 + at);
    // Quick attack, exponential release — a soft pluck, never a click or drone.
    const start = t0 + at;
    const end = start + len;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(spec.gain, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g).connect(outputNode(ac));
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

/* ------------------------------------------------------------------ *
 * Ambient bed — an optional, sparse generative motif (off by default).
 *
 * Not a continuous drone: every ~11s a soft, low pentatonic pad drifts by,
 * stepping through a fixed sequence (deterministic — no RNG, so it's testable
 * and never jarring). It sits behind its own persisted toggle and is silenced by
 * the master mute like every other cue.
 * ------------------------------------------------------------------ */

const AMBIENT_KEY = "gaime2:ambient";
const AMBIENT_PERIOD_MS = 11_000;

/** A fixed procession of calm pads (C-pentatonic voicings), looped forever. */
const AMBIENT_SEQUENCE: number[][] = [
  [131, 196, 262], // C  G  C
  [147, 220, 294], // D  A  D
  [165, 247, 330], // E  B  E
  [110, 165, 262], // A  E  C
  [131, 196, 247], // C  G  B
  [98, 147, 220], //  G  D  A
];

/** Pure: the pad voiced at `index` in the endless ambient loop. Testable. */
export function ambientMotif(index: number): number[] {
  const n = AMBIENT_SEQUENCE.length;
  return AMBIENT_SEQUENCE[((index % n) + n) % n]!;
}

let ambientEnabled = readAmbient();
let ambientTimer: number | null = null;
let ambientIndex = 0;

function readAmbient(): boolean {
  try {
    return localStorage.getItem(AMBIENT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Whether the ambient bed is currently enabled (drives its toggle). */
export function isAmbientEnabled(): boolean {
  return ambientEnabled;
}

/** Play one soft pad chord — slow attack + long release, very quiet. */
function playPad(notes: number[]): void {
  if (muted) return;
  const ac = audioContext();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  const t0 = ac.currentTime;
  const len = 4.5;
  for (const freq of notes) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 1.2); // gentle swell
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    osc.connect(g).connect(outputNode(ac));
    osc.start(t0);
    osc.stop(t0 + len + 0.05);
  }
}

function ambientTick(): void {
  if (!ambientEnabled || muted) return; // master mute silences the bed too
  playPad(ambientMotif(ambientIndex));
  ambientIndex += 1;
}

function startAmbientLoop(): void {
  if (typeof window === "undefined" || ambientTimer !== null) return;
  ambientTick(); // sound the first pad immediately for feedback
  ambientTimer = window.setInterval(ambientTick, AMBIENT_PERIOD_MS);
}

function stopAmbientLoop(): void {
  if (ambientTimer !== null) {
    clearInterval(ambientTimer);
    ambientTimer = null;
  }
}

/** Enable/disable and persist the ambient bed; starts/stops the loop. */
export function setAmbientEnabled(next: boolean): boolean {
  ambientEnabled = next;
  try {
    localStorage.setItem(AMBIENT_KEY, next ? "1" : "0");
  } catch {
    /* storage unavailable — preference just won't persist */
  }
  if (next) startAmbientLoop();
  else stopAmbientLoop();
  return ambientEnabled;
}

/** Flip and persist the ambient bed; returns the new state. */
export function toggleAmbient(): boolean {
  return setAmbientEnabled(!ambientEnabled);
}

/**
 * On boot: if the ambient bed was left enabled in a prior session, arm it to
 * start on the first user gesture (the autoplay policy blocks audio until then).
 * A no-op when disabled or already running.
 */
export function armAmbientOnGesture(): void {
  if (typeof window === "undefined" || !ambientEnabled) return;
  const start = (): void => startAmbientLoop();
  window.addEventListener("pointerdown", start, { once: true });
  window.addEventListener("keydown", start, { once: true });
}
