/**
 * Buildings — queued in a region's single production slot.
 *
 * Buildings are the first real spending decision (docs/game-design.md §3.3,
 * M2): they cost materials to construct over several turns and then modify that
 * region's economy, population capacity, or unrest. Content lives here as data
 * so balancing is editing this table, not the systems.
 *
 * Effects are additive modifiers applied per region:
 *   - `yield`      adds to the region's per-turn production
 *   - `popCapacity` raises the sustainable population cap
 *   - `unrest`     is subtracted from the region's unrest target (order)
 *
 * Numbers are illustrative starting values for tuning.
 */

import type { ResourceYield, StrategicResource, TerrainId } from "@/data/terrain";
import type { GoodId } from "@/data/goods";
import type { TechId } from "@/data/techs";
import type { FocusId } from "@/data/focuses";

export type BuildingId =
  | "farm"
  | "workshop"
  | "market"
  | "harbor"
  | "mine"
  | "library"
  | "temple"
  | "aqueduct"
  | "university"
  | "bank"
  | "guildhall"
  | "forum"
  | "fortress"
  | "granary"
  | "barracks"
  | "lighthouse"
  | "monastery"
  | "watchtower"
  | "courthouse"
  | "printing_house"
  | "cathedral"
  // Strategic-resource works — each needs the matching resource on the region.
  | "stable"
  | "bloomery"
  // Focus capstones — each needs the matching region focus (see requiresFocus).
  | "manor"
  | "charter_fair"
  | "foundry"
  | "athenaeum"
  | "citadel"
  // Signature Hansa buildings (Brick-Gothic vocabulary; see docs/hansa times.md §6).
  | "salzspeicher"
  | "brewery"
  | "weaving_works"
  | "canal"
  | "roland"
  | "hanse_hall";

export interface BuildingDef {
  id: BuildingId;
  name: string;
  /** Total units of the build ware required to complete construction. */
  cost: number;
  /** The ware construction consumes (default "timber"; brick for masonry, naval stores for ports). */
  buildWare?: GoodId;
  /** Additive per-turn yield of core resources (gold/food/knowledge) once built. */
  yield: Partial<ResourceYield>;
  /** Additive per-turn ware output once built — the wares an industry building produces. */
  wareYield?: Partial<Record<GoodId, number>>;
  /** Added to the region's population capacity. */
  popCapacity: number;
  /** Subtracted from the region's unrest target (an order-keeping effect). */
  unrest: number;
  /** Fortification levels added to the region on completion (one-time). */
  fortification?: number;
  /** Tech that must be researched before this can be built. */
  requiresTech?: TechId;
  /** Terrain the region must have — hidden entirely elsewhere (not just locked). */
  requiresTerrain?: TerrainId;
  /**
   * Strategic resource the region must hold (iron / horses) — a works that
   * *exploits* that resource, so a resource province is worth developing as well
   * as mustering from. Hidden where the region lacks the resource (design §3.2:
   * makes specific territory worth fighting for). Gate mirrors `requiresTerrain`.
   */
  requiresResource?: StrategicResource;
  /**
   * Region focus the province must be set to — a *focus capstone*, the payoff
   * for committing a region to a specialisation. Only offered where the region's
   * `focus` matches; changing focus doesn't remove one already built.
   */
  requiresFocus?: FocusId;
  /** One-line description for the build menu. */
  blurb: string;
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  farm: {
    id: "farm",
    name: "Farm",
    cost: 12,
    yield: { food: 3 },
    popCapacity: 4,
    unrest: 0,
    blurb: "+3 food, +4 population capacity.",
  },
  workshop: {
    id: "workshop",
    name: "Workshop",
    cost: 16,
    yield: {},
    wareYield: { timber: 3 },
    popCapacity: 0,
    unrest: 0,
    blurb: "+3 timber per turn — carpentry and joinery.",
  },
  market: {
    id: "market",
    name: "Market",
    cost: 16,
    yield: { gold: 3 },
    popCapacity: 0,
    unrest: 0,
    blurb: "+3 gold per turn (before tax).",
  },
  harbor: {
    id: "harbor",
    name: "Harbor",
    cost: 20,
    buildWare: "naval_stores",
    yield: { gold: 3, food: 2 },
    popCapacity: 2,
    unrest: 0,
    requiresTerrain: "coast",
    blurb: "+3 gold, +2 food, +2 population capacity. Coast regions only.",
  },
  mine: {
    id: "mine",
    name: "Mine",
    cost: 22,
    yield: { gold: 2 },
    wareYield: { iron: 4, copper: 1 },
    popCapacity: 0,
    unrest: 0,
    requiresTech: "masonry",
    requiresTerrain: "mountains",
    blurb: "+4 iron, +2 gold. Mountain regions only. (Masonry)",
  },
  library: {
    id: "library",
    name: "Scriptorium",
    cost: 20,
    yield: { knowledge: 2 },
    popCapacity: 0,
    unrest: 0,
    blurb: "+2 knowledge per turn — a scriptorium of charters and portolans.",
  },
  temple: {
    id: "temple",
    name: "Church",
    cost: 14,
    yield: {},
    popCapacity: 0,
    unrest: 12,
    blurb: "-12 unrest — a Brick-Gothic church keeps a taxed town in order.",
  },
  aqueduct: {
    id: "aqueduct",
    name: "Wells & Cistern",
    cost: 22,
    yield: { food: 3 },
    popCapacity: 6,
    unrest: 0,
    requiresTech: "irrigation",
    blurb: "+3 food, +6 population capacity — wells and a cistern water a growing town. (Irrigation)",
  },
  university: {
    id: "university",
    name: "University",
    cost: 24,
    yield: { knowledge: 4 },
    popCapacity: 0,
    unrest: 0,
    requiresTech: "mathematics",
    blurb: "+4 knowledge per turn. (Mathematics)",
  },
  bank: {
    id: "bank",
    name: "Counting House",
    cost: 24,
    yield: { gold: 5 },
    popCapacity: 0,
    unrest: 0,
    requiresTech: "banking",
    blurb: "+5 gold per turn — merchant banking and the bill of exchange. (Banking)",
  },
  guildhall: {
    id: "guildhall",
    name: "Guildhall",
    cost: 30,
    yield: { gold: 3 },
    wareYield: { timber: 3 },
    popCapacity: 0,
    unrest: 0,
    requiresTech: "economics",
    blurb: "+3 gold, +3 timber — the economy branch's workshop-and-market in one. (Economics)",
  },
  hanse_hall: {
    id: "hanse_hall",
    name: "Hanse Hall",
    cost: 24,
    yield: { gold: 2 },
    popCapacity: 0,
    unrest: 5,
    requiresTech: "lubeck_law",
    blurb: "+2 gold, -5 unrest — the merchant guild's seat. Build it to found the Hanseatic League. (Lübeck Law)",
  },
  forum: {
    id: "forum",
    name: "Council Chamber",
    cost: 26,
    yield: { knowledge: 2 },
    popCapacity: 0,
    unrest: 6,
    requiresTech: "philosophy",
    blurb: "+2 knowledge, -6 unrest — burghers govern themselves under Lübeck Law. (Philosophy)",
  },
  fortress: {
    id: "fortress",
    name: "City Walls",
    cost: 28,
    buildWare: "brick",
    yield: {},
    popCapacity: 0,
    unrest: 0,
    fortification: 2,
    requiresTech: "engineering",
    blurb: "+2 fortification — brick walls and a gatehouse (a Holstentor) a besieger dreads. (Engineering)",
  },
  granary: {
    id: "granary",
    name: "Speicher",
    cost: 14,
    yield: { food: 2 },
    popCapacity: 4,
    unrest: 0,
    requiresTech: "pottery",
    blurb: "+2 food, +4 population capacity — a gabled Speicher against lean years. (Pottery)",
  },
  barracks: {
    id: "barracks",
    name: "Muster Hall",
    cost: 16,
    yield: {},
    popCapacity: 0,
    unrest: 8,
    requiresTech: "warcraft",
    blurb: "-8 unrest — a drilled town watch keeps a martial town in order. (Warcraft)",
  },
  lighthouse: {
    id: "lighthouse",
    name: "Lighthouse",
    cost: 20,
    buildWare: "naval_stores",
    yield: { gold: 3, food: 1 },
    popCapacity: 2,
    unrest: 0,
    requiresTech: "cartography",
    requiresTerrain: "coast",
    blurb: "+3 gold, +1 food, +2 population. Coast only. (Cartography)",
  },
  monastery: {
    id: "monastery",
    name: "Monastery",
    cost: 20,
    yield: { knowledge: 3 },
    popCapacity: 0,
    unrest: 6,
    requiresTech: "scholasticism",
    blurb: "+3 knowledge, -6 unrest — scholars and quiet order. (Scholasticism)",
  },
  watchtower: {
    id: "watchtower",
    name: "Coastal Beacon",
    cost: 18,
    buildWare: "brick",
    yield: {},
    popCapacity: 0,
    unrest: 3,
    fortification: 1,
    requiresTech: "castles",
    blurb: "+1 fortification, -3 unrest — a warded, watched shore. (Castles)",
  },
  courthouse: {
    id: "courthouse",
    name: "Rathaus",
    cost: 24,
    buildWare: "brick",
    yield: {},
    popCapacity: 0,
    unrest: 14,
    requiresTech: "common_law",
    blurb: "-14 unrest — the Rathaus and Lübeck Law tame a restless province. (Common Law)",
  },
  printing_house: {
    id: "printing_house",
    name: "Printing House",
    cost: 26,
    yield: { knowledge: 6 },
    popCapacity: 0,
    unrest: 0,
    requiresTech: "printing",
    blurb: "+6 knowledge per turn — the press multiplies learning. (Printing)",
  },
  cathedral: {
    id: "cathedral",
    name: "Dom",
    cost: 34,
    buildWare: "brick",
    yield: { knowledge: 2, gold: 1 },
    popCapacity: 0,
    unrest: 10,
    requiresTech: "theology",
    blurb: "+2 knowledge, +1 gold, -10 unrest — a great brick Dom. (Theology)",
  },

  // --- Strategic-resource works ----------------------------------------------
  // Each exploits the resource that already gates a premium unit, so holding
  // iron/horse land is worth *developing*, not just mustering from — deepening the
  // "specific territory worth fighting for" decision (design §3.2). Both yield build
  // wares (timber / iron → armies & works), so they aid the military/expansion
  // path without swelling gold.
  stable: {
    id: "stable",
    name: "Stable",
    cost: 20,
    yield: { gold: 2 },
    wareYield: { timber: 2 },
    popCapacity: 2,
    unrest: 0,
    requiresTech: "husbandry",
    requiresResource: "horses",
    blurb: "+2 timber, +2 gold, +2 population. Horse country only. (Husbandry)",
  },
  bloomery: {
    id: "bloomery",
    name: "Bloomery",
    cost: 24,
    yield: {},
    wareYield: { iron: 5 },
    popCapacity: 0,
    unrest: 0,
    requiresTech: "metallurgy",
    requiresResource: "iron",
    blurb: "+5 iron — ironworks that forge the realm's arms. Iron country only. (Metallurgy)",
  },

  // --- Focus capstones -------------------------------------------------------
  // Each needs BOTH the matching region focus and an Age-of-Crowns tech — the
  // reward for committing a province to a specialisation and researching into it.
  manor: {
    id: "manor",
    name: "Manor",
    cost: 28,
    yield: { food: 4, gold: 1 },
    popCapacity: 8,
    unrest: 0,
    requiresTech: "feudalism",
    requiresFocus: "farmland",
    blurb: "+4 food, +1 gold, +8 population — a great manorial estate. Farmland focus. (Feudalism)",
  },
  charter_fair: {
    id: "charter_fair",
    name: "Charter Fair",
    cost: 30,
    yield: { gold: 7 },
    popCapacity: 0,
    unrest: 0,
    requiresTech: "guilds",
    requiresFocus: "market",
    blurb: "+7 gold — a chartered fair that draws merchants for leagues. Market focus. (Guilds)",
  },
  foundry: {
    id: "foundry",
    name: "Foundry",
    cost: 30,
    yield: { gold: 1 },
    wareYield: { iron: 6 },
    popCapacity: 0,
    unrest: 0,
    requiresTech: "engineering",
    requiresFocus: "workshop",
    blurb: "+6 iron, +1 gold — furnaces and casting works. Workshops focus. (Engineering)",
  },
  athenaeum: {
    id: "athenaeum",
    name: "Great School",
    cost: 30,
    yield: { knowledge: 6 },
    popCapacity: 0,
    unrest: 3,
    requiresTech: "philosophy",
    requiresFocus: "academy",
    blurb: "+6 knowledge, -3 unrest — a great house of learning. Academy focus. (Philosophy)",
  },
  citadel: {
    id: "citadel",
    name: "Citadel",
    cost: 32,
    buildWare: "brick",
    yield: {},
    popCapacity: 0,
    unrest: 8,
    fortification: 3,
    requiresTech: "castles",
    requiresFocus: "garrison",
    blurb: "+3 fortification, -8 unrest — an impregnable stronghold. Garrison focus. (Castles)",
  },

  // --- Signature Hansa buildings ---------------------------------------------
  // The Brick-Gothic vocabulary the era is known for (docs/hansa times.md §6):
  // a salt store, an export brewery, a canal, and the Roland freedom-monument.
  // Early, un-gated economy/order buildings (bar the ambitious Canal) — the
  // League's own flavour, sitting beside the core economy set.
  salzspeicher: {
    id: "salzspeicher",
    name: "Salzspeicher",
    cost: 20,
    yield: { gold: 3 },
    popCapacity: 2,
    unrest: 0,
    blurb: "+3 gold, +2 population — a salt warehouse; the ‘white gold’ underwrites the town's trade.",
  },
  brewery: {
    id: "brewery",
    name: "Export Brewery",
    cost: 22,
    yield: { gold: 2 },
    wareYield: { beer: 3 },
    popCapacity: 1,
    unrest: 0,
    blurb: "+3 beer, +2 gold — Wendish hopped beer, prized across the north, brewed for export.",
  },
  weaving_works: {
    id: "weaving_works",
    name: "Weaving Works",
    cost: 24,
    yield: { gold: 1 },
    wareYield: { cloth: 3 },
    popCapacity: 1,
    unrest: 0,
    requiresTech: "guilds",
    blurb: "+3 cloth, +1 gold — a weaving hall spins upland wool into the great western cloth. (Guilds)",
  },
  canal: {
    id: "canal",
    name: "Canal",
    cost: 30,
    buildWare: "naval_stores",
    yield: { gold: 3, food: 1 },
    popCapacity: 2,
    unrest: 0,
    requiresTech: "engineering",
    blurb: "+3 gold, +1 food, +2 population — a Stecknitz-style canal carries salt and goods inland. (Engineering)",
  },
  roland: {
    id: "roland",
    name: "Roland Statue",
    cost: 18,
    yield: { gold: 1 },
    popCapacity: 0,
    unrest: 10,
    blurb: "+1 gold, -10 unrest — a Roland proclaims the town's freedom and market rights.",
  },
};

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

/**
 * Whether a region's current focus permits this building. A building with no
 * `requiresFocus` builds anywhere; a focus capstone only where the region's
 * `focus` matches. Pure — the shared gate used by the sim, UI, advisor and AI.
 */
export function buildingFocusOk(regionFocus: FocusId | undefined, building: BuildingId): boolean {
  const req = BUILDINGS[building].requiresFocus;
  return !req || req === regionFocus;
}

/** The focus-capstone building a given focus unlocks, if any (for hints / AI). */
export function focusCapstone(focus: FocusId): BuildingId | undefined {
  return BUILDING_IDS.find((b) => BUILDINGS[b].requiresFocus === focus);
}

/**
 * Whether a region's strategic resource permits this building. A building with no
 * `requiresResource` builds anywhere; a resource works only where the region holds
 * that resource. Pure — the shared gate (mirrors `buildingFocusOk`) used by the
 * sim, build menu, advisor and AI.
 */
export function buildingResourceOk(
  regionResource: StrategicResource | null | undefined,
  building: BuildingId,
): boolean {
  const req = BUILDINGS[building].requiresResource;
  return !req || req === regionResource;
}

/** Units of the build ware invested into a region's queued building each turn (if funded). */
export const BUILD_RATE = 6;
