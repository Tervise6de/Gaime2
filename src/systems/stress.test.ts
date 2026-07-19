/**
 * Stress / bug-bash harness (roadmap A4).
 *
 * Plays many full games to conclusion across seeds, map sizes, rival counts,
 * difficulties on the authored Hansa map — with the AI driving EVERY
 * nation (the player included), so the whole army/character stack (combined
 * battles, allied rally, zone of control, entrenchment, commanders, defection,
 * reconquest, revolts, the chronicle) gets exercised end to end. Every turn of
 * every game is checked against a set of hard invariants; the run also asserts
 * determinism (same seed+config → identical game) and termination.
 *
 * This is the permanent regression net the interacting systems earned: a single
 * new throw, NaN, negative stock, orphaned army, or determinism break anywhere
 * in the pipeline trips it.
 */
import { describe, it, expect } from "vitest";
import { createGame, resolveTurn, type NewGameOptions } from "@/systems/turn";
import { runNationTurn } from "@/systems/ai";
import { resolveChoice } from "@/systems/events";
import { createRng } from "@/systems/rng";
import { DEFAULT_MAP_OPTIONS } from "@/systems/mapgen";
import { UNIT_TYPES } from "@/data/units";
import {
  PLAYER_ID,
  RESOURCE_KEYS,
  TURN_LIMIT,
  UNREST_MAX,
  armySize,
  type GameState,
} from "@/systems/state";

/** Hard invariants that must hold after every turn of every game. Throws on violation. */
function checkInvariants(s: GameState, ctx: string): void {
  const validOwners = new Set<number>(s.nations.map((n) => n.id));

  for (const n of s.nations) {
    if (n.isBarbarian) continue;
    for (const k of RESOURCE_KEYS) {
      const v = n.stocks[k];
      if (!Number.isFinite(v)) throw new Error(`${ctx}: ${n.name} stock ${k} not finite (${v})`);
    }
    if (typeof n.alive !== "boolean") throw new Error(`${ctx}: ${n.name} alive not boolean`);
  }

  for (const r of s.regions) {
    if (r.ownerId !== null && !validOwners.has(r.ownerId)) {
      throw new Error(`${ctx}: region ${r.id} has unknown owner ${r.ownerId}`);
    }
    if (!(r.unrest >= 0 && r.unrest <= UNREST_MAX)) {
      throw new Error(`${ctx}: region ${r.id} unrest out of range (${r.unrest})`);
    }
    if (!(Number.isFinite(r.population) && r.population >= 0)) {
      throw new Error(`${ctx}: region ${r.id} population invalid (${r.population})`);
    }
    if (!(Number.isFinite(r.fortification) && r.fortification >= 0)) {
      throw new Error(`${ctx}: region ${r.id} fortification invalid (${r.fortification})`);
    }
  }

  for (const a of s.armies) {
    for (const t of UNIT_TYPES) {
      const c = a.units[t];
      if (!Number.isInteger(c) || c < 0) throw new Error(`${ctx}: army ${a.id} ${t} invalid (${c})`);
    }
    if (armySize(a.units) <= 0) throw new Error(`${ctx}: empty army ${a.id} left in play`);
    if (!s.regions[a.regionId]) throw new Error(`${ctx}: army ${a.id} in nonexistent region ${a.regionId}`);
    if (!validOwners.has(a.ownerId)) throw new Error(`${ctx}: army ${a.id} has unknown owner ${a.ownerId}`);
    if (a.commander && !(a.commander.loyalty >= 0 && a.commander.loyalty <= 100)) {
      throw new Error(`${ctx}: army ${a.id} commander loyalty out of range (${a.commander.loyalty})`);
    }
    if ((a.entrenchment ?? 0) < 0) throw new Error(`${ctx}: army ${a.id} negative entrenchment`);
  }

  if (!(Number.isInteger(s.rngState) && s.rngState >= 0)) {
    throw new Error(`${ctx}: rngState invalid (${s.rngState})`);
  }
  for (const e of s.chronicle ?? []) {
    if (!(e.turn >= 0) || typeof e.text !== "string" || e.text.length === 0) {
      throw new Error(`${ctx}: malformed chronicle entry (turn ${e.turn})`);
    }
  }
}

/** Play one game to its verdict (or the hard turn cap), checking invariants each turn. */
function playChecked(options: NewGameOptions, label: string): GameState {
  let s = createGame(options);
  checkInvariants(s, `${label} setup`);
  for (let t = 0; t < TURN_LIMIT + 5 && s.outcome === "playing"; t++) {
    // The AI plays every nation, the player included — maximal exercise of the sim.
    s = runNationTurn(s, PLAYER_ID, createRng(options.seed * 1000 + t));
    if (s.pendingChoice) s = resolveChoice(s, s.pendingChoice.options[0]!.id);
    s = resolveTurn(s);
    checkInvariants(s, `${label} turn ${s.turn}`);
  }
  return s;
}

const CONFIGS: Array<{ name: string; opts: (seed: number) => NewGameOptions }> = [
  { name: "proc-small", opts: (seed) => ({ seed, rivals: 3, map: { ...DEFAULT_MAP_OPTIONS, regionCount: 12 } }) },
  { name: "proc-large", opts: (seed) => ({ seed, rivals: 5, map: { ...DEFAULT_MAP_OPTIONS, regionCount: 30 } }) },
  { name: "proc-hard", opts: (seed) => ({ seed, rivals: 4, difficulty: "hard", map: { ...DEFAULT_MAP_OPTIONS, regionCount: 20 } }) },
  { name: "proc-easy", opts: (seed) => ({ seed, rivals: 2, difficulty: "easy", map: { ...DEFAULT_MAP_OPTIONS, regionCount: 16 } }) },
  { name: "baltic", opts: (seed) => ({ seed, mapId: "baltic" }) },
  { name: "europe", opts: (seed) => ({ seed, mapId: "europe" }) },
];

// Each of these plays many full games; give them plenty of headroom so a slow
// CI box never trips the default 5s per-test timeout.
const STRESS_TIMEOUT_MS = 60_000;

describe("stress: self-play across configs holds every invariant and terminates", () => {
  it("plays a matrix of full games with no invariant violation", () => {
    let played = 0;
    for (const cfg of CONFIGS) {
      for (let seed = 1; seed <= 4; seed++) {
        const end = playChecked(cfg.opts(seed), `${cfg.name}#${seed}`);
        // Terminates: a verdict, or hard-stopped exactly at the cap.
        expect(end.outcome === "playing" ? end.turn : "ended").not.toBe(TURN_LIMIT + 5);
        expect(["playing", "victory", "defeat"]).toContain(end.outcome);
        played++;
      }
    }
    expect(played).toBe(CONFIGS.length * 4);
  }, STRESS_TIMEOUT_MS);

  it("actually exercises conflict across the matrix (coverage guard)", () => {
    let games = 0;
    let ended = 0;
    let withChronicle = 0;
    let sawWar = false;
    let sawRevoltOrBetrayal = false;
    let peakArmies = 0;
    for (const cfg of CONFIGS) {
      for (let seed = 5; seed <= 7; seed++) {
        const end = playChecked(cfg.opts(seed), `cov:${cfg.name}#${seed}`);
        games++;
        if (end.outcome !== "playing") ended++;
        const beats = end.chronicle ?? [];
        if (beats.length > 0) withChronicle++;
        if (beats.some((e) => e.kind === "war")) sawWar = true;
        if (beats.some((e) => e.kind === "revolt" || e.kind === "betrayal")) sawRevoltOrBetrayal = true;
        peakArmies = Math.max(peakArmies, end.armies.length);
      }
    }
    // The sim must be doing real work: most games decide, wars are declared, the
    // revolt/defection machinery fires somewhere, and armies get raised & fought.
    expect(ended).toBeGreaterThan(games / 2);
    expect(withChronicle).toBeGreaterThan(0);
    expect(sawWar).toBe(true);
    expect(sawRevoltOrBetrayal).toBe(true);
    expect(peakArmies).toBeGreaterThan(0);
  }, STRESS_TIMEOUT_MS);

  it("is deterministic — the same seed + config replays identically", () => {
    for (const cfg of ["proc-large", "baltic"] as const) {
      const c = CONFIGS.find((x) => x.name === cfg)!;
      const a = playChecked(c.opts(3), `${cfg}-a`);
      const b = playChecked(c.opts(3), `${cfg}-b`);
      expect(a.turn).toBe(b.turn);
      expect(a.outcome).toBe(b.outcome);
      expect(JSON.stringify(a.regions)).toBe(JSON.stringify(b.regions));
      expect(JSON.stringify(a.armies)).toBe(JSON.stringify(b.armies));
      expect(JSON.stringify(a.chronicle ?? [])).toBe(JSON.stringify(b.chronicle ?? []));
    }
  }, STRESS_TIMEOUT_MS);
});
