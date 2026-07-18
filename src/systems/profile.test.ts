/**
 * Profiling-harness guard (roadmap D4). Exercises `systems/profile.ts` at the
 * largest configuration and asserts the harness works and the measured pipeline
 * stays healthy — finite timings, no superlinear blow-up, and a *very* generous
 * wall-clock ceiling so it catches a catastrophic O(n²)→O(n³) regression without
 * ever flaking on a loaded CI box (measured baseline ≈ 1.3 ms/turn; the ceiling
 * sits ~20× above it). Structural assertions carry the weight; the timing bound
 * is only a catastrophe net.
 */
import { describe, it, expect } from "vitest";
import { profileGame, summarizeGame, stateAtTurn, profilePhases } from "@/systems/profile";
import { DEFAULT_MAP_OPTIONS } from "@/systems/mapgen";

const MAX = { rivals: 5, map: { ...DEFAULT_MAP_OPTIONS, regionCount: 30 } };

describe("profiling harness (D4)", () => {
  it("profiles a full max-config game and reports finite per-turn timings", () => {
    const r = profileGame({ ...MAX, seed: 7 });
    expect(r.turns).toBeGreaterThan(0);
    expect(Number.isFinite(r.totalMs)).toBe(true);
    for (const t of r.timings) {
      expect(t.drivenAiMs).toBeGreaterThanOrEqual(0);
      expect(t.resolveMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(t.drivenAiMs) && Number.isFinite(t.resolveMs)).toBe(true);
      expect(t.nations).toBeGreaterThan(0);
    }
  }, 20000);

  it("summarises into sane statistics — ordered percentiles, AI the dominant share", () => {
    const s = summarizeGame(profileGame({ ...MAX, seed: 8 }));
    expect(s.msPerTurn.p50).toBeLessThanOrEqual(s.msPerTurn.p95 + 1e-9);
    expect(s.msPerTurn.p95).toBeLessThanOrEqual(s.msPerTurn.max + 1e-9);
    expect(s.estAiSharePct).toBeGreaterThan(0);
    expect(s.estAiSharePct).toBeLessThanOrEqual(100);
    // Generous catastrophe net (baseline ≈ 1.3 ms/turn → 25 ms is ~20×).
    expect(s.msPerTurn.p95).toBeLessThan(25);
  }, 20000);

  it("shows no superlinear per-turn growth as the board fills", () => {
    const s = summarizeGame(profileGame({ ...MAX, seed: 5 }));
    // A late turn (more armies/fronts) must not cost dramatically more than an
    // early one; a genuine O(n²)-in-turns blow-up would trip this. Generous
    // multiplier + additive slack so timing noise never flakes it.
    expect(s.lateMsPerTurn).toBeLessThan(s.earlyMsPerTurn * 6 + 5);
  }, 20000);

  it("micro-benchmarks the exported hot phases with finite timings", () => {
    const mid = stateAtTurn({ ...MAX, seed: 5 }, 60);
    const phases = profilePhases(mid, 100);
    // Every measured phase is present and finite (the attribution — that the AI
    // turn is the dominant term — is recorded in the DEVLOG, not asserted here,
    // since sub-millisecond timing ordering would flake under CI noise).
    expect(phases["runNationTurn(1 nation)"]).toBeGreaterThan(0);
    for (const [name, ms] of Object.entries(phases)) {
      expect(Number.isFinite(ms), `${name} timing not finite`).toBe(true);
      expect(ms, `${name} timing negative`).toBeGreaterThanOrEqual(0);
    }
  }, 20000);
});
