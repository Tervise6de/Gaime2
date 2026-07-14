/**
 * Game systems.
 *
 * Each system owns one slice of simulation (map generation, economy, combat,
 * AI, scoring, victory, the turn pipeline). Systems are pure over `GameState`
 * and never touch the DOM or the network — they are unit-tested in isolation.
 * Rendering lives in `@/render`; DOM/HUD lives in `@/ui`.
 */

export * from "@/systems/types";
export * from "@/systems/rng";
export * from "@/systems/data";
export * from "@/systems/geometry";
export * from "@/systems/mapgen";
export * from "@/systems/state";
export * from "@/systems/economy";
export * from "@/systems/combat";
export * from "@/systems/actions";
export * from "@/systems/scoring";
export * from "@/systems/ai";
export * from "@/systems/victory";
export * from "@/systems/turn";
