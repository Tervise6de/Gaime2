/**
 * Map lenses (CIV5-style overlays): recolour every region by a chosen metric —
 * population, per-turn income, or unrest — so the board is readable at a glance
 * without clicking each province.
 *
 * Pure and presentation-only: given a `GameState` and a lens id it returns a
 * per-region-id array of fill colours (or null for the political default) that
 * the renderer bakes into the political layer. UI layer — no DOM, no sim writes.
 */

import { PLAYER_ID, BARBARIAN_ID, armySize, type GameState, type Region } from "@/systems/state";
import { regionProduction, nationYieldMult, regionWareMult } from "@/systems/economy";
import { getRelation, getTreaty } from "@/systems/diplomacy";
import { regionSources, regionGoodOutput } from "@/systems/trade";
import { KONTORE, KONTOR_IDS } from "@/data/kontore";
import type { GoodId } from "@/data/goods";

/** Heat lenses colour by a normalised scalar; relations/military/trade are categorical. */
type HeatLens = "population" | "gold" | "wares" | "food" | "unrest";
export type LensId = "none" | HeatLens | "relations" | "military" | "trade";

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
  { id: "wares", label: "Wares", glyph: "materials", fallback: "📦", hint: "Total ware output produced per turn." },
  { id: "food", label: "Food", glyph: "food", fallback: "🌾", hint: "Food produced per turn." },
  { id: "unrest", label: "Unrest", glyph: "warning", fallback: "🔥", hint: "How restless each region is (red = revolt risk)." },
  { id: "relations", label: "Relations", glyph: "diplomacy", fallback: "🤝", hint: "How each realm stands with you — allies green, enemies red." },
  { id: "military", label: "Military", glyph: "attack", fallback: "⚔", hint: "Where the armies are — your forces green, hostiles red, exposed land amber." },
  { id: "trade", label: "Trade", glyph: "gold", fallback: "⚓", hint: "The merchant world — the signature ware each land exports and the Kontore that buy it." },
];

/** Trade lens: the good each land exports, and the Kontor markets (amber). */
const TRADE_KONTOR = "#e8913a"; // the great Kontore — the markets goods flow to
const TRADE_MUTED = "#3d434b"; // land with nothing to export (bare mountains, transit)
/** Colour a region takes from the ware it exports; first match wins, so the list
    is ordered signature-first — a region reads as its most distinctive export (the
    rare strategics and metals before a terrain's bulk staple). Covers every ware in
    data/goods.ts so no exporting land falls through to muted. */
const TRADE_GOODS: { good: GoodId; color: string }[] = [
  { good: "amber", color: "#e0a021" }, // the amber shore — warm amber
  { good: "salt", color: "#e6ddc4" }, // salt — pale white-gold
  { good: "iron", color: "#8b97a6" }, // ore country — steel grey
  { good: "copper", color: "#c67a3e" }, // mined copper — burnished orange
  { good: "cloth", color: "#9a5a86" }, // the cloth towns — dyed purple
  { good: "wool", color: "#d8d0be" }, // upland fleece — undyed cream
  { good: "herring", color: "#5a8fb0" }, // the fisheries — sea blue
  { good: "stockfish", color: "#7fa8b8" }, // dried cod — pale sea grey
  { good: "naval_stores", color: "#4f5a4a" }, // pitch, tar & hemp — dark pine
  { good: "brick", color: "#b5532f" }, // the clay hills — terracotta
  { good: "grain", color: "#d9b23f" }, // the grain plains — wheat gold
  { good: "beer", color: "#c8862f" }, // plains also brew — amber ale
  { good: "timber", color: "#6f8a4c" }, // the forests — timber green
  { good: "furs", color: "#7a5230" }, // fur country — sable brown
  { good: "wax", color: "#d8c26a" }, // hive wax — pale honey-gold
  { good: "honey", color: "#caa63a" }, // forest honey — deep gold
];

/** Low → high colour ramp for each heat lens (dark, receding low; bright high). */
const RAMPS: Record<HeatLens, string[]> = {
  population: ["#26332e", "#3f8f6a", "#63d29a"],
  gold: ["#332b18", "#b08b32", "#f0cf63"],
  wares: ["#2f2b26", "#9c6a3e", "#d99a5f"],
  food: ["#26331d", "#5b9b3e", "#93d466"],
  unrest: ["#33503c", "#d7a53f", "#e8776b"],
};

/** Relations lens: a diverging enemy→neutral→ally ramp, plus fixed treaty/self tints. */
const RELATIONS_RAMP = ["#d0685e", "#5a616e", "#5faa74"]; // hostile → neutral → warm
const RELATIONS_SELF = "#e6c874"; // your own realm (the player gold)
const RELATIONS_NEUTRAL = "#33383f"; // unowned / barbarian land
const WAR_COLOR = "#c85248"; // at war (strong red)
const ALLY_COLOR = "#4fa267"; // allied (strong green)

/** Military lens: friendly forces green-heat, hostiles red-heat, exposed land amber. */
const MIL_FRIENDLY = ["#26332e", "#5faa74"]; // faint → strong (your / allied garrison)
const MIL_HOSTILE = ["#3a2626", "#d0685e"]; // faint → strong (enemy / barbarian force)
const MIL_EXPOSED = "#d99a4f"; // your own land, ungarrisoned, with a hostile force next door
const MIL_QUIET = "#33383f"; // no forces in or beside it

/** CSS gradient for a lens's ramp (low → high), for the picker's scale legend.
    Relations/Military are categorical from the player's view — the map speaks;
    only Relations carries a meaningful single-axis (enemy→ally) legend. */
export function lensGradient(id: LensId): string | null {
  if (id === "none" || id === "military" || id === "trade") return null;
  if (id === "relations") return `linear-gradient(90deg, ${RELATIONS_RAMP.join(", ")})`;
  return `linear-gradient(90deg, ${RAMPS[id].join(", ")})`;
}

/** The raw metric value for a region under a given lens. */
function metric(state: GameState, region: Region, id: HeatLens): number {
  if (id === "population") return region.population;
  if (id === "unrest") return region.unrest;
  // Income lenses: use the region owner's tax + yield multipliers where owned,
  // else a neutral baseline, so the heat reflects what the land actually pays.
  const owner = region.ownerId != null ? state.nations.find((n) => n.id === region.ownerId) : null;
  // Wares: total ware output the land produces this turn, scaled by the owner's
  // ware multiplier (national trait/tech × region focus).
  if (id === "wares") {
    const wareMult = owner && !owner.isBarbarian ? regionWareMult(owner, region) : 1;
    return regionGoodOutput(region, wareMult).reduce((sum, w) => sum + w.amount, 0);
  }
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
  // Relations is categorical from the *player's* view: your land gold, allies
  // green, enemies red, and everyone else on a diverging warmth ramp by standing.
  if (id === "relations") {
    const out: (string | null)[] = [];
    for (const r of state.regions) {
      if (r.ownerId === null || r.ownerId === BARBARIAN_ID) {
        out[r.id] = RELATIONS_NEUTRAL;
      } else if (r.ownerId === PLAYER_ID) {
        out[r.id] = RELATIONS_SELF;
      } else {
        const treaty = getTreaty(state, PLAYER_ID, r.ownerId);
        out[r.id] =
          treaty === "war"
            ? WAR_COLOR
            : treaty === "alliance"
              ? ALLY_COLOR
              : rampColor(RELATIONS_RAMP, (getRelation(state, PLAYER_ID, r.ownerId) + 100) / 200);
      }
    }
    return out;
  }
  // Military is categorical from the player's seat: sum army strength in each region
  // as friendly (yours + allies) vs hostile (at war + barbarian), then tint —
  // your forces green, hostiles red (both by strength), and any undefended province
  // of yours with a hostile force next door amber, so exposure reads at a glance.
  if (id === "military") {
    const friendlyTo = (owner: number): boolean =>
      owner === PLAYER_ID || (owner !== BARBARIAN_ID && getTreaty(state, PLAYER_ID, owner) === "alliance");
    const hostileTo = (owner: number): boolean =>
      owner === BARBARIAN_ID || getTreaty(state, PLAYER_ID, owner) === "war";
    const friendly: number[] = [];
    const hostile: number[] = [];
    let maxStr = 1;
    for (const a of state.armies) {
      const str = armySize(a.units);
      if (str <= 0) continue;
      if (friendlyTo(a.ownerId)) friendly[a.regionId] = (friendly[a.regionId] ?? 0) + str;
      else if (hostileTo(a.ownerId)) hostile[a.regionId] = (hostile[a.regionId] ?? 0) + str;
      maxStr = Math.max(maxStr, friendly[a.regionId] ?? 0, hostile[a.regionId] ?? 0);
    }
    const out: (string | null)[] = [];
    for (const r of state.regions) {
      const f = friendly[r.id] ?? 0;
      const h = hostile[r.id] ?? 0;
      if (f > 0 && f >= h) out[r.id] = rampColor(MIL_FRIENDLY, f / maxStr);
      else if (h > 0) out[r.id] = rampColor(MIL_HOSTILE, h / maxStr);
      else if (r.ownerId === PLAYER_ID && r.adjacency.some((n) => (hostile[n] ?? 0) > 0)) out[r.id] = MIL_EXPOSED;
      else out[r.id] = MIL_QUIET;
    }
    return out;
  }
  // Trade is categorical: paint each land by the good it exports, and the four
  // Kontore (the markets those goods flow to) in a standout amber, so the whole
  // merchant geography reads at a glance. Land that exports nothing is muted.
  if (id === "trade") {
    const kontorHosts = new Set(KONTOR_IDS.map((k) => KONTORE[k].regionId));
    const out: (string | null)[] = [];
    for (const r of state.regions) {
      if (kontorHosts.has(r.id)) {
        out[r.id] = TRADE_KONTOR;
        continue;
      }
      out[r.id] = TRADE_GOODS.find((g) => regionSources(r, g.good))?.color ?? TRADE_MUTED;
    }
    return out;
  }
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
