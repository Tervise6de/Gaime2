/**
 * Static game data (content definitions).
 *
 * Buildings, resources, technologies, units, events — declared as plain,
 * serialisable data separate from the systems that consume them. Keeping
 * content here (rather than hard-coded in systems) makes balancing and
 * modding a matter of editing data, not logic.
 *
 * Export data tables here as they are added.
 */
export { TERRAIN, TERRAIN_LIST, COASTAL_GOLD_BONUS } from "@/data/terrain";
export type { TerrainDef } from "@/data/terrain";
