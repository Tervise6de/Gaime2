/**
 * The town market (R5, docs/game-design.md R5) — the treasury's working capital.
 *
 * Gold buys the wares a realm lacks, or sells its surplus for gold, at the local
 * market. The spread is deliberately worse than a Kontor route (buy dear at
 * MARKET_BUY_MULT × value, sell cheap at MARKET_SELL_MULT × value), so the great
 * Hansa trade stays the profit engine and the market is the liquidity valve:
 * import grain against a lean turn, buy brick to rush a wall, muster arms in a
 * hurry, or turn a glut into coin without a standing route. Instant — no lane, no
 * Kontor: the local factor's counting house, not the Kontor trade.
 *
 * Pure state-transition intents (like military.ts `raiseUnit`) — no RNG, no DOM.
 * Every buy/sell is clamped to what the treasury or the stockpile can actually
 * cover, so an over-ask is trimmed rather than rejected.
 */

import { GOODS, type GoodId } from "@/data/goods";
import { round1 } from "@/systems/economy";
import {
  MARKET_BUY_MULT,
  MARKET_SELL_MULT,
  nationById,
  type GameState,
} from "@/systems/state";

/** Gold one unit of `good` fetches when sold on the market (its value, cheapened). */
export function marketSellPrice(good: GoodId): number {
  return round1(GOODS[good].value * MARKET_SELL_MULT);
}

/** Gold one unit of `good` costs to buy on the market (its value, marked up). */
export function marketBuyPrice(good: GoodId): number {
  return round1(GOODS[good].value * MARKET_BUY_MULT);
}

/** The most whole units of `good` a nation's treasury can afford to buy. */
export function maxBuyable(state: GameState, nationId: number, good: GoodId): number {
  const nation = nationById(state, nationId);
  if (!nation) return 0;
  const price = marketBuyPrice(good);
  return price <= 0 ? 0 : Math.max(0, Math.floor(nation.stocks.gold / price));
}

/** The most whole units of `good` a nation holds and could sell. */
export function maxSellable(state: GameState, nationId: number, good: GoodId): number {
  const nation = nationById(state, nationId);
  return nation ? Math.max(0, Math.floor(nation.wares[good])) : 0;
}

/**
 * Buy up to `qty` units of `good` for `nationId`, paying gold at the market buy
 * price. Clamped to what the treasury can afford; a no-op (state unchanged) if
 * nothing can be bought. Pure.
 */
export function buyWare(
  state: GameState,
  nationId: number,
  good: GoodId,
  qty: number,
): GameState {
  const nation = nationById(state, nationId);
  if (!nation) return state;
  const buy = Math.min(Math.floor(qty), maxBuyable(state, nationId, good));
  if (buy <= 0) return state;
  const cost = round1(buy * marketBuyPrice(good));
  const nations = state.nations.map((n) =>
    n.id === nationId
      ? {
          ...n,
          stocks: { ...n.stocks, gold: round1(n.stocks.gold - cost) },
          wares: { ...n.wares, [good]: round1(n.wares[good] + buy) },
        }
      : n,
  );
  return { ...state, nations };
}

/**
 * Sell up to `qty` units of `good` for `nationId`, taking gold at the market sell
 * price. Clamped to what the stockpile holds; a no-op if nothing can be sold. Pure.
 */
export function sellWare(
  state: GameState,
  nationId: number,
  good: GoodId,
  qty: number,
): GameState {
  const nation = nationById(state, nationId);
  if (!nation) return state;
  const sell = Math.min(Math.floor(qty), maxSellable(state, nationId, good));
  if (sell <= 0) return state;
  const take = round1(sell * marketSellPrice(good));
  const nations = state.nations.map((n) =>
    n.id === nationId
      ? {
          ...n,
          stocks: { ...n.stocks, gold: round1(n.stocks.gold + take) },
          wares: { ...n.wares, [good]: round1(n.wares[good] - sell) },
        }
      : n,
  );
  return { ...state, nations };
}
