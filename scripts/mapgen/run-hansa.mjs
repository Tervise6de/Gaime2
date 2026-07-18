// run_hansa.mjs — build the whole-map conforming province geometry.
//  1. admin1.geojson -> tag each in-scope unit with its historical region
//  2. -clean -dissolve region  (topology-conforming province polygons)
//  3. -simplify keep-shapes    (cut vertex count, borders stay shared)
//  4. -clip bbox=play-area     (cut far-north/south sprawl to the frame)
// Emits hansa_regions.geojson (74 provinces), hansa_land.geojson (play coast),
// hansa_context.geojson (real surrounding continent, faded framing).
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Work dir holds the Natural Earth inputs (admin1.geojson, land.geojson) and the
// intermediate GeoJSON. Set MAPGEN_DATA to it — see scripts/mapgen/README.md.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const S = process.env.MAPGEN_DATA;
if (!S) {
  console.error('Set MAPGEN_DATA to a dir with admin1.geojson + land.geojson (Natural Earth 10m). See scripts/mapgen/README.md');
  process.exit(1);
}

// ---- invert historical-regions.json -> admin1 name -> region key ----
const hist = JSON.parse(fs.readFileSync(path.join(HERE, 'historical-regions.json'), 'utf8'));
const NAME2REGION = {};
for (const [realm, regs] of Object.entries(hist)) {
  if (realm.startsWith('_')) continue;              // skip framing groups
  for (const [regKey, obj] of Object.entries(regs)) {
    for (const n of obj.admin1) NAME2REGION[n] = regKey;
  }
}
// ---- Estonia (excluded from the historical json; add its 5 provinces) ----
const EST = {
  'Harju': 'Harjumaa', 'Rapla': 'Harjumaa', 'Järva': 'Harjumaa',
  'Lääne-Viru': 'Virumaa', 'Ida-Viru': 'Virumaa',
  'Lääne': 'Läänemaa', 'Hiiu': 'Läänemaa', 'Pärnu': 'Läänemaa',
  'Saare': 'Saaremaa',
  'Tartu': 'Tartumaa', 'Jõgeva': 'Tartumaa', 'Põlva': 'Tartumaa',
  'Valga': 'Tartumaa', 'Võru': 'Tartumaa', 'Viljandi': 'Tartumaa',
};
Object.assign(NAME2REGION, EST);

const SCOPE = ['United Kingdom','Belgium','Netherlands','Germany','Denmark','Norway',
  'Sweden','Finland','Estonia','Latvia','Lithuania','Russia','Belarus','Poland'];
const scopeExpr = JSON.stringify(SCOPE);
const lookExpr  = JSON.stringify(NAME2REGION);

console.log('region-lookup entries:', Object.keys(NAME2REGION).length,
  '| distinct regions:', new Set(Object.values(NAME2REGION)).size);

const BBOX = '-8,49,33,68';   // lon/lat play frame; north edge sits in the empty
                              // Arctic (past Lofoten) so no straight cut crosses
                              // populated Scandinavia. See gen-hansa.mjs projection.

// ---- 1) provinces: tag, clean, dissolve, simplify, clip ----
execFileSync('mapshaper', [
  S + '/admin1.geojson',
  '-filter', `(${scopeExpr}).indexOf(admin) > -1`,
  '-each',   `region = (${lookExpr})[name] || ''`,
  '-filter', `region !== ''`,
  '-clean',
  '-dissolve', 'region',
  '-simplify', '9%', 'keep-shapes',
  '-clip', `bbox=${BBOX}`,
  '-o', S + '/hansa_regions.geojson', 'format=geojson',
], { stdio: 'inherit' });

// ---- 2) play-area land outline (dissolve every in-play unit into one coast) ----
execFileSync('mapshaper', [
  S + '/admin1.geojson',
  '-filter', `(${scopeExpr}).indexOf(admin) > -1`,
  '-each',   `region = (${lookExpr})[name] || ''`,
  '-filter', `region !== ''`,
  '-clean',
  '-dissolve',
  '-simplify', '9%', 'keep-shapes',
  '-clip', `bbox=${BBOX}`,
  '-o', S + '/hansa_land.geojson', 'format=geojson',
], { stdio: 'inherit' });

// ---- 3) framing continent from ne_10m_land, wider box, heavier simplify ----
execFileSync('mapshaper', [
  S + '/land.geojson',
  '-clip', 'bbox=-15,43,44,73',
  '-simplify', '4%', 'keep-shapes',
  '-o', S + '/hansa_context.geojson', 'format=geojson',
], { stdio: 'inherit' });

// ---- report ----
const reg = JSON.parse(fs.readFileSync(S + '/hansa_regions.geojson', 'utf8'));
console.log('\n=== dissolved provinces:', reg.features.length, '===');
const got = new Set(reg.features.map(f => f.properties.region));
const want = new Set(Object.values(NAME2REGION));
const missing = [...want].filter(r => !got.has(r));
console.log('missing regions (clipped away entirely):', missing.length ? missing.join(', ') : '(none)');
for (const f of reg.features) {
  const g = f.geometry;
  const parts = g.type === 'MultiPolygon' ? g.coordinates.length : 1;
  const verts = JSON.stringify(g.coordinates).split('],[').length;
  if (parts > 3 || verts > 400)
    console.log(`  big: ${f.properties.region} parts=${parts} ~verts=${verts}`);
}
