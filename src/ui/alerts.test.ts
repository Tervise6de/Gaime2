import { describe, expect, it } from "vitest";

import { deriveAlerts, type Alert } from "@/ui/alerts";
import { createGame } from "@/systems/turn";
import { PLAYER_ID, UNREST_REVOLT, type GameState } from "@/systems/state";
import type { TurnSummary } from "@/systems/summary";

function quietSummary(overrides: Partial<TurnSummary> = {}): TurnSummary {
  return {
    goldDelta: 0,
    regionsGained: [],
    regionsLost: [],
    warsDeclared: [],
    peaceMade: [],
    eliminated: [],
    techsCompleted: [],
    famine: false,
    bankrupt: false,
    quiet: true,
    ...overrides,
  };
}

function calmGame(): GameState {
  const g = createGame({ seed: 4242, rivals: 2 });
  for (const r of g.regions) if (r.ownerId === PLAYER_ID) r.unrest = 0;
  return g;
}

const texts = (alerts: Alert[]): string[] => alerts.map((a) => a.text);

describe("deriveAlerts", () => {
  it("emits danger alerts for losses, wars, famine, and bankruptcy", () => {
    const alerts = deriveAlerts(
      calmGame(),
      quietSummary({ regionsLost: ["Aldia"], warsDeclared: ["Rurik"], famine: true, bankrupt: true }),
    );
    expect(alerts).toContainEqual({ severity: "danger", text: "Lost Aldia" });
    expect(alerts).toContainEqual({ severity: "danger", text: "Now at war with Rurik" });
    expect(alerts).toContainEqual({ severity: "danger", text: "Famine — population starving" });
    expect(alerts).toContainEqual({ severity: "danger", text: "Bankruptcy — troops disbanded" });
  });

  it("raises a danger alert when a rival nears domination", () => {
    const g = calmGame();
    const rival = g.nations.find((n) => !n.isPlayer && !n.isBarbarian)!;
    let assigned = 0;
    const target = Math.ceil(g.regions.filter((r) => r.ownerId !== null).length * 0.5);
    for (const r of g.regions) {
      if (r.ownerId !== null && assigned < target) {
        r.ownerId = rival.id;
        assigned++;
      }
    }
    const alerts = deriveAlerts(g, quietSummary());
    expect(
      alerts.some((a) => a.severity === "danger" && a.text.startsWith(`${rival.name} nears a domination victory`)),
    ).toBe(true);
  });

  it("does not alarm on a rival comfortably short of any win or on the player's own lead", () => {
    expect(deriveAlerts(calmGame(), quietSummary()).some((a) => a.text.includes("nears a"))).toBe(false);
    const g = calmGame();
    for (const r of g.regions) if (r.ownerId !== null) r.ownerId = PLAYER_ID;
    expect(deriveAlerts(g, quietSummary()).some((a) => a.text.includes("nears a"))).toBe(false);
  });

  it("emits good alerts for gains, eliminations, and techs", () => {
    const alerts = deriveAlerts(
      calmGame(),
      quietSummary({ regionsGained: ["Cove"], eliminated: ["Rurik"], techsCompleted: ["free_trade"] }),
    );
    expect(alerts).toContainEqual({ severity: "good", text: "Captured Cove" });
    expect(alerts).toContainEqual({ severity: "good", text: "Rurik eliminated" });
    expect(alerts).toContainEqual({ severity: "good", text: "Researched Free Trade Principles" });
  });

  it("scans state for player revolts and warns on each", () => {
    const g = calmGame();
    const mine = g.regions.filter((r) => r.ownerId === PLAYER_ID);
    mine[0]!.unrest = UNREST_REVOLT;
    mine[0]!.name = "Riotville";
    expect(deriveAlerts(g, quietSummary())).toContainEqual({ severity: "warn", text: "Revolt in Riotville" });
  });

  it("ignores below-threshold and non-player revolts", () => {
    const g = calmGame();
    const mine = g.regions.filter((r) => r.ownerId === PLAYER_ID);
    mine[0]!.unrest = UNREST_REVOLT - 1;
    const other = g.regions.find((r) => r.ownerId !== PLAYER_ID);
    if (other) other.unrest = UNREST_REVOLT + 20;
    expect(deriveAlerts(g, quietSummary())).toEqual([]);
  });

  it("surfaces active revolts even when summary is null", () => {
    const g = calmGame();
    const mine = g.regions.filter((r) => r.ownerId === PLAYER_ID);
    mine[0]!.unrest = UNREST_REVOLT + 5;
    mine[0]!.name = "Emberford";
    expect(deriveAlerts(g, null)).toEqual([{ severity: "warn", text: "Revolt in Emberford" }]);
  });

  it("returns nothing on a quiet turn with no revolts", () => {
    expect(deriveAlerts(calmGame(), quietSummary())).toEqual([]);
    expect(deriveAlerts(calmGame(), null)).toEqual([]);
  });

  it("caps the list at 6 and keeps danger first", () => {
    const alerts = deriveAlerts(
      calmGame(),
      quietSummary({
        regionsLost: ["R1", "R2"],
        warsDeclared: ["W1", "W2"],
        famine: true,
        bankrupt: true,
        regionsGained: ["G1"],
        eliminated: ["E1"],
        techsCompleted: ["free_trade"],
      }),
    );
    expect(alerts).toHaveLength(6);
    expect(alerts.every((a) => a.severity === "danger")).toBe(true);
    expect(texts(alerts)).not.toContain("Captured G1");
  });

  it("orders danger, warn, then good", () => {
    const g = calmGame();
    const mine = g.regions.filter((r) => r.ownerId === PLAYER_ID);
    mine[0]!.unrest = UNREST_REVOLT;
    mine[0]!.name = "Unruly";
    const alerts = deriveAlerts(g, quietSummary({ regionsLost: ["Fallen"], regionsGained: ["Won"] }));
    expect(alerts.map((a) => a.severity)).toEqual(["danger", "warn", "good"]);
  });
});
