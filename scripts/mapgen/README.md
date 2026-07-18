# Hanseatic World map generator

`src/data/maps/hansa-geo.ts` (the 74 province polygons, the play-area coastline,
and the framing continent) is **generated**, not hand-authored. These scripts
rebuild it from public geodata so the map stays reproducible and re-balanceable.

## Inputs (not committed — ~50 MB)

Download Natural Earth **10m** vectors and convert to GeoJSON into one directory:

- `admin1.geojson` — `ne_10m_admin_1_states_provinces`
- `land.geojson` — `ne_10m_land`

Point `MAPGEN_DATA` at that directory. You also need [`mapshaper`](https://github.com/mbloch/mapshaper)
on the `PATH` (`npm i -g mapshaper`).

## The pipeline

```sh
export MAPGEN_DATA=/path/to/geodata      # holds admin1.geojson + land.geojson

# 1. dissolve admin-1 units into the 74 medieval Hansa regions, simplify, clip
#    to the play frame, and emit the framing continent (writes *.geojson to $MAPGEN_DATA)
node scripts/mapgen/run-hansa.mjs

# 2. project to game space, attach terrain/resource/capital, drop degenerate
#    slivers, check border conformance, and write src/data/maps/{hansa-geo,hansa}.ts
node scripts/mapgen/gen-hansa.mjs
```

## How it works

- **`historical-regions.json`** — the human decisions: which admin-1 units make up
  each medieval region (e.g. Scania's herring coast → Denmark; Bergslagen's iron →
  Sweden). Editing this re-groups the map. Estonia's five are added in `run-hansa.mjs`.
- **`run-hansa.mjs`** — tags each in-scope unit with its region, then
  `-clean -dissolve region` builds one topology so shared borders stay identical
  between neighbours; `-simplify … keep-shapes` trims vertices without breaking that
  topology; `-clip bbox=-8,48,33,66` cuts the far-north/south sprawl to the frame.
- **`gen-hansa.mjs`** — projects every ring with the shared game projection
  `x = (lon + 8) · 0.024390`, `y = (66 − lat) · 0.044785`, places each province's
  town at its (nudged-inside) centroid, and carries the terrain/resource/capital
  table that seats the 16 realms. It reports border-conformance and town-in-polygon
  checks so a bad edit is caught before it ships.

The terrain table lives in `gen-hansa.mjs` (`REALMS`), because terrain drives the
trade goods (plains → grain, forest → timber/furs, an `iron` resource → iron).
