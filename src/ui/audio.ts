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

let ctx: AudioContext | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
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
    } catch {
      return null;
    }
  }
  return ctx;
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
    osc.connect(g).connect(ac.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}
