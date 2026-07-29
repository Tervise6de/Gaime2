import { describe, it, expect } from "vitest";
import {
  CAMPAIGN_DWELL,
  MAX_ROAD_COST,
  STEP_COST,
  campaignBlurb,
  campaignRoad,
  onCampaignRoad,
  planCampaign,
  reassessCampaigns,
  warOpensRoad,
} from "@/systems/campaign";
import { bestTarget, focusTarget, runNationTurn } from "@/systems/ai";
import { createGame } from "@/systems/turn";
import { createRng } from "@/systems/rng";
import { declareWar, makePeace, atWar } from "@/systems/diplomacy";
import { KONTORE } from "@/data/kontore";
import { PLAYER_ID, type GameState } from "@/systems/state";

const NOVGOROD_REGION = KONTORE.novgorod.regionId;

/** The realm that starts holding Novgorod, and one that starts nowhere near it. */
const HOLDER = 14; // Novgorod
const ESTONIA = 11;

function game(turn = 20): GameState {
  return { ...createGame({ seed: 5 }), turn };
}

describe("a road to somewhere", () => {
  it("costs own ground least and an ally's ground most", () => {
    const g = game();
    // Cheapest road from Estonia to the Kontor it borders: straight over the
    // frontier, so exactly one foreign province at the peace price.
    const road = campaignRoad(g, ESTONIA, NOVGOROD_REGION);
    expect(road).not.toBeNull();
    expect(road!.road.at(-1)).toBe(NOVGOROD_REGION);
    expect(g.regions[road!.road[0]!]?.ownerId).toBe(ESTONIA);
    // Every hop is adjacent to the last — it is a march, not a teleport.
    for (let i = 1; i < road!.road.length; i++) {
      expect(g.regions[road!.road[i - 1]!]!.adjacency).toContain(road!.road[i]);
    }
    // Opening a war on the holder makes the same road cheaper: a province you
    // are already fighting over costs less to plan through than a peace.
    const atWarG = declareWar(g, ESTONIA, HOLDER);
    expect(campaignRoad(atWarG, ESTONIA, NOVGOROD_REGION)!.cost).toBeLessThan(road!.cost);
    expect(road!.cost - campaignRoad(atWarG, ESTONIA, NOVGOROD_REGION)!.cost).toBe(
      STEP_COST.peace - STEP_COST.atWar,
    );
  });

  it("refuses a prize that is half a continent and three wars away", () => {
    const g = game();
    // London, from the far eastern end of the board.
    const far = campaignRoad(g, HOLDER, KONTORE.london.regionId);
    expect(far).toBeNull();
    // ...because the honest road is dearer than any realm should plan for.
    expect(MAX_ROAD_COST).toBeLessThan(STEP_COST.peace * 4);
  });

  it("has no road to ground it already holds", () => {
    const g = game();
    expect(campaignRoad(g, HOLDER, NOVGOROD_REGION)).toBeNull();
  });
});

describe("a realm takes an aim and holds it", () => {
  it("gives a merchant a Kontor to march on, and leaves a builder alone", () => {
    const base = game();
    const nations = base.nations.map((n) =>
      n.id === ESTONIA ? { ...n, strategy: "commerce" as const } : n.isPlayer || n.isBarbarian ? n : { ...n, strategy: "prestige" as const },
    );
    const aimed = reassessCampaigns({ ...base, nations });
    const estonia = aimed.nations.find((n) => n.id === ESTONIA)!;
    expect(estonia.campaign?.objectiveId).toBe(NOVGOROD_REGION);
    // A realm playing for renown builds; it does not raise a host and march.
    for (const n of aimed.nations) {
      if (n.id === ESTONIA || n.isPlayer || n.isBarbarian) continue;
      expect(n.campaign).toBeUndefined();
    }
  });

  it("does not re-aim every turn — the levy is already raised", () => {
    const base = game();
    const nations = base.nations.map((n) => (n.id === ESTONIA ? { ...n, strategy: "commerce" as const } : n));
    let g = reassessCampaigns({ ...base, nations });
    const first = g.nations.find((n) => n.id === ESTONIA)!.campaign!;
    // Even a change of plan mid-march does not turn the host around.
    g = {
      ...g,
      turn: g.turn + CAMPAIGN_DWELL - 1,
      nations: g.nations.map((n) => (n.id === ESTONIA ? { ...n, strategy: "prestige" as const } : n)),
    };
    g = reassessCampaigns(g);
    expect(g.nations.find((n) => n.id === ESTONIA)!.campaign).toEqual(first);
    // Once the dwell is up, a realm with no plan for a march drops the aim.
    g = reassessCampaigns({ ...g, turn: g.turn + 2 });
    expect(g.nations.find((n) => n.id === ESTONIA)!.campaign).toBeUndefined();
  });

  it("drops the aim the moment the prize is taken", () => {
    const base = game();
    const nations = base.nations.map((n) => (n.id === ESTONIA ? { ...n, strategy: "commerce" as const } : n));
    const aimed = reassessCampaigns({ ...base, nations });
    expect(aimed.nations.find((n) => n.id === ESTONIA)!.campaign).toBeDefined();
    const won: GameState = {
      ...aimed,
      regions: aimed.regions.map((r) => (r.id === NOVGOROD_REGION ? { ...r, ownerId: ESTONIA } : r)),
    };
    expect(reassessCampaigns(won).nations.find((n) => n.id === ESTONIA)!.campaign).toBeUndefined();
  });
});

describe("the plan on this board", () => {
  function aimed(turn = 20): GameState {
    const base = game(turn);
    const nations = base.nations.map((n) =>
      n.id === ESTONIA ? { ...n, strategy: "commerce" as const, campaign: { objectiveId: NOVGOROD_REGION, since: 1 } } : n,
    );
    return { ...base, nations };
  }

  it("names the next province and whose peace is in the way", () => {
    const g = aimed();
    const plan = planCampaign(g, ESTONIA)!;
    expect(plan.objectiveId).toBe(NOVGOROD_REGION);
    expect(plan.stepId).toBe(NOVGOROD_REGION); // it borders the prize already
    expect(plan.blockedBy).toBe(HOLDER);
    expect(warOpensRoad(plan, HOLDER)).toBe(true);
    expect(warOpensRoad(plan, ESTONIA)).toBe(false);
    // At war, the road is open and there is nothing to declare.
    const open = planCampaign(declareWar(g, ESTONIA, HOLDER), ESTONIA)!;
    expect(open.blockedBy).toBeNull();
  });

  it("puts the road's province ahead of a richer one off it", () => {
    // A two-hop road: Estonia is playing for Prussia's seat, and the first
    // province it has to take on the way is Gotland's, not the prize itself.
    const PRUSSIA_SEAT = 66;
    const GOTLAND = 9;
    const base = game(40);
    const withAim: GameState = {
      ...base,
      nations: base.nations.map((n) =>
        n.id === ESTONIA
          ? { ...n, strategy: "conquest" as const, campaign: { objectiveId: PRUSSIA_SEAT, since: 30 } }
          : n,
      ),
      armies: [],
    };
    const atWarG = declareWar(withAim, ESTONIA, GOTLAND);
    const plan = planCampaign(atWarG, ESTONIA)!;
    expect(plan.stepId).not.toBe(plan.objectiveId); // the road really has a middle
    expect(onCampaignRoad(plan, plan.stepId)).toBe(true);

    const frontier = atWarG.regions.find(
      (r) => r.ownerId === ESTONIA && r.adjacency.includes(plan.stepId),
    )!;
    // A fatter province on the same frontier, off the road: without a campaign
    // this is plainly the better prize, and taking it instead is exactly the
    // wandering that used to stop realms ever arriving anywhere.
    const lureId = frontier.adjacency.find(
      (id) => id !== plan.stepId && atWarG.regions[id]?.ownerId !== ESTONIA,
    )!;
    const g: GameState = {
      ...atWarG,
      regions: atWarG.regions.map((r) =>
        r.id === lureId ? { ...r, ownerId: GOTLAND, population: r.population + 12, fortification: 0 } : r,
      ),
    };
    const units = { ...base.armies[0]!.units };
    for (const key of Object.keys(units) as (keyof typeof units)[]) units[key] = 0;
    units.infantry = 14;
    const army = { id: 9001, regionId: frontier.id, units };

    expect(bestTarget(g, army, ESTONIA, null)).toBe(lureId);
    expect(bestTarget(g, army, ESTONIA, plan)).toBe(plan.stepId);

    // The massing plan reads the same road. Two stacks too small to take either
    // province alone, so `focusTarget` has something to mass against at all.
    const small = { ...units, infantry: 1 };
    const massed: GameState = {
      ...g,
      regions: g.regions.map((r) => (r.id === plan.stepId ? { ...r, fortification: 4 } : r)),
      armies: [
        { ...base.armies[0]!, id: 9001, regionId: frontier.id, units: small },
        { ...base.armies[0]!, id: 9002, regionId: frontier.id, units: small },
      ],
    };
    expect(focusTarget(massed, ESTONIA, null)).toBe(lureId);
    expect(focusTarget(massed, ESTONIA, plan)).toBe(plan.stepId);
  });

  it("tells the player where a rival's host is pointed", () => {
    const g = aimed();
    const blurb = campaignBlurb(g, planCampaign(g, ESTONIA));
    expect(blurb).toMatch(/Kontor/);
    expect(blurb).toContain(g.regions[NOVGOROD_REGION]!.name);
    expect(campaignBlurb(g, null)).toBeNull();
  });

  it("will not plan a road it has sworn not to walk", () => {
    // A truce with the realm in the way prices its ground near-impassable, so
    // the campaign does not sit there waiting to break a word it will not break.
    const g = aimed();
    const sworn = makePeace(declareWar(g, ESTONIA, HOLDER), ESTONIA, HOLDER);
    const truced = campaignRoad(sworn, ESTONIA, NOVGOROD_REGION);
    const plain = campaignRoad(g, ESTONIA, NOVGOROD_REGION);
    expect(truced === null || truced.cost > plain!.cost).toBe(true);
  });
});

describe("a war of passage", () => {
  it("is opened for the road, and only by a realm strong enough to walk it", () => {
    // Estonia, aimed at the Kontor next door, holding most of the board's land
    // so the power edge is beyond argument. Without the campaign it has no
    // quarrel with Novgorod at all — relations are cordial, which is exactly
    // why it never went anywhere before.
    const base = game(40);
    const strong: GameState = {
      ...base,
      nations: base.nations.map((n) =>
        n.id === ESTONIA
          ? { ...n, strategy: "commerce" as const, campaign: { objectiveId: NOVGOROD_REGION, since: 30 } }
          : n,
      ),
      regions: base.regions.map((r) =>
        r.ownerId === HOLDER || r.ownerId === PLAYER_ID ? r : { ...r, ownerId: ESTONIA },
      ),
    };
    expect(atWar(strong, ESTONIA, HOLDER)).toBe(false);
    const marched = runNationTurn(strong, ESTONIA, createRng(3));
    expect(atWar(marched, ESTONIA, HOLDER)).toBe(true);

    // The same board with no aim: no war, because nothing is in the way of
    // anything. The declaration is the campaign's doing, not the map's.
    const idle: GameState = {
      ...strong,
      nations: strong.nations.map((n) => (n.id === ESTONIA ? { ...n, campaign: undefined } : n)),
    };
    expect(atWar(runNationTurn(idle, ESTONIA, createRng(3)), ESTONIA, HOLDER)).toBe(false);
  }, 20_000);
});

describe("gold buys the muster", () => {
  it("covers the ware a levy is short of instead of hoarding the treasury", () => {
    // The state rivals actually got themselves into: a full treasury, an empty
    // ware chest, and every muster refused for want of timber. The realm has no
    // army at all, so it is plainly below any target it could have.
    const base = game(30);
    const g: GameState = {
      ...base,
      armies: base.armies.filter((a) => a.ownerId !== ESTONIA),
      nations: base.nations.map((n) =>
        n.id === ESTONIA
          ? {
              ...n,
              stocks: { ...n.stocks, gold: 3000 },
              wares: Object.fromEntries(Object.keys(n.wares).map((k) => [k, 0])) as typeof n.wares,
            }
          : n,
      ),
    };
    const after = runNationTurn(g, ESTONIA, createRng(1));
    const soldiers = after.armies
      .filter((a) => a.ownerId === ESTONIA)
      .reduce((sum, a) => sum + Object.values(a.units).reduce((x, y) => x + y, 0), 0);
    expect(soldiers).toBeGreaterThan(0);
    expect(after.nations.find((n) => n.id === ESTONIA)!.stocks.gold).toBeLessThan(3000);
  }, 20_000);
});
