/**
 * Piracy — raidable trade routes & guard-ships (the Victual Brothers era).
 *
 * Connects the two sea-facing layers: **trade routes become raidable**, and
 * **war-fleets get a peacetime job — guarding them.** Each turn (right before
 * `stepTrade`), every route is checked for a raid; a route guarded by a friendly
 * fleet parked on its lane fights a sea battle instead of losing its convoy, and
 * beating a named captain pays a bounty. The whole system is **dormant (a no-op)
 * until the Victual Brothers epoch event raises `state.piracy.pressure`** — so the
 * age of piracy has a historical beginning and, as pressure eases, an end.
 *
 * Pure and deterministic: it draws from a salted side-stream off `state.rngState`
 * and never advances the main stream, so it cannot perturb AI/event outcomes.
 * History & tuning live in `data/piracy.ts`; design in `docs/pirates-and-guard-ships.md`.
 */

import type { Rng } from "@/systems/rng";
import { createRng } from "@/systems/rng";
import type { UnitCounts } from "@/systems/combat";
import { resolveCombat } from "@/systems/combat";
import type { Army, GameState, Nation, TradeRoute } from "@/systems/state";
import { armySize, emptyUnits, nationById, PLAYER_ID } from "@/systems/state";
import { armyIsFleet } from "@/systems/military";
import { routeIncome } from "@/systems/trade";
import { round1 } from "@/systems/economy";
import { committedPath } from "@/systems/tech";
import { recordChronicle } from "@/systems/chronicle";
import { GOODS } from "@/data/goods";
import type { PirateCaptainDef } from "@/data/piracy";
import { PIRACY, PIRATE_CAPTAIN_IDS, PIRATE_CAPTAINS } from "@/data/piracy";

/** Keeps piracy's rolls off the main RNG stream (so it never shifts AI/events). */
const PIRACY_SALT = 0x7a1d0c0f;

/** Open water fight — no terrain cover, no fort (mirrors combat.test.ts's NO_TERRAIN). */
const OPEN_SEA = { terrainDefense: 1, fortification: 0 } as const;

/** How exposed a route is to raiders (0..1), from the length of its sea-lane. */
export function laneExposure(route: TradeRoute): number {
  return Math.max(0, Math.min(1, (route.lane.length - 1) / PIRACY.exposureLenRef));
}

/**
 * Per-route, per-turn raid chance: richer cargo on a longer lane in a more lawless
 * era is likelier to be hit. The Naval Power doctrine ("guarded lanes") deters
 * raiders outright. Capped. Pure.
 */
export function raidChance(state: GameState, owner: Nation, route: TradeRoute, pressure: number): number {
  const income = route.lastIncome && route.lastIncome > 0 ? route.lastIncome : routeIncome(state, route);
  const valueFactor = income / PIRACY.valueRef;
  let c = PIRACY.raidCoeff * laneExposure(route) * pressure * valueFactor;
  if (committedPath(owner.research.done, "maritime") === "naval_power") {
    c *= 1 - PIRACY.navalDeterrence;
  }
  return Math.max(0, Math.min(PIRACY.raidCap, c));
}

/** The owner's fleet standing guard on this route — any of their war-fleets parked on the lane. */
export function findGuardFleet(route: TradeRoute, armies: readonly Army[]): Army | undefined {
  return armies.find(
    (a) => a.ownerId === route.ownerId && armyIsFleet(a.units) && route.lane.includes(a.regionId),
  );
}

/** The named captain (if any) leading this raid — the hotter the era, the more infamous. */
function pickCaptain(pressure: number, defeated: ReadonlySet<string>, rng: Rng): PirateCaptainDef | null {
  if (rng.next() >= PIRACY.captainChance) return null;
  const available = PIRATE_CAPTAIN_IDS.map((id) => PIRATE_CAPTAINS[id]).filter(
    (c) => !defeated.has(c.id) && pressure >= c.minPressure,
  );
  if (available.length === 0) return null;
  return available.reduce((a, b) => (b.minPressure > a.minPressure ? b : a));
}

/** Build the raiding stack: war-cogs scaled by pressure, plus a captain's ships & flagship. */
function raiderStack(pressure: number, captain: PirateCaptainDef | null, rng: Rng): UnitCounts {
  const cogs = PIRACY.raiderBase + Math.round(pressure * PIRACY.raiderPerPressure) + rng.int(0, 1) + (captain?.extraShips ?? 0);
  const units = emptyUnits();
  units.war_cog = Math.max(1, cogs);
  if (captain && captain.flagship !== "war_cog") units[captain.flagship] += 1;
  return units;
}

/** Apply a guard-fleet's battle losses: update its stack, or remove it if wiped. */
function applyGuardLosses(armies: readonly Army[], guardId: number, survivors: UnitCounts): Army[] {
  if (armySize(survivors) <= 0) return armies.filter((a) => a.id !== guardId);
  return armies.map((a) => (a.id === guardId ? { ...a, units: survivors } : a));
}

function captainLabel(c: PirateCaptainDef): string {
  return c.epithet ? `${c.name} ${c.epithet}` : c.name;
}

function convoyLostLine(route: TradeRoute, captain: PirateCaptainDef | null): string {
  const who = captain ? captainLabel(captain) : "The Victual Brothers";
  const good = GOODS[route.good];
  return `${who} took your ${good.glyph} ${good.name} convoy — the lane pays nothing this turn.`;
}

/**
 * Resolve piracy against every trade route for one turn (the turn seam, run in
 * `resolveTurn` just before `stepTrade`). Marks raided convoys `pirated` (so
 * `stepTrade` pays them nothing), fights guard-fleet sea battles, pays bounties,
 * and eases pressure. A no-op while the era is dormant. Pure — returns new state.
 */
export function stepPiracy(state: GameState): GameState {
  const pressure0 = state.piracy?.pressure ?? 0;
  if (pressure0 <= 0) return state; // dormant: the age of piracy hasn't begun (or has passed)

  const rng = createRng((state.rngState ^ PIRACY_SALT) >>> 0);
  const defeated = new Set<string>(state.piracy?.defeatedCaptains ?? []);
  let pressure = pressure0;
  let armies = state.armies;
  const goldGain = new Map<number, number>();
  const log = [...state.log];
  const beats: string[] = [];

  const routes = state.routes ?? [];
  const nextRoutes: TradeRoute[] = [];

  for (const route of routes) {
    const wasPirated = route.pirated ?? false;
    const owner = nationById(state, route.ownerId);
    const holdsSource = state.regions[route.fromRegionId]?.ownerId === route.ownerId;

    // Void or worthless routes cannot be raided (stepTrade drops void ones anyway).
    if (!owner || !owner.alive || !holdsSource) {
      nextRoutes.push(wasPirated ? { ...route, pirated: false } : route);
      continue;
    }

    if (rng.next() >= raidChance(state, owner, route, pressure)) {
      nextRoutes.push(wasPirated ? { ...route, pirated: false } : route);
      continue;
    }

    // A raid fires.
    const captain = pickCaptain(pressure, defeated, rng);
    const raider = raiderStack(pressure, captain, rng);
    const guard = findGuardFleet(route, armies);
    let pirated: boolean;

    if (guard) {
      const result = resolveCombat(raider, guard.units, OPEN_SEA, rng);
      armies = applyGuardLosses(armies, guard.id, result.defenderRemaining);
      if (result.attackerWins) {
        // The guard was beaten and the convoy taken.
        pirated = true;
        pressure += PIRACY.raidSuccessGain;
        if (route.ownerId === PLAYER_ID) log.push(convoyLostLine(route, captain));
      } else {
        // The guard drove the raiders off — cargo safe, maybe a bounty.
        pirated = false;
        pressure -= PIRACY.repelDrop;
        if (captain) {
          defeated.add(captain.id);
          pressure -= PIRACY.captainDrop;
          goldGain.set(route.ownerId, round1((goldGain.get(route.ownerId) ?? 0) + captain.bounty));
          if (route.ownerId === PLAYER_ID) {
            log.push(`Your guard-fleet takes ${captainLabel(captain)} at sea — a bounty of ${captain.bounty}g.`);
            if (captain.marquee) beats.push(`${captain.name} is taken at sea, and the sea-lanes breathe again.`);
          }
        } else if (route.ownerId === PLAYER_ID) {
          const good = GOODS[route.good];
          log.push(`Your guard-fleet drove raiders off the ${good.glyph} ${good.name} lane.`);
        }
      }
    } else {
      // Undefended — the convoy is lost.
      pirated = true;
      pressure += captain ? PIRACY.raidSuccessGain * 1.5 : PIRACY.raidSuccessGain;
      if (route.ownerId === PLAYER_ID) log.push(convoyLostLine(route, captain));
    }

    nextRoutes.push(!pirated && !wasPirated ? route : { ...route, pirated });
  }

  pressure = Math.max(0, Math.min(1, pressure - PIRACY.decayPerTurn));

  const nations =
    goldGain.size === 0
      ? state.nations
      : state.nations.map((n) => {
          const g = goldGain.get(n.id);
          return g ? { ...n, stocks: { ...n.stocks, gold: round1(n.stocks.gold + g) } } : n;
        });

  let next: GameState = {
    ...state,
    routes: nextRoutes,
    armies,
    nations,
    piracy: { pressure, defeatedCaptains: [...defeated] },
    log: log.slice(-50),
  };
  for (const text of beats) next = recordChronicle(next, "piracy", text);
  return next;
}
