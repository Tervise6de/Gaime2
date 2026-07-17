import { describe, expect, it } from "vitest";
import { SCRIPTED_MAPS } from "@/data/maps/types";
import { generateMap } from "@/systems/mapgen";
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
