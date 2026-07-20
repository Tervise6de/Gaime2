/**
 * Research — the **Doctrines** system (docs/game-design.md §3.6).
 *
 * Research is no longer a "collect every tech" tree. It is a set of six
 * **categories** (Commerce, Maritime, Production, Governance, Military,
 * Scholarship), and each category offers two or three **doctrine paths** that
 * are *mutually exclusive*: the first node you take in a category commits you to
 * that path for the rest of the game and rejects the siblings. Each path is a
 * short ladder of tier nodes unlocked in order by spending knowledge.
 *
 * The result is a run of permanent identity choices — "Open Markets *or*
 * Strong Monopoly", "Knightly Orders *or* Town Levies" — where each pick buys a
 * distinct bundle of effects and denies the alternatives (design goal: a lot of
 * research, driven by key A/B/C decisions with real opportunity cost).
 *
 * **Effects are declarative data** so balancing is editing this table, not code.
 * A node's effects aggregate over a nation's completed-node list exactly as the
 * old flat techs did, so every downstream consumer (economy, unrest, unlocks)
 * keeps working — see systems/tech.ts. The one new effect is `tradeMult`, wired
 * into trade-route income (systems/trade.ts).
 *
 * **Era-gated:** deeper tiers belong to later ages (data/eras.ts) so a path
 * unfolds across the game rather than all at once.
 *
 * The basics a realm always needs — the militia/infantry/ranged/cavalry core,
 * the everyday buildings, the resource works — are NOT gated here (they are
 * available from the start, terrain/resource/focus permitting). Doctrines gate
 * only the *advanced* buildings and *premium* units that give a realm its edge.
 */

import type { BuildingId } from "@/data/buildings";
import type { UnitType } from "@/data/units";
import type { ResourceYield } from "@/data/terrain";

/** The six research categories (the sidebar of the research screen). */
export type ResearchCategory =
  | "commerce"
  | "maritime"
  | "production"
  | "governance"
  | "military"
  | "scholarship";

/** A doctrine path id (a commitment column within a category). */
export type DoctrinePathId =
  | "open_markets"
  | "regulated_guilds"
  | "staple_monopoly"
  | "merchant_marine"
  | "naval_power"
  | "craft_guilds"
  | "heavy_industry"
  | "free_cities"
  | "league_federation"
  | "princely_rule"
  | "chivalric_orders"
  | "town_levies"
  | "monastic_learning"
  | "civic_humanism";

/** A single doctrine node (one rung of a path). Kept as `TechId`/`TECHS` so the
    rest of the codebase — which aggregates effects over a nation's done-list —
    needs no structural change. */
export type TechId =
  // Commerce
  | "free_trade" | "low_tariffs" | "open_prosperity"
  | "council_oversight" | "regulated_guilds_charter" | "stable_growth"
  | "exclusive_charters" | "monopoly_rights" | "company_dominance"
  // Maritime
  | "cog_fleets" | "bulk_shipping" | "carrack_trade"
  | "sea_escorts" | "war_cogs" | "ship_bombards"
  // Production
  | "craft_workshops" | "luxury_crafts" | "master_artisans"
  | "bulk_mining" | "forge_works" | "arms_industry"
  // Governance
  | "town_charters" | "civic_autonomy" | "burgher_republic"
  | "lubeck_law" | "kontor_network" | "hanseatic_diet"
  | "territorial_lordship" | "standing_administration" | "absolute_rule"
  // Military
  | "feudal_host" | "knightly_orders" | "heavy_horse"
  | "town_watch" | "drilled_infantry" | "gunpowder_shot"
  // Scholarship
  | "monastic_orders" | "scriptoria" | "cathedral_schools"
  | "town_schools" | "the_press" | "humanist_academies";

export interface ResearchCategoryDef {
  id: ResearchCategory;
  name: string;
  glyph: string;
  /** Accent colour for the category (paths tint from it). */
  color: string;
  blurb: string;
  /** The doctrine paths this category offers, in display order. */
  paths: DoctrinePathId[];
}

export interface DoctrinePathDef {
  id: DoctrinePathId;
  category: ResearchCategory;
  name: string;
  /** One-line character of the path (shown under its name). */
  tagline: string;
  /** A sentence describing what committing to it means. */
  blurb: string;
  /** The ordered tier nodes; index === tier. */
  nodes: TechId[];
}

export interface TechDef {
  id: TechId;
  name: string;
  category: ResearchCategory;
  path: DoctrinePathId;
  /** 0-based rung within the path (its predecessor is tier-1 of the same path). */
  tier: number;
  /** Knowledge required to research this node. */
  cost: number;
  /** The age (0-based era index) this node becomes researchable in. */
  era: number;
  blurb: string;
  /** Multiplicative yield bonus on gold/food/knowledge, e.g. { gold: 0.15 } = +15%. */
  yieldMult?: Partial<ResourceYield>;
  /** Additive bonus to all ware output, e.g. 0.1 = +10% wares. */
  wareMult?: number;
  /** Additive bonus to trade-route income, e.g. 0.12 = +12% (systems/trade.ts). */
  tradeMult?: number;
  /** Flat change to every owned region's unrest target (positive = calmer). */
  unrestReduction?: number;
  unlockBuilding?: BuildingId;
  unlockUnit?: UnitType;
}

export const CATEGORIES: Record<ResearchCategory, ResearchCategoryDef> = {
  commerce: {
    id: "commerce", name: "Commerce", glyph: "💰", color: "#f4d27a",
    blurb: "How your realm runs its trade — open and free, guild-regulated, or a tight monopoly.",
    paths: ["open_markets", "regulated_guilds", "staple_monopoly"],
  },
  maritime: {
    id: "maritime", name: "Maritime", glyph: "⚓", color: "#6fb6d8",
    blurb: "The sea itself — bulk merchant fleets, or war-cogs that guard the lanes.",
    paths: ["merchant_marine", "naval_power"],
  },
  production: {
    id: "production", name: "Production", glyph: "🧱", color: "#d89a5c",
    blurb: "What your land makes — fine luxury crafts, or mines, forges and arms.",
    paths: ["craft_guilds", "heavy_industry"],
  },
  governance: {
    id: "governance", name: "Governance", glyph: "⚖️", color: "#b79ae0",
    blurb: "Who rules — free burgher towns, the League's federation, or a central prince.",
    paths: ["free_cities", "league_federation", "princely_rule"],
  },
  military: {
    id: "military", name: "Military", glyph: "⚔️", color: "#e0776b",
    blurb: "How you make war — mounted knightly orders, or drilled town levies of pike and shot.",
    paths: ["chivalric_orders", "town_levies"],
  },
  scholarship: {
    id: "scholarship", name: "Scholarship", glyph: "📖", color: "#7fc9a8",
    blurb: "How you learn — the cloister and cathedral, or secular universities and the press.",
    paths: ["monastic_learning", "civic_humanism"],
  },
};

export const PATHS: Record<DoctrinePathId, DoctrinePathDef> = {
  // --- Commerce -------------------------------------------------------------
  open_markets: {
    id: "open_markets", category: "commerce",
    name: "Open Markets", tagline: "Freedom and opportunity",
    blurb: "A realm built on liberty and competition. Merchants trade freely and foreign traders flock in — trade booms, but you skim less from it.",
    nodes: ["free_trade", "low_tariffs", "open_prosperity"],
  },
  regulated_guilds: {
    id: "regulated_guilds", category: "commerce",
    name: "Balanced Control", tagline: "Stability through balance",
    blurb: "The council and the guilds share the reins. Steady, dependable gold and calm towns, without the extremes.",
    nodes: ["council_oversight", "regulated_guilds_charter", "stable_growth"],
  },
  staple_monopoly: {
    id: "staple_monopoly", category: "commerce",
    name: "Strong Monopoly", tagline: "Control and concentration",
    blurb: "Exclusive charters and staple rights concentrate the profits in your hands — enormous wealth, but resented at home and abroad.",
    nodes: ["exclusive_charters", "monopoly_rights", "company_dominance"],
  },
  // --- Maritime -------------------------------------------------------------
  merchant_marine: {
    id: "merchant_marine", category: "maritime",
    name: "Merchant Marine", tagline: "Cogs, ports and bulk trade",
    blurb: "Fleets of fat cogs and deep harbours move goods in bulk — the richest trade at sea.",
    nodes: ["cog_fleets", "bulk_shipping", "carrack_trade"],
  },
  naval_power: {
    id: "naval_power", category: "maritime",
    name: "Naval Power", tagline: "War fleets and guarded lanes",
    blurb: "War-cogs and bombards protect the sea-lanes and cow rivals — safer, calmer trade, and heavy guns.",
    nodes: ["sea_escorts", "war_cogs", "ship_bombards"],
  },
  // --- Production -----------------------------------------------------------
  craft_guilds: {
    id: "craft_guilds", category: "production",
    name: "Craft Guilds", tagline: "Fine crafts and luxury wares",
    blurb: "Master weavers and craftsmen turn out high-value luxury wares that trade at a premium.",
    nodes: ["craft_workshops", "luxury_crafts", "master_artisans"],
  },
  heavy_industry: {
    id: "heavy_industry", category: "production",
    name: "Heavy Industry", tagline: "Mines, forges and arms",
    blurb: "Deep mines and roaring forges pour out raw wares, walls and weapons.",
    nodes: ["bulk_mining", "forge_works", "arms_industry"],
  },
  // --- Governance -----------------------------------------------------------
  free_cities: {
    id: "free_cities", category: "governance",
    name: "Free Cities", tagline: "Burgher self-rule",
    blurb: "Self-governing towns under their own council chambers — content, loyal and quietly prosperous.",
    nodes: ["town_charters", "civic_autonomy", "burgher_republic"],
  },
  league_federation: {
    id: "league_federation", category: "governance",
    name: "League Federation", tagline: "Kontore, diets and common policy",
    blurb: "The Hanseatic League itself — Kontore, diets and a common trade policy that binds the north. Founds the League.",
    nodes: ["lubeck_law", "kontor_network", "hanseatic_diet"],
  },
  princely_rule: {
    id: "princely_rule", category: "governance",
    name: "Princely Rule", tagline: "Central authority and order",
    blurb: "A single strong hand — courts, a standing administration and, at the last, absolute rule. Order and gold, at trade's expense.",
    nodes: ["territorial_lordship", "standing_administration", "absolute_rule"],
  },
  // --- Military -------------------------------------------------------------
  chivalric_orders: {
    id: "chivalric_orders", category: "military",
    name: "Chivalric Orders", tagline: "Mailed cavalry and siege",
    blurb: "The crusading orders' mailed fist — heavy Knights and the great siege engines that break walls.",
    nodes: ["feudal_host", "knightly_orders", "heavy_horse"],
  },
  town_levies: {
    id: "town_levies", category: "military",
    name: "Town Levies", tagline: "Pike, shot and city walls",
    blurb: "The burgher militias — disciplined Pikemen, Swordsmen and, in time, Handgunners.",
    nodes: ["town_watch", "drilled_infantry", "gunpowder_shot"],
  },
  // --- Scholarship ----------------------------------------------------------
  monastic_learning: {
    id: "monastic_learning", category: "scholarship",
    name: "Monastic Learning", tagline: "Cloister, chronicle and faith",
    blurb: "Monasteries and cathedrals keep the chronicle and the peace — deep learning and calm, devout towns.",
    nodes: ["monastic_orders", "scriptoria", "cathedral_schools"],
  },
  civic_humanism: {
    id: "civic_humanism", category: "scholarship",
    name: "Civic Humanism", tagline: "Universities and the press",
    blurb: "Town universities and the printing press pour out secular learning — the fastest knowledge in the north.",
    nodes: ["town_schools", "the_press", "humanist_academies"],
  },
};

export const TECHS: Record<TechId, TechDef> = {
  // === Commerce ============================================================
  free_trade: {
    id: "free_trade", name: "Free Trade Principles", category: "commerce", path: "open_markets", tier: 0, era: 0, cost: 28,
    tradeMult: 0.08, yieldMult: { knowledge: 0.05 },
    blurb: "+8% trade income, +5% knowledge — merchants trade where they please.",
  },
  low_tariffs: {
    id: "low_tariffs", name: "Low Tariffs", category: "commerce", path: "open_markets", tier: 1, era: 2, cost: 55,
    tradeMult: 0.12, yieldMult: { gold: 0.06 }, unlockBuilding: "bank",
    blurb: "+12% trade, +6% gold; unlocks the Counting House — low tolls draw foreign traders.",
  },
  open_prosperity: {
    id: "open_prosperity", name: "Widespread Prosperity", category: "commerce", path: "open_markets", tier: 2, era: 3, cost: 95,
    tradeMult: 0.15, yieldMult: { knowledge: 0.1 }, unrestReduction: 3,
    blurb: "+15% trade, +10% knowledge, calmer towns — a broad, contented merchant class.",
  },
  council_oversight: {
    id: "council_oversight", name: "Council Oversight", category: "commerce", path: "regulated_guilds", tier: 0, era: 0, cost: 30,
    yieldMult: { gold: 0.08 }, unrestReduction: 3,
    blurb: "+8% gold, calmer towns — the council keeps trade orderly.",
  },
  regulated_guilds_charter: {
    id: "regulated_guilds_charter", name: "Regulated Guilds", category: "commerce", path: "regulated_guilds", tier: 1, era: 2, cost: 55,
    yieldMult: { gold: 0.1 }, wareMult: 0.08, unlockBuilding: "guildhall",
    blurb: "+10% gold, +8% ware output; unlocks the Guildhall.",
  },
  stable_growth: {
    id: "stable_growth", name: "Stable Growth", category: "commerce", path: "regulated_guilds", tier: 2, era: 3, cost: 90,
    yieldMult: { gold: 0.12 }, unrestReduction: 5,
    blurb: "+12% gold, much calmer towns — dependable, unspectacular prosperity.",
  },
  exclusive_charters: {
    id: "exclusive_charters", name: "Exclusive Charters", category: "commerce", path: "staple_monopoly", tier: 0, era: 0, cost: 32,
    yieldMult: { gold: 0.12 }, unrestReduction: -2,
    blurb: "+12% gold, but resentment (+unrest) — trade rights granted to a favoured few.",
  },
  monopoly_rights: {
    id: "monopoly_rights", name: "Monopoly Rights", category: "commerce", path: "staple_monopoly", tier: 1, era: 2, cost: 60,
    tradeMult: 0.14, yieldMult: { gold: 0.08 },
    blurb: "+14% trade, +8% gold — a staple town every cargo must pass through.",
  },
  company_dominance: {
    id: "company_dominance", name: "Company Dominance", category: "commerce", path: "staple_monopoly", tier: 2, era: 3, cost: 100,
    yieldMult: { gold: 0.18 }, tradeMult: 0.12, unrestReduction: -3,
    blurb: "+18% gold, +12% trade, but deep resentment — the company all but rules.",
  },

  // === Maritime ============================================================
  cog_fleets: {
    id: "cog_fleets", name: "Cog Fleets", category: "maritime", path: "merchant_marine", tier: 0, era: 0, cost: 28,
    tradeMult: 0.08, yieldMult: { gold: 0.04 }, unlockBuilding: "lighthouse",
    blurb: "+8% trade, +4% gold; unlocks the Lighthouse — fleets of sturdy cogs.",
  },
  bulk_shipping: {
    id: "bulk_shipping", name: "Bulk Shipping", category: "maritime", path: "merchant_marine", tier: 1, era: 2, cost: 52,
    tradeMult: 0.12, wareMult: 0.06, unlockBuilding: "canal",
    blurb: "+12% trade, +6% ware output; unlocks the Canal — cheap carriage of bulk goods.",
  },
  carrack_trade: {
    id: "carrack_trade", name: "Carrack Trade", category: "maritime", path: "merchant_marine", tier: 2, era: 3, cost: 88,
    tradeMult: 0.15, yieldMult: { gold: 0.08 },
    blurb: "+15% trade, +8% gold — great carracks reach further, richer markets.",
  },
  sea_escorts: {
    id: "sea_escorts", name: "Sea Escorts", category: "maritime", path: "naval_power", tier: 0, era: 0, cost: 30,
    tradeMult: 0.06, unrestReduction: 2, unlockBuilding: "watchtower",
    blurb: "+6% trade, safer shores; unlocks the Coastal Beacon — escorted convoys.",
  },
  war_cogs: {
    id: "war_cogs", name: "War Cogs", category: "maritime", path: "naval_power", tier: 1, era: 2, cost: 55,
    tradeMult: 0.06, wareMult: 0.08,
    blurb: "+6% trade, +8% ware output — castled war-cogs cow the pirates.",
  },
  ship_bombards: {
    id: "ship_bombards", name: "Ship Bombards", category: "maritime", path: "naval_power", tier: 2, era: 3, cost: 90,
    tradeMult: 0.06, unrestReduction: 4,
    blurb: "+6% trade, much safer lanes — bombard-armed ships rule the narrows.",
  },

  // === Production ==========================================================
  craft_workshops: {
    id: "craft_workshops", name: "Craft Workshops", category: "production", path: "craft_guilds", tier: 0, era: 0, cost: 28,
    wareMult: 0.08, yieldMult: { gold: 0.04 },
    blurb: "+8% ware output, +4% gold — busy town workshops.",
  },
  luxury_crafts: {
    id: "luxury_crafts", name: "Luxury Crafts", category: "production", path: "craft_guilds", tier: 1, era: 2, cost: 52,
    wareMult: 0.12, tradeMult: 0.06,
    blurb: "+12% ware output, +6% trade — fine cloth, wax and worked goods for export.",
  },
  master_artisans: {
    id: "master_artisans", name: "Master Artisans", category: "production", path: "craft_guilds", tier: 2, era: 3, cost: 88,
    wareMult: 0.15, tradeMult: 0.08,
    blurb: "+15% ware output, +8% trade — master-worked luxuries trade at a premium.",
  },
  bulk_mining: {
    id: "bulk_mining", name: "Bulk Mining", category: "production", path: "heavy_industry", tier: 0, era: 0, cost: 30,
    wareMult: 0.1, yieldMult: { gold: 0.02 },
    blurb: "+10% ware output — deeper mines, more iron, copper and salt.",
  },
  forge_works: {
    id: "forge_works", name: "Forge Works", category: "production", path: "heavy_industry", tier: 1, era: 2, cost: 55,
    wareMult: 0.12, yieldMult: { gold: 0.04 }, unlockBuilding: "fortress",
    blurb: "+12% ware output, +4% gold; unlocks City Walls — great forges and brickworks.",
  },
  arms_industry: {
    id: "arms_industry", name: "Arms Industry", category: "production", path: "heavy_industry", tier: 2, era: 3, cost: 92,
    wareMult: 0.16,
    blurb: "+16% ware output — foundries that arm and wall a realm.",
  },

  // === Governance ==========================================================
  town_charters: {
    id: "town_charters", name: "Town Charters", category: "governance", path: "free_cities", tier: 0, era: 0, cost: 28,
    yieldMult: { gold: 0.04 }, unrestReduction: 5, unlockBuilding: "forum",
    blurb: "+4% gold, calmer towns; unlocks the Council Chamber — chartered self-rule.",
  },
  civic_autonomy: {
    id: "civic_autonomy", name: "Civic Autonomy", category: "governance", path: "free_cities", tier: 1, era: 2, cost: 52,
    yieldMult: { gold: 0.06 }, unrestReduction: 6,
    blurb: "+6% gold, very calm towns — burghers who govern themselves rarely revolt.",
  },
  burgher_republic: {
    id: "burgher_republic", name: "Burgher Republic", category: "governance", path: "free_cities", tier: 2, era: 3, cost: 88,
    yieldMult: { gold: 0.08 }, tradeMult: 0.08, unrestReduction: 6,
    blurb: "+8% gold, +8% trade, calm towns — a proud, loyal merchant republic.",
  },
  lubeck_law: {
    id: "lubeck_law", name: "Lübeck Law", category: "governance", path: "league_federation", tier: 0, era: 0, cost: 30,
    tradeMult: 0.05, unrestReduction: 3, unlockBuilding: "hanse_hall",
    blurb: "+5% trade, calmer towns; unlocks the Hanse Hall — the shared charter that founds the League.",
  },
  kontor_network: {
    id: "kontor_network", name: "Kontor Network", category: "governance", path: "league_federation", tier: 1, era: 2, cost: 55,
    tradeMult: 0.12, yieldMult: { gold: 0.04 },
    blurb: "+12% trade, +4% gold — Kontore at Bergen, Bruges, London and Novgorod.",
  },
  hanseatic_diet: {
    id: "hanseatic_diet", name: "Hanseatic Diet", category: "governance", path: "league_federation", tier: 2, era: 3, cost: 90,
    tradeMult: 0.12, unrestReduction: 6,
    blurb: "+12% trade, calmer towns — the diet bargains like a prince for its merchants.",
  },
  territorial_lordship: {
    id: "territorial_lordship", name: "Territorial Lordship", category: "governance", path: "princely_rule", tier: 0, era: 0, cost: 30,
    yieldMult: { gold: 0.06 }, unrestReduction: 6, unlockBuilding: "courthouse",
    blurb: "+6% gold, calmer towns; unlocks the Rathaus — one lord's writ runs the land.",
  },
  standing_administration: {
    id: "standing_administration", name: "Standing Administration", category: "governance", path: "princely_rule", tier: 1, era: 2, cost: 55,
    yieldMult: { gold: 0.08 }, unrestReduction: 6,
    blurb: "+8% gold, calmer towns — paid officials and standing courts.",
  },
  absolute_rule: {
    id: "absolute_rule", name: "Absolute Rule", category: "governance", path: "princely_rule", tier: 2, era: 4, cost: 95,
    yieldMult: { gold: 0.12 }, unrestReduction: 10, tradeMult: -0.04,
    blurb: "+12% gold, very calm towns, but -4% trade — the crown's word is law, and free trade suffers.",
  },

  // === Military ============================================================
  feudal_host: {
    id: "feudal_host", name: "Feudal Host", category: "military", path: "chivalric_orders", tier: 0, era: 0, cost: 30,
    wareMult: 0.06, unrestReduction: 2,
    blurb: "+6% ware output, steadier land — sworn vassals answer the muster.",
  },
  knightly_orders: {
    id: "knightly_orders", name: "Knightly Orders", category: "military", path: "chivalric_orders", tier: 1, era: 2, cost: 55,
    wareMult: 0.08, unlockUnit: "knight",
    blurb: "+8% ware output; unlocks Knights — mailed shock cavalry, death to loose shot.",
  },
  heavy_horse: {
    id: "heavy_horse", name: "Siege Trains", category: "military", path: "chivalric_orders", tier: 2, era: 3, cost: 88,
    wareMult: 0.1, unrestReduction: 2, unlockUnit: "siege",
    blurb: "+10% ware output; unlocks Siege engines that strip a fortress bare.",
  },
  town_watch: {
    id: "town_watch", name: "Town Watch", category: "military", path: "town_levies", tier: 0, era: 0, cost: 28,
    wareMult: 0.04, unrestReduction: 4, unlockUnit: "pikeman",
    blurb: "+4% ware output, calmer towns; unlocks Pikemen — a drilled anti-cavalry wall.",
  },
  drilled_infantry: {
    id: "drilled_infantry", name: "Drilled Infantry", category: "military", path: "town_levies", tier: 1, era: 2, cost: 52,
    wareMult: 0.08, unrestReduction: 2, unlockUnit: "swordsman",
    blurb: "+8% ware output; unlocks Swordsmen — hard, well-armoured men-at-arms.",
  },
  gunpowder_shot: {
    id: "gunpowder_shot", name: "Gunpowder Shot", category: "military", path: "town_levies", tier: 2, era: 3, cost: 90,
    wareMult: 0.1, unlockUnit: "handgunner",
    blurb: "+10% ware output; unlocks Handgunners — early firearms that punch through foot.",
  },

  // === Scholarship =========================================================
  monastic_orders: {
    id: "monastic_orders", name: "Monastic Orders", category: "scholarship", path: "monastic_learning", tier: 0, era: 0, cost: 26,
    yieldMult: { knowledge: 0.12 }, unrestReduction: 4, unlockBuilding: "monastery",
    blurb: "+12% knowledge, calmer towns; unlocks the Monastery — scholars and quiet order.",
  },
  scriptoria: {
    id: "scriptoria", name: "Scriptoria", category: "scholarship", path: "monastic_learning", tier: 1, era: 2, cost: 50,
    yieldMult: { knowledge: 0.18 }, unrestReduction: 2,
    blurb: "+18% knowledge, calmer towns — cloisters copying charters and chronicles.",
  },
  cathedral_schools: {
    id: "cathedral_schools", name: "Cathedral Schools", category: "scholarship", path: "monastic_learning", tier: 2, era: 3, cost: 85,
    yieldMult: { knowledge: 0.15 }, unrestReduction: 6, unlockBuilding: "cathedral",
    blurb: "+15% knowledge, very calm towns; unlocks the Dom — a great brick cathedral.",
  },
  town_schools: {
    id: "town_schools", name: "Town Schools", category: "scholarship", path: "civic_humanism", tier: 0, era: 0, cost: 28,
    yieldMult: { knowledge: 0.15 }, unlockBuilding: "university",
    blurb: "+15% knowledge; unlocks the University — secular town learning.",
  },
  the_press: {
    id: "the_press", name: "The Printing Press", category: "scholarship", path: "civic_humanism", tier: 1, era: 2, cost: 52,
    yieldMult: { knowledge: 0.25 }, unlockBuilding: "printing_house",
    blurb: "+25% knowledge; unlocks the Printing House — the press multiplies learning.",
  },
  humanist_academies: {
    id: "humanist_academies", name: "Humanist Academies", category: "scholarship", path: "civic_humanism", tier: 2, era: 3, cost: 88,
    yieldMult: { knowledge: 0.2, gold: 0.06 },
    blurb: "+20% knowledge, +6% gold — humanist academies draw scholars and patrons.",
  },
};

export const TECH_IDS = Object.keys(TECHS) as TechId[];
export const CATEGORY_IDS = Object.keys(CATEGORIES) as ResearchCategory[];
export const PATH_IDS = Object.keys(PATHS) as DoctrinePathId[];

/** The doctrine path a node belongs to. */
export function pathOf(id: TechId): DoctrinePathDef {
  return PATHS[TECHS[id].path];
}

/** The node that must be completed immediately before `id` (its lower tier in
    the same path), or null when `id` is the tier-0 opener of its path. */
export function predecessorOf(id: TechId): TechId | null {
  const def = TECHS[id];
  if (def.tier === 0) return null;
  return PATHS[def.path].nodes[def.tier - 1] ?? null;
}
