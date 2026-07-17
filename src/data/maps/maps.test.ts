import { describe, expect, it } from "vitest";
import { SCRIPTED_MAPS } from "@/data/maps/types";
import { generateMap } from "@/systems/mapgen";
import { createGame } from "@/systems/turn";
import { PLAYER_ID } from "@/systems/state";
import { pointInPolygon } from "@/systems/voronoi";
import { TERRAIN } from "@/data/terrain";

describe("scripted maps", () => {
  for (const map of Object.values(SCRIPTED_MAPS)) {
    describe(map.name, () => {
      it("has a sensible amount of land and regions", () => {
        expect(map.land.length).toBeGreaterThanOrEqual(1);
        expect(map.regions.length).toBeGreaterThanOrEqual(12);
      });

      it("places every region on a landmass (never in the sea)", () => {
        const blobs = map.land.map((poly) => poly.map(([x, y]) => ({ x, y })));
        for (const r of map.regions) {
          const onLand = blobs.some((b) => pointInPolygon(b, r.x, r.y));
          expect(onLand, `${r.name} (${r.x}, ${r.y}) should be on land`).toBe(true);
        }
      });

      it("uses valid terrain and unique region names", () => {
        const names = new Set<string>();
        for (const r of map.regions) {
          expect(TERRAIN[r.terrain]).toBeDefined();
          expect(names.has(r.name)).toBe(false);
          names.add(r.name);
        }
      });

      it("assigns every region to exactly one historical faction", () => {
        expect(map.factions.length).toBeGreaterThanOrEqual(2);
        const owner = new Map<number, string>();
        for (const f of map.factions) {
          expect(f.regions).toContain(f.capital);
          for (const rid of f.regions) {
            expect(rid, `region ${rid} in range`).toBeGreaterThanOrEqual(0);
            expect(rid).toBeLessThan(map.regions.length);
            expect(owner.has(rid), `region ${map.regions[rid]?.name} double-owned`).toBe(false);
            owner.set(rid, f.name);
          }
        }
        // Every region belongs to some realm (no orphan sea-provinces).
        for (let i = 0; i < map.regions.length; i++) {
          expect(owner.has(i), `${map.regions[i]!.name} unassigned`).toBe(true);
        }
      });

      it("seats the chosen realm as the player, on its own capital", () => {
        const faction = map.factions[1]!; // any non-default realm
        const g = createGame({ seed: 7, mapId: map.id, playerFaction: faction.name });
        expect(g.mapId).toBe(map.id);
        const player = g.nations[PLAYER_ID]!;
        expect(player.name).toBe(faction.name);
        // The player owns its home regions and no others' capitals.
        expect(g.regions[faction.capital]!.ownerId).toBe(PLAYER_ID);
        for (const rid of faction.regions) expect(g.regions[rid]!.ownerId).toBe(PLAYER_ID);
        // Every other faction is present and holds its capital.
        for (const f of map.factions) {
          if (f.name === faction.name) continue;
          const n = g.nations.find((x) => x.name === f.name);
          expect(n, `${f.name} seated`).toBeDefined();
          expect(g.regions[f.capital]!.ownerId).toBe(n!.id);
        }
      });

      it("generates a connected region graph via Voronoi adjacency", () => {
        const { regions } = generateMap(12345, undefined, map.id);
        expect(regions.length).toBe(map.regions.length);
        // BFS from region 0 must reach every region (no marooned provinces).
        const seen = new Set<number>([0]);
        const stack = [0];
        while (stack.length) {
          const cur = stack.pop()!;
          for (const n of regions[cur]!.adjacency) if (!seen.has(n)) { seen.add(n); stack.push(n); }
        }
        expect(seen.size).toBe(regions.length);
      });
    });
  }
});
