import { describe, expect, it } from "vitest";

import { deriveAlerts, type Alert } from "@/ui/alerts";
import { createGame } from "@/systems/turn";
import { PLAYER_ID, UNREST_REVOLT, type GameState } from "@/systems/state";
import type { TurnSummary } from "@/systems/summary";

/** A quiet (nothing-happened) summary; individual tests override fields. */
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

/** A fresh game with no player region in revolt (calm baseline). */
function calmGame(): GameState {
  const g = createGame({ seed: 4242, rivals: 2 });
  for (const r of g.regions) if (r.ownerId === PLAYER_ID) r.unrest = 0;
  return g;
}

const texts = (alerts: Alert[]): string[] => alerts.map((a) => a.text);

describe("deriveAlerts", () => {
  it("emits a danger alert for each region lost", () => {
    const alerts = deriveAlerts(calmGame(), quietSummary({ regionsLost: ["Aldia", "Bryn"] }));
    expect(alerts).toContainEqual({ severity: "danger", text: "Lost Aldia" });
    expect(alerts).toContainEqual({ severity: "danger", text: "Lost Bryn" });
  });

  it("emits a danger alert for each war declared", () => {
    const alerts = deriveAlerts(calmGame(), quietSummary({ warsDeclared: ["Rurik"] }));
    expect(alerts).toContainEqual({ severity: "danger", text: "Now at war with Rurik" });
  });

  it("emits a danger alert for famine", () => {
    const alerts = deriveAlerts(calmGame(), quietSummary({ famine: true }));
    expect(alerts).toContainEqual({ severity: "danger", text: "Famine — population starving" });
  });

  it("emits a danger alert for bankruptcy", () => {
    const alerts = deriveAlerts(calmGame(), quietSummary({ bankrupt: true }));
    expect(alerts).toContainEqual({ severity: "danger", text: "Bankruptcy — troops disbanded" });
  });

  it("raises a danger alert when a rival nears a victory", () => {
    const g = calmGame();
    const rival = g.nations.find((n) => !n.isPlayer && !n.isBarbarian)!;
    rival.wonders = 3; // 3/4 = 75% toward a Great Works win
    const alerts = deriveAlerts(g, quietSummary());
    expect(
      alerts.some((a) => a.severity === "danger" && a.text.startsWith(`${rival.name} nears a great works victory`)),
    ).toBe(true);
  });

  it("does not alarm on a rival comfortably short of any win", () => {
    const alerts = deriveAlerts(calmGame(), quietSummary());
    expect(alerts.some((a) => a.text.includes("nears a"))).toBe(false);
  });

  it("does not raise the near-victory alarm for the player's own lead", () => {
    const g = calmGame();
    g.nations[PLAYER_ID]!.wonders = 4; // player at a win — not an alert
    const alerts = deriveAlerts(g, quietSummary());
    expect(alerts.some((a) => a.text.includes("nears a"))).toBe(false);
  });

  it("emits good alerts for gains, eliminations, and techs", () => {
    const alerts = deriveAlerts(
      calmGame(),
      quietSummary({
        regionsGained: ["Cove"],
        eliminated: ["Rurik"],
        techsCompleted: ["writing"],
      }),
    );
    expect(alerts).toContainEqual({ severity: "good", text: "Captured Cove" });
    expect(alerts).toContainEqual({ severity: "good", text: "Rurik eliminated" });
    expect(alerts).toContainEqual({ severity: "good", text: "Researched Writing" });
  });

  it("scans state for player revolts and warns on each", () => {
    const g = calmGame();
    const mine = g.regions.filter((r) => r.ownerId === PLAYER_ID);
    expect(mine.length).toBeGreaterThan(0);
    mine[0]!.unrest = UNREST_REVOLT;
    mine[0]!.name = "Riotville";

    const alerts = deriveAlerts(g, quietSummary());
    expect(alerts).toContainEqual({ severity: "warn", text: "Revolt in Riotville" });
  });

  it("does not warn on a region below the revolt threshold or owned by others", () => {
    const g = calmGame();
    const mine = g.regions.filter((r) => r.ownerId === PLAYER_ID);
    mine[0]!.unrest = UNREST_REVOLT - 1; // just under
    // Force a non-player region above the threshold — must be ignored.
    const other = g.regions.find((r) => r.ownerId !== PLAYER_ID);
    if (other) other.unrest = UNREST_REVOLT + 20;

    const alerts = deriveAlerts(g, quietSummary());
    expect(alerts).toEqual([]);
  });

  it("surfaces active revolts even when summary is null", () => {
    const g = calmGame();
    const mine = g.regions.filter((r) => r.ownerId === PLAYER_ID);
    mine[0]!.unrest = UNREST_REVOLT + 5;
    mine[0]!.name = "Emberford";

    const alerts = deriveAlerts(g, null);
    expect(alerts).toEqual([{ severity: "warn", text: "Revolt in Emberford" }]);
  });

  it("returns nothing on a quiet turn with no revolts", () => {
    expect(deriveAlerts(calmGame(), quietSummary())).toEqual([]);
  });

  it("returns nothing when summary is null and no revolts are active", () => {
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
        techsCompleted: ["writing"],
      }),
    );

    expect(alerts).toHaveLength(6);
    // All six survivors are danger; the good alerts were dropped by the cap.
    expect(alerts.every((a) => a.severity === "danger")).toBe(true);
    expect(texts(alerts)).not.toContain("Captured G1");
  });

  it("orders danger → warn → good", () => {
    const g = calmGame();
    const mine = g.regions.filter((r) => r.ownerId === PLAYER_ID);
    mine[0]!.unrest = UNREST_REVOLT;
    mine[0]!.name = "Unruly";

    const alerts = deriveAlerts(
      g,
      quietSummary({ regionsLost: ["Fallen"], regionsGained: ["Won"] }),
    );

    expect(alerts.map((a) => a.severity)).toEqual(["danger", "warn", "good"]);
  });
});
