// genhansa.mjs — project the dissolved provinces into game [0,1] space, attach
// terrain/resource/capital, drop degenerate slivers, check conformance, and emit
//   src/data/maps/hansa-geo.ts   (bulk geometry + province metadata)
//   src/data/maps/hansa.ts       (the ScriptedMap: 16 realms seat the 74 provinces)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
// MAPGEN_DATA holds the intermediate GeoJSON emitted by run-hansa.mjs.
const S = process.env.MAPGEN_DATA;
if (!S) {
  console.error('Set MAPGEN_DATA (same dir used by run-hansa.mjs). See scripts/mapgen/README.md');
  process.exit(1);
}
const REPO = path.resolve(HERE, '..', '..'); // repo root, two levels up from scripts/mapgen

// ---------- projection (shared lon/lat -> game space) ----------
// lon[-8,33] -> x[0,1]; lat[68,~49] -> y[0,~0.92]. KY set for a ~2:1 lat:lon
// aspect (correct near 59 N) so the land fills the frame without looking squat.
const LAT0 = 68;                       // north edge of the frame (y = 0)
const KX = 0.024390, KY = 0.0485;
const r4 = v => Number(v.toFixed(4));
const project = (lon, lat) => [r4((lon + 8) * KX), r4((LAT0 - lat) * KY)];

function openRing(coords) {
  const pts = coords.map(([lon, lat]) => project(lon, lat));
  const out = [];
  for (const p of pts) { const q = out[out.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p); }
  while (out.length > 1 && out[out.length - 1][0] === out[0][0] && out[out.length - 1][1] === out[0][1]) out.pop();
  return out;
}
function area(ring) { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]; return Math.abs(a / 2); }
function polysOf(g) { if (g.type === 'MultiPolygon') return g.coordinates; if (g.type === 'Polygon') return [g.coordinates]; throw new Error('geom ' + g.type); }
function ringsOf(g) {
  const parts = polysOf(g).map(poly => ({ outer: openRing(poly[0]), holes: poly.slice(1).map(openRing) }));
  parts.sort((a, b) => area(b.outer) - area(a.outer));
  const rings = [];
  for (const p of parts) { if (p.outer.length >= 3) { rings.push(p.outer); for (const h of p.holes) if (h.length >= 3) rings.push(h); } }
  return rings;
}
function pip(pt, rings) {
  let inside = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function centroid(ring) { let x = 0, y = 0; for (const p of ring) { x += p[0]; y += p[1]; } return [x / ring.length, y / ring.length]; }
// biggest-part outer rings of a multipolygon, dropping specks -> island blobs
function landBlobs(g, minA) {
  const blobs = [];
  for (const poly of polysOf(g)) { const r = openRing(poly[0]); if (r.length >= 3 && area(r) >= minA) blobs.push(r); }
  blobs.sort((a, b) => area(b) - area(a));
  return blobs;
}

// ---------- the 16 realms: terrain / resource / capital / kontor ----------
// t: coast|plains|forest|hills|mountains ; r: iron|horses|null ; C = capital ; K = kontor host
const C = 'CAPITAL';
const REALMS = [
  { realm: 'England', color: '#d83a2f', regions: [
    { key: 'South-East & London (Kent / London)', name: 'London', t: 'coast', cap: 1, kontor: 'london' },
    { key: 'Wessex & the South-West', name: 'Wessex', t: 'plains' },
    { key: 'Mercia & the Midlands', name: 'Mercia', t: 'plains' },
    { key: 'East Anglia', name: 'East Anglia', t: 'plains' },
    { key: 'Northumbria & the North', name: 'York', t: 'hills', r: 'iron' },
  ]},
  { realm: 'Flanders', color: '#7d4fa8', regions: [
    { key: 'County of Flanders', name: 'Bruges', t: 'coast', cap: 1, kontor: 'bruges' },
    { key: 'Duchy of Brabant', name: 'Brabant', t: 'plains' },
    { key: 'Hainaut, Namur & Liège (the Meuse principalities)', name: 'Hainaut', t: 'hills', r: 'iron' },
    { key: 'County of Holland & Zeeland', name: 'Holland', t: 'coast' },
    { key: 'Guelders & the Oversticht (IJssel Hanse towns)', name: 'Guelders', t: 'plains' },
    { key: 'The Limburgs & Lower Meuse', name: 'Limburg', t: 'hills' },
    { key: 'Frisia (Friesland & Groningen)', name: 'Frisia', t: 'coast' },
  ]},
  { realm: 'Lübeck', color: '#b0273b', regions: [
    { key: 'Holstein & Lübeck (Schleswig-Holstein)', name: 'Lübeck', t: 'coast', cap: 1 },
    { key: 'Hamburg (Free Hanseatic City)', name: 'Hamburg', t: 'coast' },
    { key: 'Mecklenburg & Pomerania (Vorpommern)', name: 'Rostock', t: 'plains' },
  ]},
  { realm: 'Saxony', color: '#4e9b45', regions: [
    { key: 'Lower Saxony (Duchy of the Welfs)', name: 'Brunswick', t: 'plains', cap: 1 },
    { key: 'Bremen (Free Hanseatic City)', name: 'Bremen', t: 'coast' },
    { key: 'Old Saxony & Magdeburg (Saxony-Anhalt)', name: 'Magdeburg', t: 'hills', r: 'iron' },
    { key: 'Mark Brandenburg', name: 'Brandenburg', t: 'plains' },
    { key: 'Meissen & Thuringia (the upland hinterland)', name: 'Thuringia', t: 'forest' },
  ]},
  { realm: 'Cologne', color: '#2f8f7f', regions: [
    { key: 'Rhineland & Westphalia (Archbishopric of Cologne)', name: 'Cologne', t: 'hills', r: 'iron', cap: 1 },
    { key: 'Middle Rhine (Rhineland-Palatinate)', name: 'Mainz', t: 'hills' },
    { key: 'Hesse (Landgraviate)', name: 'Hesse', t: 'forest' },
  ]},
  { realm: 'Denmark', color: '#d0796e', regions: [
    { key: 'Zealand (Sjælland)', name: 'Copenhagen', t: 'coast', cap: 1 },
    { key: 'Funen & South Jutland (Fyn / Sønderjylland)', name: 'Funen', t: 'plains' },
    { key: 'Jutland (Nørrejylland)', name: 'Jutland', t: 'plains', r: 'horses' },
    { key: 'Scania (Skåneland)', name: 'Scania', t: 'coast' },
  ]},
  { realm: 'Norway', color: '#3877a0', regions: [
    { key: 'Viken (the Oslofjord & East)', name: 'Oslo', t: 'coast' },
    { key: 'Agder (the South Coast)', name: 'Agder', t: 'forest' },
    { key: 'Opplandene (the Interior)', name: 'Oppland', t: 'mountains', r: 'iron' },
    { key: 'Vestlandet (the West Country)', name: 'Bergen', t: 'coast', cap: 1, kontor: 'bergen' },
    { key: 'Trøndelag', name: 'Trondheim', t: 'plains' },
    { key: 'Hålogaland (the North)', name: 'Hålogaland', t: 'coast' },
  ]},
  { realm: 'Sweden', color: '#5b8bd0', regions: [
    { key: 'Uppland', name: 'Stockholm', t: 'coast', cap: 1 },
    { key: 'Södermanland & the Mälaren lands', name: 'Bergslagen', t: 'hills', r: 'iron' },
    { key: 'Östergötland', name: 'Östergötland', t: 'plains' },
    { key: 'Västergötland', name: 'Västergötland', t: 'plains' },
    { key: 'Småland & Öland', name: 'Småland', t: 'forest' },
    { key: 'Norrland (the North)', name: 'Norrland', t: 'forest' },
  ]},
  { realm: 'Gotland', color: '#9aa4b2', regions: [
    { key: 'Gotland', name: 'Visby', t: 'coast', cap: 1 },
  ]},
  { realm: 'Finland', color: '#9ec96b', regions: [
    { key: 'Finland Proper (Varsinais-Suomi)', name: 'Åbo', t: 'coast', cap: 1 },
    { key: 'Satakunta', name: 'Satakunta', t: 'forest' },
    { key: 'Tavastia (Häme)', name: 'Häme', t: 'forest' },
    { key: 'Uusimaa (Nyland)', name: 'Nyland', t: 'coast' },
    { key: 'Savonia (Savo)', name: 'Savo', t: 'forest' },
    { key: 'Karelia (Karjala)', name: 'Viborg', t: 'forest' },
    { key: 'Ostrobothnia (Österbotten)', name: 'Ostrobothnia', t: 'coast' },
  ]},
  { realm: 'Estonia', color: '#6fc2d8', regions: [
    { key: 'Harjumaa', name: 'Reval', t: 'coast', cap: 1 },
    { key: 'Virumaa', name: 'Virland', t: 'forest' },
    { key: 'Läänemaa', name: 'Wiek', t: 'coast' },
    { key: 'Saaremaa', name: 'Ösel', t: 'coast' },
    { key: 'Tartumaa', name: 'Dorpat', t: 'forest' },
  ]},
  { realm: 'Livonia', color: '#4fb0a0', regions: [
    { key: 'Kurzeme (Courland)', name: 'Kurland', t: 'forest' },
    { key: 'Zemgale (Semigallia)', name: 'Semgallia', t: 'plains' },
    { key: 'Sēlija (Selonia)', name: 'Selonia', t: 'forest' },
    { key: 'Vidzeme (Livonia proper)', name: 'Riga', t: 'coast', cap: 1 },
    { key: 'Latgale (Latgallia)', name: 'Latgale', t: 'forest' },
  ]},
  { realm: 'Lithuania', color: '#6cae7a', regions: [
    { key: 'Samogitia (Žemaitija)', name: 'Samogitia', t: 'coast' },
    { key: 'Aukštaitija (the Highlands)', name: 'Aukštaitija', t: 'forest' },
    { key: 'Kaunas & the Nemunas valley', name: 'Kaunas', t: 'plains', r: 'horses' },
    { key: 'Vilnius (Lithuania Proper)', name: 'Vilnius', t: 'forest', cap: 1 },
    { key: 'Sūduva & Dzūkija (the southern forests)', name: 'Dzūkija', t: 'forest' },
  ]},
  { realm: 'Novgorod', color: '#b06ec0', regions: [
    { key: 'Novgorod the Great', name: 'Novgorod', t: 'forest', cap: 1, kontor: 'novgorod' },
    { key: 'Ingria & Ladoga (Vodskaya & Korela)', name: 'Ladoga', t: 'forest' },
    { key: 'Pskov', name: 'Pskov', t: 'plains' },
    { key: 'Polotsk & Vitebsk', name: 'Polotsk', t: 'forest' },
  ]},
  { realm: 'Prussia', color: '#8f86d8', regions: [
    { key: 'Pomerelia (Danzig)', name: 'Danzig', t: 'coast', cap: 1 },
    { key: "Culmerland & Warmia (the Order's heartland)", name: 'Thorn', t: 'plains', r: 'horses' },
    { key: 'East Prussia / Sambia (Königsberg)', name: 'Königsberg', t: 'coast' },
  ]},
  { realm: 'Poland', color: '#d64f7d', regions: [
    { key: 'Greater Poland (Wielkopolska)', name: 'Poznań', t: 'plains' },
    { key: 'Masovia (Mazowsze)', name: 'Masovia', t: 'plains', r: 'horses' },
    { key: 'Lesser Poland (Małopolska)', name: 'Kraków', t: 'hills', r: 'iron', cap: 1 },
    { key: 'Silesia (Śląsk)', name: 'Silesia', t: 'hills' },
    { key: 'Pomerania (Stettin / Farther Pomerania)', name: 'Stettin', t: 'coast' },
  ]},
];

// ---------- load geometry ----------
const regionsGJ = JSON.parse(fs.readFileSync(S + '/hansa_regions.geojson', 'utf8'));
const landGJ = JSON.parse(fs.readFileSync(S + '/hansa_land.geojson', 'utf8'));
const ctxGJ = JSON.parse(fs.readFileSync(S + '/hansa_context.geojson', 'utf8'));
const byKey = {};
for (const f of regionsGJ.features) byKey[f.properties.region] = f.geometry;
const geomOf = gj => gj.type === 'GeometryCollection' ? gj.geometries[0] : (gj.features ? gj.features[0].geometry : gj.geometry);

const MINAREA = 3e-5;

// ---------- build provinces in realm order ----------
const provinces = [];    // final ScriptedRegion-likes in emit order
const factions = [];     // {name,color,capital,regions:[]}
const kontorHost = {};   // kontorId -> final index
const dropped = [];
for (const R of REALMS) {
  const idxs = [];
  let capIdx = null;
  for (const reg of R.regions) {
    const geom = byKey[reg.key];
    if (!geom) { dropped.push(`${R.realm}/${reg.name} (no geometry for "${reg.key}")`); continue; }
    const rings = ringsOf(geom);
    if (!rings.length || area(rings[0]) < MINAREA) { dropped.push(`${R.realm}/${reg.name} (degenerate)`); continue; }
    // town point: centroid of largest ring, nudged inside if needed
    let [tx, ty] = centroid(rings[0]);
    tx = r4(tx); ty = r4(ty);
    if (!pip([tx, ty], rings)) {
      const c = centroid(rings[0]);
      // sample a grid inside the bbox of ring0 to find an interior point
      let bx0 = 1, by0 = 1, bx1 = 0, by1 = 0;
      for (const [x, y] of rings[0]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
      outer: for (let gy = 1; gy <= 6; gy++) for (let gx = 1; gx <= 6; gx++) {
        const px = r4(bx0 + (bx1 - bx0) * gx / 7), py = r4(by0 + (by1 - by0) * gy / 7);
        if (pip([px, py], rings)) { tx = px; ty = py; break outer; }
      }
    }
    const idx = provinces.length;
    const prov = { name: reg.name, x: tx, y: ty, terrain: reg.t, resource: reg.r ?? null, polygon: rings, _key: reg.key };
    provinces.push(prov);
    idxs.push(idx);
    if (reg.cap) capIdx = idx;
    if (reg.kontor) kontorHost[reg.kontor] = idx;
  }
  if (capIdx === null) capIdx = idxs[0];
  factions.push({ name: R.realm, color: R.color, capital: capIdx, regions: idxs });
}

const land = landBlobs(geomOf(landGJ), 5e-5);
const ctxLand = landBlobs(geomOf(ctxGJ), 8e-5);

// ---------- reports ----------
console.log('provinces:', provinces.length, '| dropped:', dropped.length);
for (const d of dropped) console.log('   DROP', d);
console.log('land blobs:', land.length, '| context blobs:', ctxLand.length);
console.log('kontor hosts (region index):', JSON.stringify(kontorHost));

// point-in-own-polygon
let bad = 0;
for (const p of provinces) if (!pip([p.x, p.y], p.polygon)) { bad++; console.log('  !! town outside polygon:', p.name); }
console.log('town-in-polygon failures:', bad);

// vertex totals
let totalV = 0; for (const p of provinces) for (const r of p.polygon) totalV += r.length;
for (const r of land) totalV += r.length; for (const r of ctxLand) totalV += r.length;
console.log('total vertices (provinces+land+context):', totalV);

// conformance: count non-conforming stray edges between province pairs (T-junctions)
const key = p => p[0] + ',' + p[1];
const ekey = (a, b) => { const ka = key(a), kb = key(b); return ka < kb ? ka + '|' + kb : kb + '|' + ka; };
function ve(rings) { const V = new Set(), E = new Set(), EM = new Map(); for (const ring of rings) { for (const p of ring) V.add(key(p)); for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const k = ekey(ring[j], ring[i]); E.add(k); EM.set(k, [ring[j], ring[i]]); } } return { V, E, EM }; }
const VE = provinces.map(p => ve(p.polygon));
let nonConform = 0, adjacentPairs = 0;
for (let i = 0; i < provinces.length; i++) for (let j = i + 1; j < provinces.length; j++) {
  const a = VE[i], b = VE[j]; let shared = 0;
  for (const k of a.E) if (b.E.has(k)) shared++;
  const flag = [];
  for (const [k, seg] of a.EM) { if (b.E.has(k)) continue; if (b.V.has(key(seg[0])) && b.V.has(key(seg[1]))) flag.push(seg); }
  if (shared > 0) adjacentPairs++;
  nonConform += flag.length;
}
console.log(`adjacent province pairs (share >=1 edge): ${adjacentPairs} | non-conforming stray edges: ${nonConform}`);

// ---------- emit hansa-geo.ts ----------
const jc = v => JSON.stringify(v);          // compact
const provLines = provinces.map(p => {
  const res = p.resource ? `, resource: ${jc(p.resource)}` : '';
  return `  { name: ${jc(p.name)}, x: ${p.x}, y: ${p.y}, terrain: ${jc(p.terrain)}${res}, polygon: ${jc(p.polygon)} },`;
}).join('\n');

const geoTs = `/**
 * AUTO-GENERATED province geometry for the Hanseatic World map.
 * Built by scratchpad/genhansa.mjs from Natural Earth 10m admin-1 units,
 * dissolved into medieval Hansa-era regions (mapshaper -clean -dissolve),
 * simplified, clipped to the play frame, and projected to game space
 *   x = (lon + 8) * ${KX} ,  y = (${LAT0} - lat) * ${KY}
 * Do not edit by hand — re-run the generator. Serialisable data only.
 */
import type { Coord, ScriptedRegion } from "@/data/maps/types";

/** The ${provinces.length} historical provinces, in realm-seating order (index === region id). */
export const HANSA_PROVINCES: ScriptedRegion[] = [
${provLines}
];

/** Play-area coastline: the dissolved land of every province, as island blobs. */
export const HANSA_LAND: Coord[][] = ${jc(land)};

/** Faded surrounding continent (real coastlines beyond the play frame) + labels. */
export const HANSA_CONTEXT: { land: Coord[][]; labels: { text: string; x: number; y: number }[] } = {
  land: ${jc(ctxLand)},
  labels: [
    { text: "The Empire", x: 0.5, y: 1.0 },
    { text: "France", x: 0.17, y: 0.97 },
    { text: "Scotland", x: 0.09, y: 0.49 },
    { text: "Ireland", x: 0.0, y: 0.69 },
    { text: "The Rus", x: 1.07, y: 0.5 },
    { text: "Lappland", x: 0.56, y: 0.03 },
    { text: "The Ocean", x: -0.07, y: 0.62 },
  ],
};
`;
fs.writeFileSync(REPO + '/src/data/maps/hansa-geo.ts', geoTs);

// ---------- emit hansa.ts ----------
const facLines = factions.map(f =>
  `    { name: ${jc(f.name)}, color: ${jc(f.color)}, capital: ${f.capital}, regions: [${f.regions.join(', ')}] },`
).join('\n');

const mapTs = `/**
 * The Hanseatic World — the whole trading world of the Hansa on real medieval
 * geography: England and the cloth towns of Flanders in the west, up through
 * Denmark and Norway, along the German and Wendish shore, across to Sweden,
 * Gotland, Finland, and the Estonian, Livonian, Rus, Prussian and Polish lands
 * in the east. Sixteen realms start on their own ground; the League is theirs to
 * form, join or break.
 *
 * The ${provinces.length} provinces are Natural Earth admin-1 units dissolved into their
 * medieval regions and projected to game space (see hansa-geo.ts). Every province
 * carries its real border polygon, so the renderer draws organic province cells.
 * Serialisable data only — no logic, no DOM.
 */
import type { ScriptedMap } from "@/data/maps/types";
import { HANSA_PROVINCES, HANSA_LAND, HANSA_CONTEXT } from "@/data/maps/hansa-geo";

export const HANSA_MAP: ScriptedMap = {
  id: "hansa",
  name: "The Hanseatic World",
  blurb:
    "The whole world of the Hansa on real medieval geography — England, Flanders and the Low Countries, the German and Wendish shore, Denmark, Norway, Sweden, Gotland, and the Finnish, Estonian, Livonian, Rus, Prussian and Polish Baltic.",
  land: HANSA_LAND,
  regions: HANSA_PROVINCES,
  context: HANSA_CONTEXT,
  // Sixteen historical realms of the Hanseatic world, each on its home ground.
  // Every province belongs to exactly one; indices match hansa-geo.ts order.
  factions: [
${facLines}
  ],
};
`;
fs.writeFileSync(REPO + '/src/data/maps/hansa.ts', mapTs);

console.log('\nwrote src/data/maps/hansa-geo.ts and src/data/maps/hansa.ts');
console.log('KONTORE regionId updates -> ' + JSON.stringify(kontorHost));
