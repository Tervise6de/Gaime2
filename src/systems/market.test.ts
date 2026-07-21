import { describe, it, expect } from "vitest";
import {
  marketBuyPrice,
  marketSellPrice,
  maxBuyable,
  maxSellable,
  buyWare,
  sellWare,
} from "@/systems/market";
import { GOODS } from "@/data/goods";
import {
  MARKET_BUY_MULT,
  MARKET_SELL_MULT,
  PLAYER_ID,
  emptyWares,
  type GameState,
  type Nation,
} from "@/systems/state";

function nation(over: Partial<Nation> = {}): Nation {
  return {
    id: PLAYER_ID, name: "You", color: "#000", isPlayer: true, isBarbarian: false, alive: true,
    stocks: { gold: 100, food: 0, knowledge: 0 }, wares: emptyWares(), taxRate: 0,
    research: { current: null, progress: 0, done: [] }, famine: false, bankrupt: false, ...over,
  };
}

function state(n: Nation): GameState {
  return {
    seed: 1, rngState: 1, turn: 1, nations: [n], regions: [], armies: [], nextArmyId: 0,
    routes: [], nextRouteId: 0, relations: {}, treaties: {}, offers: [], nextOfferId: 0,
    difficulty: "normal", outcome: "playing", log: [],
  } as unknown as GameState;
}

describe("market pricing", () => {
  it("buys dear and sells cheap (a spread worse than a route)", () => {
    expect(marketBuyPrice("iron")).toBe(GOODS.iron.value * MARKET_BUY_MULT);
    expect(marketSellPrice("iron")).toBe(GOODS.iron.value * MARKET_SELL_MULT);
    // The buy price always exceeds the sell price — you lose on a round trip.
    expect(marketBuyPrice("grain")).toBeGreaterThan(marketSellPrice("grain"));
  });
});

describe("buyWare", () => {
  it("adds wares and debits gold at the buy price", () => {
    const s = state(nation({ stocks: { gold: 100, food: 0, knowledge: 0 } }));
    const after = buyWare(s, PLAYER_ID, "brick", 5);
    const n = after.nations[0]!;
    expect(n.wares.brick).toBe(5);
    expect(n.stocks.gold).toBe(100 - 5 * marketBuyPrice("brick"));
  });

  it("clamps the buy to what the treasury can afford", () => {
    const price = marketBuyPrice("amber"); // 6 * 2 = 12
    const s = state(nation({ stocks: { gold: price * 3 + 1, food: 0, knowledge: 0 } }));
    expect(maxBuyable(s, PLAYER_ID, "amber")).toBe(3);
    const after = buyWare(s, PLAYER_ID, "amber", 10); // over-ask trimmed to 3
    expect(after.nations[0]!.wares.amber).toBe(3);
    expect(after.nations[0]!.stocks.gold).toBe(price * 3 + 1 - price * 3);
  });

  it("is a no-op when nothing can be bought", () => {
    const s = state(nation({ stocks: { gold: 0, food: 0, knowledge: 0 } }));
    expect(buyWare(s, PLAYER_ID, "iron", 5)).toBe(s);
    expect(buyWare(s, PLAYER_ID, "iron", 0)).toBe(s);
  });
});

describe("sellWare", () => {
  it("removes wares and credits gold at the sell price", () => {
    const s = state(nation({ wares: { ...emptyWares(), furs: 8 } }));
    const after = sellWare(s, PLAYER_ID, "furs", 5);
    const n = after.nations[0]!;
    expect(n.wares.furs).toBe(3);
    expect(n.stocks.gold).toBe(100 + 5 * marketSellPrice("furs"));
  });

  it("clamps the sale to the stockpile and only sells whole units", () => {
    const s = state(nation({ wares: { ...emptyWares(), wool: 2.6 } }));
    expect(maxSellable(s, PLAYER_ID, "wool")).toBe(2);
    const after = sellWare(s, PLAYER_ID, "wool", 10);
    expect(after.nations[0]!.wares.wool).toBe(0.6);
    expect(after.nations[0]!.stocks.gold).toBe(100 + 2 * marketSellPrice("wool"));
  });

  it("is a no-op with an empty stockpile", () => {
    const s = state(nation());
    expect(sellWare(s, PLAYER_ID, "cloth", 5)).toBe(s);
  });
});
