/**
 * Game systems.
 *
 * Each system owns one slice of simulation (economy, population, military,
 * diplomacy, turn/tick scheduling, rendering, input). Systems read and mutate
 * game state but stay decoupled from one another and from the UI layer.
 *
 * Re-export systems here as they are added.
 */
export { createRenderer } from "@/systems/renderer";
export type { Renderer } from "@/systems/renderer";
