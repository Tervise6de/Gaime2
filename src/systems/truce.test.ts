import { describe, it, expect } from "vitest";
import {
  TREATY_BREAK,
  TRIBUTE_REFUSAL_HIT,
  TRUCE_TURNS,
  declareWar,
  getRelation,
  makePeace,
  rejectOffer,
  truceTurnsLeft,
  tributeStakes,
  underTruce,
  wouldBreakTreaty,
  atWar,
} from "@/systems/diplomacy";
import { createGame, resolveTurn } from "@/systems/turn";
import { runNationTurn } from "@/systems/ai";
import { createRng } from "@/systems/rng";
import { PLAYER_ID, type DiplomaticOffer, type GameState } from "@/systems/state";

const RIVAL = 2;
const THIRD = 3;

/** A game already at war between the player and one rival. */
function atWarGame(turn = 20): GameState {
  const g = createGame({ seed: 11 });
  return declareWar({ ...g, turn }, PLAYER_ID, RIVAL);
}

describe("a peace binds for a term", () => {
  it("swears a truce when a war ends, and counts it down", () => {
    const peace = makePeace(atWarGame(20), PLAYER_ID, RIVAL);
    expect(underTruce(peace, PLAYER_ID, RIVAL)).toBe(true);
    expect(truceTurnsLeft(peace, PLAYER_ID, RIVAL)).toBe(TRUCE_TURNS);
    // It is the same truce read from either side, and it wanes with the turns.
    expect(truceTurnsLeft({ ...peace, turn: peace.turn + 4 }, RIVAL, PLAYER_ID)).toBe(TRUCE_TURNS - 4);
    expect(underTruce({ ...peace, turn: peace.turn + TRUCE_TURNS }, PLAYER_ID, RIVAL)).toBe(false);
  });

  it("is what a rival will not break — the war → peace → war loop is closed for them", () => {
    const peace = makePeace(atWarGame(20), PLAYER_ID, RIVAL);
    expect(wouldBreakTreaty(peace, RIVAL, PLAYER_ID)).toBe(false);
    // Once it has run its term the rival is free again.
    const later = { ...peace, turn: peace.turn + TRUCE_TURNS };
    expect(wouldBreakTreaty(later, RIVAL, PLAYER_ID)).toBe(true);
  });

  it("actually stops the rival's war planner, not just its treaty check", () => {
    // The gate that matters is in `doDiplomacy`: on a plain peace it never
    // consults `wouldBreakTreaty`, so the truce has to be read there too. Set
    // the board up so a war would otherwise be the obvious move — hostile
    // neighbours, and the rival holding everything the player does not.
    const base = createGame({ seed: 11 });
    const hostile: GameState = {
      ...base,
      turn: 40,
      relations: { ...base.relations, [`${Math.min(PLAYER_ID, RIVAL)}-${Math.max(PLAYER_ID, RIVAL)}`]: -60 },
      regions: base.regions.map((r) => (r.ownerId === PLAYER_ID ? r : { ...r, ownerId: RIVAL })),
    };
    const rng = createRng(7);
    // Without a truce, that board is an invitation.
    expect(atWar(runNationTurn(hostile, RIVAL, rng), RIVAL, PLAYER_ID)).toBe(true);
    // With one sworn, the same board is left alone until it lapses.
    const sworn = makePeace(declareWar(hostile, RIVAL, PLAYER_ID), RIVAL, PLAYER_ID);
    expect(atWar(runNationTurn(sworn, RIVAL, createRng(7)), RIVAL, PLAYER_ID)).toBe(false);
    const lapsed = { ...sworn, turn: sworn.turn + TRUCE_TURNS };
    expect(atWar(runNationTurn(lapsed, RIVAL, createRng(7)), RIVAL, PLAYER_ID)).toBe(true);
  }, 20_000);

  it("lets the player break it — and charges them for it, at home and abroad", () => {
    const peace = makePeace(atWarGame(20), PLAYER_ID, RIVAL);
    const relBefore = getRelation(peace, PLAYER_ID, RIVAL);
    const thirdBefore = getRelation(peace, PLAYER_ID, THIRD);
    const broken = declareWar(peace, PLAYER_ID, RIVAL);

    expect(getRelation(broken, PLAYER_ID, RIVAL)).toBeLessThan(relBefore);
    // Every other court marks the broken word, not just the injured party.
    expect(getRelation(broken, PLAYER_ID, THIRD)).toBe(thirdBefore - TREATY_BREAK.truce.thirdParty);
    // The log and the chronicle both name it as a truce torn up.
    expect(broken.log.at(-1)).toContain("breaking the truce");
    expect(broken.chronicle?.at(-1)?.text).toContain("tore up the truce");
    // ...and the truce is spent, so it cannot be broken twice.
    expect(underTruce(broken, PLAYER_ID, RIVAL)).toBe(false);
  });

  it("charges nothing extra once the truce has run out", () => {
    const peace = makePeace(atWarGame(20), PLAYER_ID, RIVAL);
    const lapsed = { ...peace, turn: peace.turn + TRUCE_TURNS };
    const thirdBefore = getRelation(lapsed, PLAYER_ID, THIRD);
    const war = declareWar(lapsed, PLAYER_ID, RIVAL);
    // A war after an expired truce is an ordinary war: no betrayal penalty.
    expect(getRelation(war, PLAYER_ID, THIRD)).toBeGreaterThan(thirdBefore - TREATY_BREAK.truce.thirdParty);
    expect(war.log.at(-1)).not.toContain("breaking the truce");
  });

  it("holds through played turns without leaking into unrelated pairs", () => {
    let g = makePeace(atWarGame(20), PLAYER_ID, RIVAL);
    expect(underTruce(g, PLAYER_ID, THIRD)).toBe(false);
    for (let t = 0; t < 3; t++) g = resolveTurn(g);
    expect(truceTurnsLeft(g, PLAYER_ID, RIVAL)).toBe(TRUCE_TURNS - 3);
    expect(underTruce(g, PLAYER_ID, THIRD)).toBe(false);
  }, 20_000);
});

describe("a demand states its case", () => {
  const demand = (gold: number): DiplomaticOffer => ({ id: 1, from: RIVAL, to: PLAYER_ID, type: "tribute", gold });

  it("gives the reason, and both answers, in the numbers the buttons will apply", () => {
    const g = createGame({ seed: 11 });
    const offer = demand(30);
    const stakes = tributeStakes(g, offer);
    expect(stakes.reason).toMatch(/stronger than you/);
    // Paying is a gift, so the promised bump is the gift's own formula.
    expect(stakes.ifPaid).toContain("30g");
    expect(stakes.ifPaid).toMatch(/\+\d+/);
    // Refusing quotes the real penalty rejectOffer applies.
    expect(stakes.ifRefused).toContain(String(TRIBUTE_REFUSAL_HIT));
    const after = rejectOffer({ ...g, offers: [offer] }, offer.id);
    expect(getRelation(after, PLAYER_ID, RIVAL)).toBe(getRelation(g, PLAYER_ID, RIVAL) - TRIBUTE_REFUSAL_HIT);
  });

  it("only warns of war when refusing would really put them in reach of one", () => {
    const g = createGame({ seed: 11 });
    // Cordial neighbours: refusing is not a casus belli.
    expect(tributeStakes(g, demand(30)).warRisk).toBe(false);
    // Cold blood, and a border: now the threat is real, and the card says so.
    const hostile: GameState = {
      ...g,
      relations: { ...g.relations, [`${Math.min(PLAYER_ID, RIVAL)}-${Math.max(PLAYER_ID, RIVAL)}`]: -30 },
      // Give the demanding realm the whole board's land so its power edge is plain.
      regions: g.regions.map((r) => (r.ownerId === PLAYER_ID ? r : { ...r, ownerId: RIVAL })),
    };
    const stakes = tributeStakes(hostile, demand(30));
    expect(stakes.warRisk).toBe(true);
    expect(stakes.ifRefused).toMatch(/invasion/);
  });
});
