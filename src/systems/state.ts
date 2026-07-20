/**
 * Core game state and the constants that drive turn resolution.
 *
 * `GameState` is a plain, serialisable object (docs/game-design.md §7): no
 * class instances, no functions, no DOM references — just data. Turn resolution
 * is a set of pure functions over `GameState` → new `GameState`, which keeps
 * the sim deterministic, snapshot-serialisable, and cheap to unit-test.
 *
 * Some fields (unrest, fortification, buildings) are inert in Milestone 1 but
 * are modelled now so later milestones can fill them in without reshaping the
 * state. Numbers are illustrative starting values for tuning.
 */

import type { BuildingId } from "@/data/buildings";
import type { Commander } from "@/data/commanders";
import type { Ruler } from "@/data/rulers";
import type { FocusId } from "@/data/focuses";
import { GOOD_IDS, type GoodId } from "@/data/goods";
import type { KontorId } from "@/data/kontore";
import type { ResourceYield, StrategicResource, TerrainId } from "@/data/terrain";
import { UNIT_TYPES, type UnitType } from "@/data/units";
import type { BattleReport } from "@/systems/combat";
import type { ChronicleEntry } from "@/systems/chronicle";
import type { TechId } from "@/data/techs";
import type { TraitId } from "@/data/traits";

/** Owner id 0 is always the human player. */
export const PLAYER_ID = 0;
/** Barbarians hold the neutral regions you conquer (M3; no diplomacy yet). */
export const BARBARIAN_ID = 1;

/** Tax is a global slider; the fiscal lever of docs/game-design.md §3.2. */
export const TAX_MIN = 0;
export const TAX_MAX = 0.4;
export const TAX_STEP = 0.05;
export const DEFAULT_TAX = 0.1;

/**
 * Stability / population tuning (M2). The anti-snowball brake lives here
 * (docs/game-design.md §3.3): tax and famine push unrest up; low tax and
 * temples pull it down; high unrest throttles production and, past the revolt
 * threshold, stops a region entirely.
 */
export const UNREST_MAX = 100;
/** Baseline unrest every region carries. */
export const UNREST_BASE = 5;
/** Extra unrest a region trends toward at the maximum tax rate. */
export const UNREST_TAX_MAX = 28;
/** Unrest below this has no production effect. */
export const UNREST_PENALTY_START = 30;
/** At/above this, the region revolts: production stops, population falls. */
export const UNREST_REVOLT = 75;
/**
 * Turns a region may sit in full revolt (ungarrisoned) before it secedes to the
 * barbarians — a *territorial* anti-snowball brake (design §3.3): an empire that
 * overexpands or overtaxes past its ability to keep order sheds land it can't hold.
 */
export const SECESSION_REVOLT_TURNS = 3;
/** Barbarian militia that garrison a region the turn it secedes (must be reconquered). */
export const REBEL_GARRISON = 2;
/** Unrest moves at most this far toward its target each turn (gradual). */
export const UNREST_DRIFT = 6;
/** Unrest spike applied to a region during a national famine. */
export const FAMINE_UNREST_SPIKE = 18;
/**
 * A stationed friendly army polices its region, lowering its unrest target by
 * this much per unit (design §3.3: garrisons calm). Capped by GARRISON_CALM_MAX
 * so a huge stack can't zero unrest — and armies cost upkeep, so keeping the
 * peace by force is a real, ongoing gold trade-off, not a free fix.
 */
export const GARRISON_CALM_PER_UNIT = 2;
/** Maximum unrest reduction a garrison can contribute, however large. */
export const GARRISON_CALM_MAX = 12;

/** Population tuning (M2). */
export const GROWTH_BASE = 0.35;
/** Above this unrest a region stops growing. */
export const GROWTH_UNREST_CEILING = 55;
/** Fraction of population lost per turn during famine or revolt. */
export const STARVE_FRACTION = 0.12;
/** Minimum population a region retains (never depopulates to zero in M2). */
export const MIN_POPULATION = 1;
/** National food granary cap (surplus beyond this is wasted). */
export const GRANARY_CAP = 60;

/**
 * Military / conquest tuning (M3, docs/game-design.md §3.4). Combat is abstract
 * (no tactical grid); armies drain gold upkeep; conquest and overexpansion feed
 * unrest, the anti-snowball brake.
 */
/** Fortification defensive bonus per level. */
export const FORT_PER_LEVEL = 0.2;
/** Maximum entrenchment (extra fort levels) an army can dig in for (M3). */
export const MAX_ENTRENCH = 3;
/** Random swing applied to the attacker's strength ratio in combat. */
export const COMBAT_VARIANCE = 0.15;
/** Phased-battle tuning (combat v2). A fight opens with a volley (ranged +
    siege first strike), then up to MAX rounds of melee attrition. */
export const MAX_COMBAT_ROUNDS = 5;
/** Fraction of the enemy a full opening volley can remove (scaled by its
    ranged/siege power vs the enemy's size). */
export const VOLLEY_LETHALITY = 0.22;
/** Base per-round melee lethality, split between the sides by their power. */
export const ROUND_LETHALITY = 0.5;
/** Ceiling on how much of a side one melee round can remove. */
export const MAX_ROUND_LOSS = 0.55;
/** Unrest added to a region the turn it is conquered (foreign population). */
export const CONQUEST_UNREST = 30;
/** Regions you can hold before overexpansion unrest kicks in. */
export const FREE_REGIONS = 5;
/** Extra unrest per region held beyond FREE_REGIONS. */
export const OVEREXPANSION_UNREST = 2.5;
/** Bankruptcy: unrest spike applied nationwide when the treasury goes negative. */
export const BANKRUPTCY_UNREST = 15;

/**
 * Diplomacy tuning (M4, docs/game-design.md §3.5). Relations sit in −100..+100
 * and drift toward a slow neutral; actions and proximity shift them.
 */
export const RELATION_MIN = -100;
export const RELATION_MAX = 100;
/** Relation hit for declaring war / breaking a treaty. */
export const RELATION_WAR_HIT = 45;
/** Relation gain from a gift (per unit, scaled by amount). */
export const GIFT_RELATION = 1; // per gold, capped in diplomacy.ts
/** Below this relation an AI will consider war; above it, treaties. */
export const HOSTILE_THRESHOLD = -30;
export const FRIENDLY_THRESHOLD = 40;

/**
 * Goods-trade tuning (the merchant layer, hansa-plan.md §6). A trade route carries
 * one good from a region that sources it, along a lane of regions, to a Kontor that
 * demands it — turning the good into gold each turn (systems/trade.ts `stepTrade`).
 * This sits BESIDE the four-resource economy: goods never touch `regionProduction`,
 * they only add gold on arrival, so the core economy and its tests are untouched.
 *
 * A route's income scales with the good's value and the lane it runs: reaching a
 * distant Kontor pays a premium (`+DIST_COEF` per lane node beyond the first),
 * capped at `DIST_CAP` so a cross-world lane doesn't pay without bound. Scarcity
 * and monopoly premiums are stubbed at 1 for this slice (systems/trade.ts).
 */
/** Gold multiplier added to a route per lane node beyond the first (distance premium). */
export const TRADE_DIST_COEF = 0.15;
/** Ceiling on a route's distance multiplier. */
export const TRADE_DIST_CAP = 2.5;
/** How many trade routes one nation may run at once. */
export const MAX_ROUTES_PER_NATION = 6;

/**
 * Domestic ware demand & the treasury's job (R5, docs/game-design.md R5). Until R5
 * the luxuries were export-only and gold had almost nothing to buy. Three levers
 * close both gaps:
 *  - **Luxury contentment**: a realm's towns crave the pure luxuries (furs, wax,
 *    amber, cloth, wool) in proportion to the population they govern; supplying
 *    them from the stockpile eases unrest realm-wide. A carrot, never a
 *    punishment (the anti-snowball brake stays unrest, by design).
 *  - **The town market**: gold buys or sells wares at a spread deliberately worse
 *    than a Kontor route, so the great Hansa trade stays the profit engine and the
 *    market is the liquidity/emergency valve (import grain, buy brick, muster arms).
 *  - **The food reserve**: a food shortfall taps the food-ware stockpile before it
 *    bites as famine (see systems/turn.ts) — so a stocked or market-supplied larder
 *    rides out a bad turn.
 */
/**
 * Luxury units a realm's towns crave per head of population, per turn. Pitched so
 * a small realm is easily kept content, but a large/populous one must invest in
 * luxury industry (a Weaving Works) or import on the market to stay fully content —
 * a demand that scales with the empire, not a flat always-on bonus.
 */
export const LUXURY_DEMAND_PER_POP = 0.12;
/** Realm-wide unrest eased when luxury demand is fully met (scaled by how much is). */
export const LUXURY_CONTENT_UNREST = 10;
/** Gold a unit of a ware fetches when sold on the local market (× the good's value). */
export const MARKET_SELL_MULT = 0.5;
/** Gold a unit of a ware costs to buy on the local market (× the good's value). */
export const MARKET_BUY_MULT = 2;

/**
 * Tech / victory / events tuning (M5, docs/game-design.md §3.6, §6).
 */
/** Fraction of all regions a nation must hold for a domination victory. */
export const DOMINATION_FRACTION = 0.6;
/** The game ends at this turn on a prestige-score tiebreak. A full campaign is
    a long arc through all five ages (research is era-gated, data/eras.ts). The
    standard-length default; per-game the effective limit lives on
    `GameState.turnLimit` (chosen via the Game-length setting). */
export const TURN_LIMIT = 220;

/**
 * Game-length setting (docs/hansa-plan.md §3): how long a session runs before
 * the prestige-score tiebreak decides it. Decoupled from the calendar — a
 * shorter or longer game still spans the same Hansa arc, just at fewer/more
 * turns. "endless" drops the score tiebreak entirely (play until a decisive
 * victory or you stop) — the home of the "how big can you get it" fantasy.
 */
export type GameLength = "short" | "standard" | "long" | "endless";

/** Turn limits for the finite game lengths ("endless" has none → null). */
export const GAME_LENGTH_TURNS = { short: 150, standard: 220, long: 300 } as const;

/** Per-turn probability a bounded random event fires for the player. */
export const EVENT_CHANCE = 0.16;

/** Difficulty scales rival economy and how soon they turn on the player. */
export type Difficulty = "easy" | "normal" | "hard";

export interface DifficultyConfig {
  /** Multiplier on rival (non-player) income. */
  rivalEconomy: number;
  /** Turns before rivals may attack the player. */
  earlyPeace: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyConfig> = {
  easy: { rivalEconomy: 0.8, earlyPeace: 25 },
  normal: { rivalEconomy: 1.0, earlyPeace: 18 },
  hard: { rivalEconomy: 1.25, earlyPeace: 10 },
};

/** A nation's research state. */
export interface Research {
  /** The tech currently being researched, if any. */
  current: TechId | null;
  /** Knowledge invested into `current` so far. */
  progress: number;
  /** Completed techs. */
  done: TechId[];
  /**
   * A queued research path: when `current` completes, the next still-valid tech
   * here is auto-selected (prereqs met + age reached). Optional (legacy saves).
   */
  queue?: TechId[];
}

/** A region's single construction slot. */
export interface ConstructionOrder {
  building: BuildingId;
  /** Materials invested so far, out of the building's cost. */
  progress: number;
}

export interface Region {
  id: number;
  name: string;
  terrain: TerrainId;
  /** Owning nation id, or null for unowned/neutral terrain (used from M3). */
  ownerId: number | null;
  population: number;
  /**
   * Per-region town-size floor for the population cap (in pop units), so historic
   * hubs out-scale hinterland provinces (a Kontor city vs. a backwater). Set from
   * a scripted map's town sizing; when absent the cap falls back to terrain alone
   * (regionCapacity), so legacy saves are unaffected.
   */
  baseCapacity?: number;
  /** 0..100. Tax and famine raise it; temples and low tax lower it (M2). */
  unrest: number;
  /** Defensive works (levels). Multiplies defender strength in combat (M3). */
  fortification: number;
  /** Strategic resource present here, if any (gates advanced units). */
  resource: StrategicResource | null;
  /** Completed building ids in this region. */
  buildings: BuildingId[];
  /**
   * Player-assigned specialisation biasing this region's output (data/focuses.ts).
   * Absent/undefined = balanced (no lean). Only owned regions carry one.
   */
  focus?: FocusId;
  /** What's under construction here, if anything. */
  construction: ConstructionOrder | null;
  /**
   * Buildings queued to build after the current one, in order. When a
   * construction completes, the next still-valid entry auto-starts (turn.ts
   * `startQueuedBuildings`). A player quality-of-life lever so you can line up a
   * province's build order and leave it. Optional/absent = no queue (legacy saves).
   */
  buildQueue?: BuildingId[];
  /** Ids of adjacent regions (the pure logic graph). */
  adjacency: number[];
  /**
   * Consecutive turns this region has sat in full revolt (unrest ≥ revolt
   * threshold) without a friendly garrison. At SECESSION_REVOLT_TURNS the region
   * secedes to the barbarians. Absent/0 = calm or freshly settled (legacy saves).
   */
  revoltTurns?: number;
  /**
   * The nation that owned this region immediately before the current owner (set
   * on conquest). Powers the "reclaim" casus belli — taking back a lost region
   * is a justified war. Absent = never changed hands.
   */
  priorOwnerId?: number | null;
  /** Layout position for the renderer, in world units [0, 1]. */
  x: number;
  y: number;
}

/** A stack of units of one nation occupying one region. */
export interface Army {
  id: number;
  ownerId: number;
  regionId: number;
  /** Count of each unit type in the stack. */
  units: Record<UnitType, number>;
  /** Region moves remaining this turn. */
  movesLeft: number;
  /**
   * Dug in (M3): the army holds position to entrench. Set by the fortify action,
   * cleared the moment it moves or attacks. Undefined on legacy saves = not dug in.
   */
  fortifying?: boolean;
  /**
   * Entrenchment level in [0, MAX_ENTRENCH] — extra fortification the dug-in
   * garrison adds to its region's defence, grown one level per held turn while
   * `fortifying`. Undefined on legacy saves = 0.
   */
  entrenchment?: number;
  /**
   * The character leading this stack (M4). Their martial rating feeds the combat
   * maths; low loyalty foments unrest where they stand. Undefined = unled.
   */
  commander?: Commander;
  /**
   * March order (travel over turns): the region this army is marching toward.
   * The turn pipeline advances it a step (its move rate) toward `dest` each turn,
   * fighting whatever it steps into, until it arrives or is stopped — then `dest`
   * clears. Undefined/null = idle (no standing order). Set by orderMarch.
   */
  dest?: number | null;
}

/**
 * A standing trade route (the merchant layer): one nation ships one good from a
 * region it holds, along a fixed lane of regions, to a Kontor that demands it —
 * turning the good into gold each turn (systems/trade.ts `stepTrade`). Mirrors the
 * armies / nextArmyId id-registry pattern. Serialisable data only.
 */
export interface TradeRoute {
  id: number;
  ownerId: number;
  /** The good carried (data/goods.ts). */
  good: GoodId;
  /** The producing region the route ships from (held by `ownerId`). */
  fromRegionId: number;
  /** The demanding Kontor the route delivers to (data/kontore.ts). */
  toKontorId: KontorId;
  /** Region ids the route runs over, producer → Kontor host (BFS shortest path). */
  lane: number[];
  /** Gold the route paid last turn (0 while disrupted). Undefined until first resolved. */
  lastIncome?: number;
  /** Set when war on the lane or at the host severed the route last turn (paid 0). */
  disrupted?: boolean;
  /** Gold skimmed by the Øresund Sound toll last turn (already netted out of lastIncome). */
  tollPaid?: number;
  /** Set when the Sound holder closed the strait to this route's owner (war/embargo) — paid 0. */
  soundBlocked?: boolean;
  /** Set when the Hanseatic League shut this route's owner out of the Kontor (no access / boycott) — paid 0. */
  leagueBlocked?: boolean;
}

/**
 * The Øresund Sound toll's live state (data/sound.ts) — present only on the Hansa
 * board. The holder of `regionId` skims `tollRate` of every Baltic→western route
 * and may `embargoes`-close the strait to named rivals. Optional (absent on
 * legacy saves).
 */
export interface SoundState {
  /** Host region (Zealand) whose holder levies the toll. */
  regionId: number;
  /** Fraction of a crossing route's income skimmed (0..SOUND.maxRate). */
  tollRate: number;
  /** Nation ids the Sound holder has closed the strait to (their crossing trade pays 0). */
  embargoes: number[];
  /**
   * The nation that set the current `embargoes`. If the strait is seized by another
   * realm, `embargoBy` no longer matches the holder and the embargoes fall dormant
   * (a conqueror doesn't inherit the last holder's grudges). The toll rate persists.
   */
  embargoBy?: number;
}

/**
 * The Hanseatic League (systems/league.ts) — the collective-trade institution,
 * present only on the Hansa board once a realm *forms* it. Members draw a dividend
 * from the League's Kontore, monopolise Kontor access, keep peace with one another,
 * and can collectively boycott a rival. The Alderman (leader) is derived — the
 * member holding the most Kontore — not stored. Optional (absent until founded).
 */
export interface LeagueState {
  /** Nation ids in the League (the founder first). */
  members: number[];
  /** Turn the League was founded. */
  foundedTurn: number;
  /** Non-member realms the League has boycotted — their trade to member Kontore is severed. */
  boycotts: number[];
}

/** Whether `id` belongs to the League. A trivial accessor kept here so both the
    diplomacy and league systems can read it without importing each other. Pure. */
export function inLeague(state: GameState, id: number): boolean {
  return state.league?.members.includes(id) ?? false;
}

/**
 * The live state of a Kontor (the merchant network): who holds it and whether it
 * trades. Seeded open for all four Kontore at game start (systems/trade.ts
 * `seedKontore`). Serialisable data only.
 */
export interface KontorState {
  id: KontorId;
  /** Nation holding the Kontor's host region, or null if unheld / off this map. */
  holderId: number | null;
  /** Whether the Kontor is currently open for trade. */
  open: boolean;
  /** Turn the Kontor's current holder took it (or the game began). */
  sinceTurn?: number;
}

/**
 * A scheduled historical "epoch" event (systems/epochs.ts, data/epochEvents.ts):
 * which event, and the turn it fires. The timeline is rolled once at game start —
 * each event fires at its anchor year ± a window, if it happens at all — so no two
 * games share a schedule. Fired events are removed. Serialisable data only.
 */
export interface ScheduledEpoch {
  id: string;
  fireTurn: number;
}

/**
 * An epoch event that fired this turn, for the UI to surface as a notification
 * (systems/epochs.ts fills it; the HUD reads it after End turn and clears with the
 * next turn, like `battles`). Carries only the dynamic bits — the year and the
 * filled headline (what happened, where); static content (name, description,
 * artwork) is looked up by `id` from data/epochEvents.ts.
 */
export interface FiredEpochNote {
  id: string;
  year: number;
  /** The event's headline with its place filled in ("… Åbo lose near half …"). */
  headline: string;
}

export interface ResourceStocks {
  gold: number;
  food: number;
  knowledge: number;
}

/**
 * Per-nation ware stockpiles — the unified physical economy (data/goods.ts).
 * Every ware has an entry; `emptyWares()` seeds them to zero. Build wares fund
 * construction, arms wares fund recruitment, the rest are traded for gold.
 */
export type Wares = Record<GoodId, number>;

/**
 * AI personality archetype (docs/game-design.md §5). Weights shift decision
 * *thresholds*, not the framework — same rules, different feel. 0..1 each.
 */
export interface Personality {
  archetype: "warlord" | "merchant" | "builder" | "opportunist";
  aggression: number;
  expansion: number;
  economy: number;
  trustworthiness: number;
}

/**
 * A nation. From M4 each non-barbarian nation runs the same economy and turn
 * pipeline as the player under the same scarcity; rivals additionally run the
 * rule-based AI (ai.ts). The player is just the nation with `isPlayer: true`.
 */
export interface Nation {
  id: number;
  name: string;
  color: string;
  isPlayer: boolean;
  /** Barbarians are static neutral holders — no economy, no AI, no diplomacy. */
  isBarbarian: boolean;
  /** Eliminated once a nation holds no regions. */
  alive: boolean;
  /** Per-nation treasury and stockpiles (gold/food/knowledge). */
  stocks: ResourceStocks;
  /** Per-nation ware stockpiles — the physical commodity economy (data/goods.ts). */
  wares: Wares;
  /** Per-nation tax rate in [TAX_MIN, TAX_MAX]. */
  taxRate: number;
  /** AI archetype; undefined for the player and barbarians. */
  personality?: Personality;
  /** National trait drawn per game; undefined for barbarians. */
  trait?: TraitId;
  /** The named figure at the head of the realm (E1); undefined for barbarians / legacy saves. */
  ruler?: Ruler;
  /** Founding capital's region id (undefined for barbarians and legacy saves). */
  capitalRegionId?: number;
  /** Research state (techs done, current, progress). */
  research: Research;
  /** Last turn's flags, for the HUD. */
  famine: boolean;
  bankrupt: boolean;
  /** Temporary effects with a per-turn countdown (undefined = none / legacy saves). */
  modifiers?: NationModifier[];
}

/** Kinds of temporary national effect (each with its own gameplay effect). */
export type ModifierId = "prosperity" | "war_weary" | "research_surge";

/** A temporary national effect that ticks down and expires. Serialisable. */
export interface NationModifier {
  id: ModifierId;
  /** Turns of effect remaining; the modifier applies while > 0, then is dropped. */
  turnsLeft: number;
  /**
   * Intensity multiplier — how many times the base effect stacks (war-weariness
   * scales with the number of simultaneous wars). Absent = 1 (legacy saves).
   */
  stacks?: number;
}

/** Player-facing labels for active modifiers (HUD chips). */
export const MODIFIER_LABEL: Record<ModifierId, string> = {
  prosperity: "✨ Prosperity",
  war_weary: "War-weariness",
  research_surge: "📚 Research surge",
};

/** Gold-yield multiplier granted by a prosperity modifier. */
export const PROSPERITY_GOLD_MULT = 1.25;
/** Gold-yield multiplier while a nation is (recently) at war — the cost of war. */
export const WAR_WEARY_GOLD_MULT = 0.85;
/** Turns a bout of war-weariness lingers; refreshed each turn a war continues. */
export const WAR_WEARY_TURNS = 3;
/** War-weariness stacks with each simultaneous war, but no worse than this. */
export const WAR_WEARY_MAX_STACKS = 3;
/** Knowledge-yield multiplier while a research surge is active (a founded academy). */
export const RESEARCH_SURGE_KNOWLEDGE_MULT = 1.4;
/** Turns a research surge lasts. */
export const RESEARCH_SURGE_TURNS = 4;

/** Diplomatic standing between two nations. */
export type TreatyStatus = "war" | "peace" | "nap" | "alliance";

/**
 * One dated dealing behind a pair's relations (a grudge or goodwill), merged by
 * reason and decaying toward zero each turn. Explanatory only — the `relations`
 * scalar is what the AI acts on.
 */
export interface OpinionEvent {
  /** Stable reason id (keys the label in diplomacy.ts). */
  reason: string;
  /** Current signed contribution (decays toward 0 over turns). */
  delta: number;
  /** Turn the dealing last happened. */
  turn: number;
}

/** A pending diplomatic offer awaiting the recipient's decision (AI → player). */
export interface DiplomaticOffer {
  id: number;
  from: number;
  to: number;
  type: "peace" | "nap" | "alliance" | "tribute";
  /** Gold the sender offers (tribute/gift sweetener), if any. */
  gold?: number;
}

export interface GameState {
  /** The seed the whole game derives from (map generation). */
  seed: number;
  /** Authored map id; the live game uses "hansa". */
  mapId?: string;
  /** Advancing RNG state for combat/AI/events — keeps resolution deterministic. */
  rngState: number;
  /** Turns elapsed; starts at 1. */
  turn: number;
  nations: Nation[];
  regions: Region[];
  /** All armies on the map. */
  armies: Army[];
  /** Monotonic id source for new armies. */
  nextArmyId: number;
  /**
   * Standing trade routes (the merchant layer) — each carries a good to a Kontor
   * for gold each turn (systems/trade.ts). Mirrors armies / nextArmyId. Optional
   * so legacy saves load as "no routes" (back-filled to [] on deserialize).
   */
  routes?: TradeRoute[];
  /** Monotonic id source for new trade routes. Optional (legacy saves back-fill 0). */
  nextRouteId?: number;
  /**
   * The Kontore's live state (holder + open), seeded at game start (`seedKontore`).
   * Optional so legacy saves load (back-filled to [] on deserialize).
   */
  kontore?: KontorState[];
  /**
   * The Øresund Sound toll (systems/trade.ts) — the chokepoint the strait-holder
   * taxes/closes. Seeded on the Hansa map at game start; absent elsewhere.
   */
  sound?: SoundState;
  /**
   * The Hanseatic League (systems/league.ts) — the collective-trade institution.
   * Absent until a realm founds it (Hansa board only).
   */
  league?: LeagueState;
  /**
   * The rolled timeline of historical epoch events still to fire (systems/epochs.ts).
   * Set once at game start; entries are removed as they fire. Optional so legacy
   * saves load (undefined = no scheduled history, the events simply never fire).
   */
  epochs?: ScheduledEpoch[];
  /**
   * Epoch events that fired *this* turn, for the HUD to show as notifications.
   * Set during resolveTurn, cleared at the start of the next (like `battles`).
   */
  firedEpochs?: FiredEpochNote[];
  /** Pairwise relations, keyed by pairKey(a,b): −100..+100. */
  relations: Record<string, number>;
  /**
   * Opinion log: the dated discrete dealings behind each pair's relations
   * (keyed by pairKey(a,b)) — war, gifts, peace, pacts, trade — one merged entry
   * per reason, decaying each turn. Explains *why* a realm feels as it does; the
   * `relations` scalar remains what the AI acts on. Optional (legacy saves = none).
   */
  opinions?: Record<string, OpinionEvent[]>;
  /** Pairwise treaty status, keyed by pairKey(a,b). Missing = peace. */
  treaties: Record<string, TreatyStatus>;
  /**
   * The turn each pair's current unbroken peace began, keyed by pairKey(a,b).
   * Set when a war ends (makePeace) and cleared when war is declared; absent
   * means the two have been at peace since the founding (turn 1). Enduring peace
   * accrues "kept the peace" goodwill (diplomacy.ts). Optional — legacy saves
   * read as peace-since-founding, which is the correct default.
   */
  peaceSince?: Record<string, number>;
  /** Offers from AI nations awaiting the player's response. */
  offers: DiplomaticOffer[];
  nextOfferId: number;
  /** Difficulty chosen for this game (scales rivals). */
  difficulty: Difficulty;
  /**
   * Effective turn limit for the prestige-score tiebreak, from the Game-length
   * setting: a number (short 150 / standard 220 / long 300), or `null` for an
   * endless game (no score-limit — play until a decisive victory). Optional so
   * legacy saves load; a missing value back-fills to the standard TURN_LIMIT.
   */
  turnLimit?: number | null;
  /** Set once the game has been decided. */
  outcome: "playing" | "defeat" | "victory";
  /** How the game was decided (for the banner), e.g. "domination". */
  victoryKind?: string;
  /** Human-readable turn log, newest last. */
  log: string[];
  /**
   * The chronicle (E2): a curated, run-long list of the story's major beats —
   * wars, revolts, betrayals, falls, victory — in chronicle prose, oldest first.
   * Distinct from `log` (the transient last-50 feed): the chronicle persists and
   * feeds the end-game summary. Undefined on legacy saves = empty.
   */
  chronicle?: ChronicleEntry[];
  /**
   * Per-nation prestige score sampled once per turn (nation id → series, turn 1
   * first), for the end-game score graph. Barbarians are excluded; series stay
   * equal length (dead nations keep being sampled) so turns line up by index.
   */
  scoreHistory?: Record<number, number[]>;
  /**
   * Battles fought since the last turn resolved (transient): each End turn
   * clears the list, then armies/AI append reports as fights happen, so the UI
   * can surface a combat report for the player's battles. Not part of the
   * persistent game — dropped on save/load.
   */
  battles?: BattleReport[];
  /**
   * A decision awaiting the player's input, raised by a choice event. Purely
   * serialisable data (no functions); the effect of each option is looked up by
   * id in events.ts when the player resolves it. Undefined when nothing pends.
   */
  pendingChoice?: PendingChoice;
}

/** One selectable option in a pending decision (labels only — effect lives in events.ts). */
export interface ChoiceOption {
  id: string;
  label: string;
  detail: string;
}

/** A player decision raised by a choice event, awaiting resolution. */
export interface PendingChoice {
  /** The event id this decision belongs to (keys the option effects in events.ts). */
  eventId: string;
  prompt: string;
  options: ChoiceOption[];
}

/** A fresh research record. */
export function emptyResearch(): Research {
  return { current: null, progress: 0, done: [] };
}

/** The player is nation 0. */
export function playerNation(state: GameState): Nation {
  return state.nations[PLAYER_ID]!;
}

/** Look up a nation by id. */
export function nationById(state: GameState, id: number): Nation | undefined {
  return state.nations.find((n) => n.id === id);
}

/** Stable key for a pair of nations (order-independent). */
export function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * What, if anything, is destabilising a nation right now — the "reeling" read.
 * A realm gripped by famine, bankruptcy, or an open provincial revolt is
 * distracted and poorly placed to defend, so the AI's opportunism lowers its
 * required power edge against such a target (see `ai.ts` `doDiplomacy`). This
 * is the same signal, exposed as a pure helper so the player's HUD can show
 * exactly the read the AI acts on.
 */
export interface Instability {
  /** A national famine last turn (population starving). */
  famine: boolean;
  /** Treasury went negative last turn (troops disbanded, unrest spiked). */
  bankrupt: boolean;
  /** At least one owned region is in full revolt. */
  revolt: boolean;
  /** Any of the above — the nation is reeling and a tempting moment to strike. */
  reeling: boolean;
}

/** Assess a nation's current instability (famine / bankruptcy / open revolt). */
export function nationInstability(
  state: GameState,
  nationId: number,
): Instability {
  const nation = state.nations.find((n) => n.id === nationId);
  const famine = nation?.famine ?? false;
  const bankrupt = nation?.bankrupt ?? false;
  const revolt = state.regions.some(
    (r) => r.ownerId === nationId && r.unrest >= UNREST_REVOLT,
  );
  return { famine, bankrupt, revolt, reeling: famine || bankrupt || revolt };
}

/** Clamp a tax rate into the legal band. */
export function clampTax(rate: number): number {
  return Math.min(TAX_MAX, Math.max(TAX_MIN, rate));
}

/** The core (non-ware) resources, in display order. */
export const RESOURCE_KEYS = [
  "gold",
  "food",
  "knowledge",
] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];

/** A zeroed ware stockpile (every ware present at 0) — the wares analogue of ZERO_FLOW. */
export function emptyWares(): Wares {
  const w = {} as Wares;
  for (const id of GOOD_IDS) w[id] = 0;
  return w;
}

/** Round to one decimal place — keeps ware/stock numbers readable and stable. */
function ware1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** A copy of `wares` with `cost` subtracted (each floored at 0). Pure. */
export function spendWares(wares: Wares, cost: Partial<Record<GoodId, number>>): Wares {
  const out = { ...wares };
  for (const id of GOOD_IDS) {
    const c = cost[id];
    if (c) out[id] = Math.max(0, ware1(out[id] - c));
  }
  return out;
}

/** A copy of `wares` with `gain` added. Pure. */
export function addWares(wares: Wares, gain: Partial<Record<GoodId, number>>): Wares {
  const out = { ...wares };
  for (const id of GOOD_IDS) {
    const g = gain[id];
    if (g) out[id] = ware1(out[id] + g);
  }
  return out;
}

/** Whether `wares` can cover every ware in `cost`. Pure. */
export function canAfford(wares: Wares, cost: Partial<Record<GoodId, number>>): boolean {
  for (const id of GOOD_IDS) {
    const c = cost[id];
    if (c && wares[id] < c) return false;
  }
  return true;
}

/** A zeroed unit-count record. */
export function emptyUnits(): Record<UnitType, number> {
  const u = {} as Record<UnitType, number>;
  for (const t of UNIT_TYPES) u[t] = 0;
  return u;
}

/** Total number of units in a stack. Sums every unit type, so new units count. */
export function armySize(units: Record<UnitType, number>): number {
  let n = 0;
  for (const t of UNIT_TYPES) n += units[t];
  return n;
}

/** A per-turn production/consumption breakdown, used for the HUD and the sim. */
export type ResourceFlow = ResourceYield;

export const ZERO_FLOW: ResourceFlow = {
  food: 0,
  gold: 0,
  knowledge: 0,
};
