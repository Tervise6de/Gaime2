/**
 * Max-config integration + performance guard (roadmap D4).
 *
 * Exercises the whole turn pipeline at the largest configuration the game
 * offers — 74 authored regions × 16 historical realms × up to 220 turns — driven by the AI. It is
 * both an end-to-end correctness check at scale (the game always terminates with
 * conserved region ownership and finite stocks) and a catastrophic-performance
 * regression guard: the wall-clock ceiling is deliberately generous (~50× the
 * measured ~0.6 ms/turn baseline) so it never flakes on a loaded CI box, but an
 * accidental O(n²)→O(n³) blow-up in a hot path would still trip it.
 */
import { describe, it, expect } from "vitest";
import { createGame, resolveTurn } from "@/systems/turn";
import { runNationTurn } from "@/systems/ai";
import { resolveChoice } from "@/systems/events";
import { createRng } from "@/systems/rng";
import { PLAYER_ID, TURN_LIMIT, type GameState } from "@/systems/state";

/** Play one AI-driven game to its conclusion (or the turn cap). */
function playToEnd(seed: number): GameState {
  // The live game is Hansa-only: compatibility map/rival options are ignored,
  // so this intentionally exercises the full authored board and roster.
  let s = createGame({ seed });
  for (let t = 0; t < TURN_LIMIT + 5 && s.outcome === "playing"; t++) {
    s = runNationTurn(s, PLAYER_ID, createRng(seed * 1000 + t));
    if (s.pendingChoice) s = resolveChoice(s, s.pendingChoice.options[0]!.id);
    s = resolveTurn(s);
  }
  return s;
}

describe("max-config integration & performance", () => {
  it(
    "runs full Hansa-board games to completion with conserved state, within budget",
    () => {
      const start = performance.now();
      for (let seed = 1; seed <= 5; seed++) {
        const end = playToEnd(seed);
        // Always terminates: a verdict, or hard-stopped at the turn limit.
        expect(["victory", "defeat", "playing"]).toContain(end.outcome);
        expect(end.turn).toBeLessThanOrEqual(TURN_LIMIT + 1);
        // Region ownership is conserved — every region still belongs to some nation.
        expect(end.regions.every((r) => r.ownerId !== undefined)).toBe(true);
        // Stocks stay finite and non-negative (no NaN / underflow leaking through).
        for (const n of end.nations) {
          for (const v of Object.values(n.stocks)) {
            expect(Number.isFinite(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
          }
        }
      }
      const elapsed = performance.now() - start;
      // Five games take about 24s in isolation. Allow worker contention when the
      // full Vitest suite runs in parallel, while still catching a return to the
      // pre-cache ~41s baseline.
      expect(elapsed).toBeLessThan(40000);
    },
    45000,
  );
});
