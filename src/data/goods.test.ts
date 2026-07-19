import { describe, it, expect } from "vitest";
import { GOODS, GOOD_IDS, type GoodId } from "@/data/goods";
import { KONTORE, KONTOR_IDS } from "@/data/kontore";

describe("goods table", () => {
  it("has the eight Hansa goods with positive value and base output", () => {
    expect(GOOD_IDS).toEqual(["grain", "timber", "furs", "iron", "salt", "herring", "amber", "beer"]);
    for (const id of GOOD_IDS) {
      const g = GOODS[id];
      expect(g.id).toBe(id);
      expect(g.value).toBeGreaterThan(0);
      expect(g.source.baseOutput).toBeGreaterThan(0);
      // Every good is sourced by a terrain and/or a strategic resource.
      expect((g.source.terrain?.length ?? 0) > 0 || g.source.resource !== undefined).toBe(true);
    }
  });

  it("sources match the design (terrain staples, resource strategics)", () => {
    expect(GOODS.grain.source.terrain).toContain("plains");
    expect(GOODS.timber.source.terrain).toContain("forest");
    expect(GOODS.furs.source.terrain).toContain("forest");
    expect(GOODS.iron.source.resource).toBe("iron");
    expect(GOODS.salt.source.resource).toBe("salt");
    expect(GOODS.amber.source.resource).toBe("amber");
    expect(GOODS.herring.source.terrain).toContain("coast");
    expect(GOODS.beer.source.terrain).toContain("plains");
  });
});

describe("goods ⇄ kontore demand consistency", () => {
  it("every good's demandedAt Kontor lists that good in its demands", () => {
    for (const id of GOOD_IDS) {
      for (const k of GOODS[id].demandedAt) {
        expect(KONTORE[k].demands).toContain(id);
      }
    }
  });

  it("every Kontor's demanded good lists that Kontor in its demandedAt", () => {
    for (const k of KONTOR_IDS) {
      for (const good of KONTORE[k].demands) {
        expect(GOODS[good].demandedAt).toContain(k);
      }
    }
  });

  it("every good is demanded somewhere and every Kontor demands something", () => {
    for (const id of GOOD_IDS) expect(GOODS[id].demandedAt.length).toBeGreaterThan(0);
    for (const k of KONTOR_IDS) expect(KONTORE[k].demands.length).toBeGreaterThan(0);
  });

  it("no Kontor demands a good outside the goods table", () => {
    const known = new Set<GoodId>(GOOD_IDS);
    for (const k of KONTOR_IDS) for (const good of KONTORE[k].demands) expect(known.has(good)).toBe(true);
  });
});
