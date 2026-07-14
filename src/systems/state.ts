/**
 * Game-state construction.
 *
 * `createInitialState` builds a fully-seeded game: procedural map, nations with
 * personality archetypes drawn per game, starting armies, and an initial score
 * snapshot. Everything derives from the seed.
 */

import { emptyUnits } from "@/systems/data";
import { generateMap, placeNations } from "@/systems/mapgen";
import { createRng } from "@/systems/rng";
import { snapshotScores } from "@/systems/scoring";
import type { Archetype, GameState, Nation, Personality } from "@/systems/types";

export interface GameOptions {
  seed: number;
  regionCount: number;
  aiCount: number;
  maxTurns: number;
}

export const DEFAULT_OPTIONS: GameOptions = {
  seed: 1,
  regionCount: 20,
  aiCount: 3,
  maxTurns: 60,
};

const ARCHETYPES: Record<Archetype, Personality> = {
  warlord: { archetype: "warlord", aggression: 0.9, expansion: 0.8, economy: 0.3 },
  merchant: { archetype: "merchant", aggression: 0.3, expansion: 0.5, economy: 0.9 },
  builder: { archetype: "builder", aggression: 0.25, expansion: 0.35, economy: 0.85 },
  opportunist: { archetype: "opportunist", aggression: 0.6, expansion: 0.7, economy: 0.5 },
};

// Categorical nation palette — validated for CVD separation and chroma (see
// DEVLOG 2026-07-14). Colour follows the nation everywhere (map, badges, graph),
// with nation names as the always-present secondary encoding.
const NATION_COLORS = ["#4a90d9", "#e2574c", "#56b26a", "#e0a33c", "#a06bd6", "#2bb0a6"];
const NATION_NAMES = ["Sinilipp", "Punakoda", "Rohumaa", "Kuldhõim", "Öövalve", "Merevald"];

export function createInitialState(options: Partial<GameOptions> = {}): GameState {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const rng = createRng(opts.seed);

  const regions = generateMap(rng, { regionCount: opts.regionCount });

  const archetypeKeys = Object.keys(ARCHETYPES) as Archetype[];
  const nations: Nation[] = [];
  const nationCount = opts.aiCount + 1;
  for (let i = 0; i < nationCount; i++) {
    const isPlayer = i === 0;
    const archetype = isPlayer
      ? "opportunist"
      : (rng.pick(archetypeKeys) ?? "opportunist");
    nations.push({
      id: i,
      name: isPlayer ? "Sina" : NATION_NAMES[i % NATION_NAMES.length],
      color: NATION_COLORS[i % NATION_COLORS.length],
      isPlayer,
      personality: { ...ARCHETYPES[archetype] },
      treasury: 45,
      taxRate: 0.2,
      alive: true,
    });
  }

  placeNations(rng, regions, nations.map((n) => n.id));

  const state: GameState = {
    seed: opts.seed,
    rngState: rng.state(),
    turn: 1,
    maxTurns: opts.maxTurns,
    regions,
    nations,
    armies: [],
    nextArmyId: 1,
    scoreHistory: [],
    log: ["Mäng algas"],
    phase: "playing",
    winner: null,
    victoryType: null,
  };

  // Each nation starts with a small garrison at its home region.
  for (const nation of nations) {
    const home = regions.find((r) => r.owner === nation.id);
    if (!home) continue;
    state.armies.push({
      id: state.nextArmyId++,
      owner: nation.id,
      location: home.id,
      units: { ...emptyUnits(), infantry: 3, militia: 2 },
      moved: false,
    });
  }

  state.scoreHistory.push(snapshotScores(state));
  return state;
}
