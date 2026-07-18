/**
 * The chronicle (E2) — the run's story, told as a handful of major beats rather
 * than the transient turn-by-turn feed. Wars, revolts, betrayals, the fall of a
 * realm, the final victory: each is recorded once, in prose, and kept for the
 * whole game so the end-game summary can read like a saga. Pure and serialisable.
 */
import { rulerTitle } from "@/data/rulers";
import type { GameState } from "@/systems/state";

export type ChronicleKind =
  | "war"
  | "revolt"
  | "betrayal"
  | "fall"
  | "wonder"
  | "victory";

export interface ChronicleEntry {
  turn: number;
  kind: ChronicleKind;
  text: string;
}

/** Keep the chronicle bounded even in a pathological game. */
const CHRONICLE_MAX = 200;

/** Append a beat to the chronicle (stamped with the current turn). Pure. */
export function recordChronicle(state: GameState, kind: ChronicleKind, text: string): GameState {
  const entry: ChronicleEntry = { turn: state.turn, kind, text };
  const chronicle = [...(state.chronicle ?? []), entry].slice(-CHRONICLE_MAX);
  return { ...state, chronicle };
}

/**
 * How a nation is named in prose: its ruler if it has one ("Visvaldis the Cruel
 * of Lithuania"), else just the realm. The player reads as "your realm". Rebels
 * (barbarians) read as "the Free Tribes".
 */
export function chronicleName(state: GameState, nationId: number | null): string {
  if (nationId === null) return "the wilds";
  const n = state.nations.find((x) => x.id === nationId);
  if (!n) return "an unknown power";
  if (n.isBarbarian) return "the Free Tribes";
  if (n.isPlayer) return "your realm";
  return n.ruler ? `${rulerTitle(n.ruler)} of ${n.name}` : n.name;
}
