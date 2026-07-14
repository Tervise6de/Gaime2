/**
 * UI layer.
 *
 * Presentational components and HUD (resource bars, panels, tooltips, menus).
 * The UI observes game state and emits intents; it never mutates simulation
 * state directly. Kept deliberately lightweight — DOM/CSS over the canvas
 * rather than a heavyweight framework.
 *
 * Export UI modules here as they are added.
 */
export { createHud } from "@/ui/hud";
export type { Hud, HudCallbacks } from "@/ui/hud";
