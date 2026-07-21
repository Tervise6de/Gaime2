// Build a Europe-only GeoJSON tagged with medieval realm names, colors, and
// label anchors — consumed by the PixiJS map prototype. Run: node prepare-data.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as topojson from "topojson-client";

const here = dirname(fileURLToPath(import.meta.url));
const topo = JSON.parse(
  readFileSync(join(here, "../../node_modules/world-atlas/countries-50m.json"))
);
const world = topojson.feature(topo, topo.objects.countries);

// modern country name -> how it appears on a 13th-century political map.
// color is an aged-pastel palette echoing the reference art.
// [labelLon, labelLat] pins the label where it reads cleanly on-frame.
const REALMS = {
  France:            { realm: "Kingdom of France",     color: 0x8fa6c9, label: [2.2, 46.6] },
  "United Kingdom":  { realm: "Kingdom of England",    color: 0xd58e79, label: [-1.5, 52.6] },
  Ireland:           { realm: "Ireland",               color: 0xa7c188, label: [-8.0, 53.3] },
  Norway:            { realm: "Kingdom of Norway",     color: 0xb9a3c6, label: [9.5, 61.6] },
  Sweden:            { realm: "Kingdom of Sweden",     color: 0xc7a1bf, label: [15.0, 62.5] },
  Finland:           { realm: "Finnish Lands",         color: 0xd9d3a6, label: [26.0, 63.0] },
  Denmark:           { realm: "Kingdom of Denmark",    color: 0xd98f7f, label: [9.4, 56.1] },
  Iceland:           { realm: "Iceland",               color: 0xbfc8b0, label: [-19, 65] },
  Germany:           { realm: "Holy Roman Empire",     color: 0xcfc7b1, label: [10.2, 51.2] },
  Netherlands:       { realm: "Low Countries",         color: 0xc9b6d0, label: [5.6, 52.4] },
  Belgium:           { realm: "Flanders",              color: 0xc9a9c4, label: [4.5, 50.6] },
  Switzerland:       { realm: "Swabia",                color: 0xd7cdb4, label: [8.2, 46.8] },
  Austria:           { realm: "Austria",               color: 0xd3c7ac, label: [14.3, 47.6] },
  Czechia:           { realm: "Kingdom of Bohemia",    color: 0xe0cf8b, label: [15.4, 49.8] },
  Poland:            { realm: "Piast Polish Duchies",  color: 0xd9a9a0, label: [19.3, 52.0] },
  Slovakia:          { realm: "Kingdom of Hungary",    color: 0xd9ab68, label: [19.5, 48.7] },
  Hungary:           { realm: "Kingdom of Hungary",    color: 0xd9ab68, label: [19.4, 47.1] },
  Slovenia:          { realm: "Carniola",              color: 0xcdb98f, label: [14.8, 46.1] },
  Croatia:           { realm: "Croatia",               color: 0xb9c49a, label: [16.4, 45.3] },
  "Bosnia and Herz.":{ realm: "Bosnia",                color: 0xc4b596, label: [17.8, 44.1] },
  Serbia:            { realm: "Kingdom of Serbia",     color: 0x9fc4b0, label: [20.9, 44.0] },
  Montenegro:        { realm: "Zeta",                  color: 0xa9c0a0, label: [19.3, 42.8] },
  Albania:           { realm: "Albania",               color: 0xc9b088, label: [20.1, 41.0] },
  "North Macedonia": { realm: "Macedonia",             color: 0xb7c49a, label: [21.7, 41.6] },
  Greece:            { realm: "Empire of Nicaea",      color: 0xc9a2b0, label: [22.5, 39.4] },
  Bulgaria:          { realm: "Bulgaria",              color: 0xb6a6c9, label: [25.2, 42.7] },
  Romania:           { realm: "Cumania",               color: 0xd9c88a, label: [25.0, 46.0] },
  Moldova:           { realm: "Cumania",               color: 0xd9c88a, label: [28.5, 47.2] },
  Ukraine:           { realm: "Western Rus'",          color: 0xd9c07a, label: [31.5, 49.5] },
  Belarus:           { realm: "Rus' Principalities",   color: 0xcdbf88, label: [27.9, 53.5] },
  Lithuania:         { realm: "Lithuania",             color: 0xb7bf82, label: [23.9, 55.2] },
  Latvia:            { realm: "Livonian Territories",  color: 0xb9a7c9, label: [24.9, 56.9] },
  Estonia:           { realm: "Livonian Territories",  color: 0xb9a7c9, label: [25.8, 58.7] },
  Russia:            { realm: "Novgorod Republic",     color: 0xa9bf88, label: [36.5, 58.6] },
  Italy:             { realm: "Kingdom of Sicily",     color: 0xd9a86a, label: [12.6, 42.2] },
  Spain:             { realm: "Kingdoms of Iberia",    color: 0xd9c17a, label: [-3.7, 40.2] },
  Portugal:          { realm: "Kingdom of Portugal",   color: 0xa7c188, label: [-8.0, 39.8] },
  Turkey:            { realm: "Empire of Nicaea",      color: 0xc9a2b0, label: [30.0, 39.8] },
};

const features = [];
for (const f of world.features) {
  const spec = REALMS[f.properties.name];
  if (!spec) continue;
  features.push({
    type: "Feature",
    geometry: f.geometry,
    properties: {
      name: f.properties.name,
      realm: spec.realm,
      color: spec.color,
      label: spec.label,
    },
  });
}

// italic blue sea labels, placed by hand in lon/lat.
const seas = [
  { text: "North Sea", at: [3.0, 56.5] },
  { text: "Norwegian Sea", at: [2.0, 66.0] },
  { text: "Baltic Sea", at: [19.5, 58.0] },
  { text: "Mediterranean Sea", at: [5.0, 37.0] },
  { text: "Black Sea", at: [34.0, 43.3] },
  { text: "Bay of Biscay", at: [-5.0, 45.2] },
  { text: "Adriatic Sea", at: [16.0, 42.5] },
];

writeFileSync(
  join(here, "europe.json"),
  JSON.stringify({ type: "FeatureCollection", features, seas })
);
console.log(`wrote ${features.length} realms + ${seas.length} sea labels`);
