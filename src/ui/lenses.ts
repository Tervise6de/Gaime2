/**
 * Map lenses (CIV5-style overlays): recolour every region by a chosen metric —
 * population, per-turn income, or unrest — so the board is readable at a glance
 * without clicking each province.
 *
 * Pure and presentation-only: given a `GameState` and a lens id it returns a
 * per-region-id array of fill colours (or null for the political default) that
 * the renderer bakes into the political layer. UI layer — no DOM, no sim writes.
 */

import type { GameState, Region } from "@/systems/state";
import { regionProduction, nationYieldMult } from "@/systems/economy";

export type LensId = "none" | "population" | "gold" | "materials" | "food" | "unrest";

export interface LensDef {
  id: LensId;
  label: string;
  /** GlyphId for the picker icon. */
  glyph: string;
  /** Emoji fallback if the glyph is missing. */
  fallback: string;
  hint: string;
}

/** The lenses offered in the picker, in display order (political first). */
export const LENSES: LensDef[] = [
  { id: "none", label: "Political", glyph: "map", fallback: "🗺", hint: "Who owns what — the default map." },
  { id: "population", label: "Population", glyph: "region", fallback: "👥", hint: "How populous each region is." },
  { id: "gold", label: "Gold", glyph: "gold", fallback: "🪙", hint: "Gold produced per turn." },
  { id: "materials", label: "Materials", glyph: "materials", fallback: "⛏", hint: "Materials produced per turn." },
  { id: "food", label: "Food", glyph: "food", fallback: "🌾", hint: "Food produced per turn." },
  { id: "unrest", label: "Unrest", glyph: "warning", fallback: "🔥", hint: "How restless each region is (red = revolt risk)." },
];

/** Low → high colour ramp for each heat lens (dark, receding low; bright high). */
const RAMPS: Record<Exclude<LensId, "none">, string[]> = {
  population: ["#26332e", "#3f8f6a", "#63d29a"],
  gold: ["#332b18", "#b08b32", "#f0cf63"],
  materials: ["#2f2b26", "#9c6a3e", "#d99a5f"],
  food: ["#26331d", "#5b9b3e", "#93d466"],
  unrest: ["#33503c", "#d7a53f", "#e8776b"],
};

/** CSS gradient for a lens's ramp (low → high), for the picker's scale legend. */
export function lensGradient(id: LensId): string | null {
  if (id === "none") return null;
  return `linear-gradient(90deg, ${RAMPS[id].join(", ")})`;
}

/** The raw metric value for a region under a given lens. */
function metric(state: GameState, region: Region, id: Exclude<LensId, "none">): number {
  if (id === "population") return region.population;
  if (id === "unrest") return region.unrest;
  // Income lenses: use the region owner's tax + yield multipliers where owned,
  // else a neutral baseline, so the heat reflects what the land actually pays.
  const owner = region.ownerId != null ? state.nations.find((n) => n.id === region.ownerId) : null;
  const tax = owner && !owner.isBarbarian ? owner.taxRate : 0.1;
  const flow =
    owner && !owner.isBarbarian
      ? regionProduction(region, tax, nationYieldMult(owner))
      : regionProduction(region, tax);
  return Math.max(0, flow[id]);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function toHex(n: number): string {
  const s = Math.round(Math.max(0, Math.min(255, n))).toString(16);
  return s.length < 2 ? "0" + s : s;
}

function parse(c: string): [number, number, number] {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

function mix(c1: string, c2: string, t: number): string {
  const a = parse(c1);
  const b = parse(c2);
  return `#${toHex(lerp(a[0], b[0], t))}${toHex(lerp(a[1], b[1], t))}${toHex(lerp(a[2], b[2], t))}`;
}

/** Sample a multi-stop ramp at t ∈ [0,1]. */
function rampColor(ramp: string[], t: number): string {
  if (t <= 0) return ramp[0]!;
  if (t >= 1) return ramp[ramp.length - 1]!;
  const segs = ramp.length - 1;
  const x = t * segs;
  const i = Math.min(segs - 1, Math.floor(x));
  return mix(ramp[i]!, ramp[i + 1]!, x - i);
}

/**
 * Per-region-id fill colours for a lens, or null for the political default.
 * The metric is normalised across all regions so the ramp spans the live range
 * (a lens is only useful relatively — "which regions are hot?").
 */
export function lensColorsFor(state: GameState, id: LensId): (string | null)[] | null {
  if (id === "none") return null;
  const ramp = RAMPS[id];
  const vals: number[] = [];
  let min = Infinity;
  let max = -Infinity;
  for (const r of state.regions) {
    const v = metric(state, r, id);
    vals[r.id] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  const out: (string | null)[] = [];
  for (const r of state.regions) {
    out[r.id] = rampColor(ramp, (vals[r.id]! - min) / span);
  }
  return out;
}
