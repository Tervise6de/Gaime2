// Build a Europe GeoJSON where modern admin-1 provinces are grouped into the
// 13th-century realms from the reference map (Sápmi, the HRE duchies, the Piast
// Polish duchies, the Italian states, Finnish lands, etc.). Provinces keep their
// own polygons (so realms are made of provinces, game-style) but are tagged with
// a realm name + colour; the renderer merges them by realm.
//
// Source: Natural Earth 10m admin-1 states/provinces (not committed — 40MB).
//   curl -sSL -o ne10.geojson \
//     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
// Run:  node prepare-data.mjs [path-to-ne10.geojson]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC =
  process.argv[2] ||
  process.env.NE_ADMIN1 ||
  "/tmp/claude-0/-home-user-Gaime2/5cee13a7-495c-546e-82cc-ef1b88cce1e8/scratchpad/ne10_admin1.json";
if (!existsSync(SRC)) {
  console.error(`Natural Earth admin-1 file not found: ${SRC}\nSee header for the download command.`);
  process.exit(1);
}
const fc = JSON.parse(readFileSync(SRC));

// ---- realm palette (aged pastels echoing the reference) --------------------
const C = {
  France: 0x8fa6c9, Aquitaine: 0xd9b48a, England: 0xd58e79, Scotland: 0xc3b184,
  Ireland: 0xa7c188, Norway: 0xb9a3c6, Sweden: 0xc7a1bf, Sapmi: 0xcdb3d6,
  Denmark: 0xd98f7f, Iceland: 0xbfc8b0, Suomi: 0xd9d3a6, Tavastia: 0xcbd39a,
  Karelia: 0xd7c98a, Novgorod: 0xa9bf88, WesternRus: 0xd9c07a, RusPrin: 0xcdbf88,
  Livonia: 0xb9a7c9, Lithuania: 0xb7bf82, Prussia: 0xcfbfd0,
  Holstein: 0xd7cbb2, Saxony: 0xcfc7b1, Brandenburg: 0xdcd4be, Westphalia: 0xc7c0aa,
  Rhineland: 0xd3ccb6, Franconia: 0xcabfa0, Thuringia: 0xdad1b5, Swabia: 0xd6ccb3,
  Bavaria: 0xd2c6a1, Mecklenburg: 0xc9c3ad, Austria: 0xd9cca8, Bohemia: 0xe0cf8b,
  Holland: 0xc9b6d0, Flanders: 0xc9a9c4, Brabant: 0xbfa7cf,
  GreaterPoland: 0xd9a9a0, LesserPoland: 0xd7b0a0, Silesia: 0xcaa39a,
  Masovia: 0xe0b3a8, Pomerelia: 0xcf9f96,
  Hungary: 0xd9ab68, Carniola: 0xcdb98f, Croatia: 0xb9c49a, Bosnia: 0xc4b596,
  Serbia: 0x9fc4b0, Zeta: 0xa9c0a0, Albania: 0xc9b088, Macedonia: 0xb7c49a,
  Bulgaria: 0xb6a6c9, Cumania: 0xd9c88a,
  Latin: 0xe3d08a, Epirus: 0xb0c4a0, Nicaea: 0xc9a2b0, Rum: 0xd0b48a, Trebizond: 0xd7a98a,
  Sicily: 0xd9a86a, Papal: 0xe0d2a6, Lombardy: 0xcdd39a, Venice: 0x9fc4c4,
  Tuscany: 0xd6c58a, Genoa: 0xc0b48a, Sardinia: 0xc9b98a,
  Castile: 0xd9c17a, Aragon: 0xd6a95f, Navarre: 0xc9b48a, Portugal: 0xa7c188,
};
const R = (realm, key) => ({ realm, color: C[key] });

const inSet = (name, arr) => arr.includes(name);

// ---- province -> realm resolver --------------------------------------------
function resolve(p) {
  const adm = p.admin, name = p.name, region = p.region, geo = p.geonunit;
  switch (adm) {
    case "France": {
      const aquitaine = ["Gironde","Landes","Dordogne","Lot-et-Garonne","Gers","Pyrénées-Atlantiques","Hautes-Pyrénées","Charente","Charente-Maritime","Dordogne"];
      return inSet(name, aquitaine) ? R("Aquitaine (English Crown)","Aquitaine") : R("Kingdom of France","France");
    }
    case "United Kingdom":
      if (geo === "Scotland") return R("Kingdom of Scotland","Scotland");
      if (geo === "Northern Ireland") return R("Ireland","Ireland");
      return R("Kingdom of England","England"); // England + Wales
    case "Ireland": return R("Ireland","Ireland");
    case "Norway":
      return inSet(name, ["Finnmark","Troms","Nordland"]) ? R("Sápmi","Sapmi") : R("Kingdom of Norway","Norway");
    case "Sweden":
      return inSet(name, ["Norrbotten","Västerbotten"]) ? R("Sápmi","Sapmi") : R("Kingdom of Sweden","Sweden");
    case "Finland":
      if (name === "Lapland") return R("Sápmi","Sapmi");
      if (inSet(name, ["North Karelia","South Karelia"])) return R("Karelia","Karelia");
      if (inSet(name, ["Tavastia Proper","Päijät-Häme"])) return R("Tavastia","Tavastia");
      return R("Suomi","Suomi");
    case "Denmark": return R("Kingdom of Denmark","Denmark");
    case "Iceland": return R("Iceland","Iceland");
    case "Russia": {
      if (name === "Kaliningrad") return R("Prussian Lands","Prussia");
      if (inSet(name, ["Pskov","Novgorod","Leningrad","City of St. Petersburg","Murmansk","Karelia","Arkhangel'sk","Vologda","Tver'"]))
        return R("Novgorod Republic","Novgorod");
      if (inSet(name, ["Smolensk","Bryansk","Kursk","Belgorod","Voronezh","Kaluga","Orel","Moskva","Moscow","City of Moscow","Tula","Ryazan'","Lipetsk","Tambov"]))
        return R("Western Rus'","WesternRus");
      return R("Novgorod Republic","Novgorod");
    }
    case "Ukraine": {
      const galicia = ["L'viv","Ivano-Frankivs'k","Ternopil'","Volyn","Rivne","Transcarpathia","Chernivtsi","Khmel'nyts'kyy"];
      return inSet(name, galicia) ? R("Galicia-Volhynia","WesternRus") : R("Western Rus'","WesternRus");
    }
    case "Belarus": return R("Rus' Principalities","RusPrin");
    case "Lithuania": return R("Lithuania","Lithuania");
    case "Latvia": return R("Livonian Territories","Livonia");
    case "Estonia": return R("Livonian Territories","Livonia");
    case "Germany":
      if (inSet(name, ["Sachsen","Sachsen-Anhalt","Niedersachsen","Bremen"])) return R("Saxony","Saxony");
      if (inSet(name, ["Brandenburg","Berlin"])) return R("Brandenburg","Brandenburg");
      if (name === "Bayern") return R("Bavaria","Bavaria");
      if (name === "Baden-Württemberg") return R("Swabia","Swabia");
      if (name === "Hessen") return R("Franconia","Franconia");
      if (name === "Thüringen") return R("Thuringia","Thuringia");
      if (name === "Nordrhein-Westfalen") return R("Westphalia","Westphalia");
      if (inSet(name, ["Rheinland-Pfalz","Saarland"])) return R("Rhineland","Rhineland");
      if (inSet(name, ["Schleswig-Holstein","Hamburg"])) return R("Holstein","Holstein");
      if (name === "Mecklenburg-Vorpommern") return R("Mecklenburg","Mecklenburg");
      return R("Holy Roman Empire","Saxony");
    case "Netherlands":
      if (name === "Utrecht") return R("Bishopric of Utrecht","Brabant");
      return R("County of Holland","Holland");
    case "Belgium":
      if (inSet(name, ["Hainaut","Namur","Liege","Luxembourg","Walloon Brabant"])) return R("Brabant","Brabant");
      return R("Flanders","Flanders");
    case "Luxembourg": return R("Brabant","Brabant");
    case "Switzerland": return R("Swabia","Swabia");
    case "Austria": return R("Austria","Austria");
    case "Czech Republic": return R("Kingdom of Bohemia","Bohemia");
    case "Poland":
      if (inSet(name, ["Greater Poland","Lubusz","West Pomeranian"])) return R("Greater Poland","GreaterPoland");
      if (inSet(name, ["Lesser Poland","Świętokrzyskie","Subcarpathian","Lublin"])) return R("Lesser Poland","LesserPoland");
      if (inSet(name, ["Lower Silesian","Opole","Silesian"])) return R("Silesia","Silesia");
      if (inSet(name, ["Masovian","Łódź","Podlachian"])) return R("Masovia","Masovia");
      if (inSet(name, ["Pomeranian","Kuyavian-Pomeranian","Warmian-Masurian"])) return R("Pomerelia","Pomerelia");
      return R("Piast Polish Duchies","GreaterPoland");
    case "Slovakia": return R("Kingdom of Hungary","Hungary");
    case "Hungary": return R("Kingdom of Hungary","Hungary");
    case "Slovenia": return R("Carniola","Carniola");
    case "Croatia": return R("Croatia","Croatia");
    case "Bosnia and Herzegovina": return R("Bosnia","Bosnia");
    case "Republic of Serbia": case "Serbia": return R("Kingdom of Serbia","Serbia");
    case "Kosovo": return R("Kingdom of Serbia","Serbia");
    case "Montenegro": return R("Zeta","Zeta");
    case "Albania": return R("Albania","Albania");
    case "Macedonia": case "North Macedonia": return R("Macedonia","Macedonia");
    case "Bulgaria": return R("Bulgaria","Bulgaria");
    case "Romania": return R("Cumania","Cumania");
    case "Moldova": return R("Cumania","Cumania");
    case "Greece": {
      const epirus = ["Ipeiros","Dytiki Makedonia","Ionioi Nisoi","Dytiki Ellada"];
      return inSet(region, epirus) ? R("Despotate of Epirus","Epirus") : R("Latin Empire","Latin");
    }
    case "Turkey": {
      const treb = ["Trabzon","Rize","Artvin","Giresun","Ordu","Gümüşhane","Bayburt","Samsun","Sinop","Kastamonu","Bartın","Zinguldak","Karabük"];
      const nic = ["Istanbul","Kocaeli","Sakarya","Yalova","Bursa","Bilecik","Balikesir","Çanakkale","Izmir","Manisa","Aydin","Mugla","Denizli","Kütahya","Usak","Uşak","Afyon","Eskisehir","Antalya","Isparta","Burdur","Bolu","Düzce","Edirne","Kirklareli","Tekirdag"];
      if (inSet(name, treb)) return R("Empire of Trebizond","Trebizond");
      if (inSet(name, nic)) return R("Empire of Nicaea","Nicaea");
      return R("Sultanate of Rûm","Rum");
    }
    case "Italy":
      if (inSet(region, ["Abruzzo","Molise","Apulia","Basilicata","Calabria","Campania","Sicily"])) return R("Kingdom of Sicily","Sicily");
      if (inSet(region, ["Lazio","Umbria","Marche","Emilia-Romagna"])) return R("Papal States","Papal");
      if (region === "Toscana") return R("Tuscany","Tuscany");
      if (inSet(region, ["Veneto","Friuli-Venezia Giulia","Trentino-Alto Adige"])) return R("Venice","Venice");
      if (region === "Liguria") return R("Genoa","Genoa");
      if (region === "Sardegna") return R("Sardinia","Sardinia");
      return R("Lombardy","Lombardy"); // Lombardia, Piemonte, Valle d'Aosta
    case "Spain":
      if (inSet(region, ["Aragón","Cataluña","Valenciana","Islas Baleares"])) return R("Crown of Aragón","Aragon");
      if (inSet(region, ["Foral de Navarra","País Vasco","La Rioja"])) return R("Navarre","Navarre");
      if (inSet(region, ["Ceuta","Melilla","Canary Is."])) return null;
      return R("Kingdom of Castile","Castile");
    case "Portugal": return R("Kingdom of Portugal","Portugal");
    default: return null;
  }
}

// ---- build features (rounded, deduped points) ------------------------------
const round = (v) => Math.round(v * 100) / 100;
function cleanRing(ring) {
  const out = [];
  let px, py;
  for (const [lon, lat] of ring) {
    const x = round(lon), y = round(lat);
    if (x !== px || y !== py) { out.push([x, y]); px = x; py = y; }
  }
  return out.length >= 4 ? out : null;
}
function cleanGeom(geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates]
    : geom.type === "MultiPolygon" ? geom.coordinates : [];
  const outPolys = [];
  for (const poly of polys) {
    const outer = cleanRing(poly[0]);
    if (outer) outPolys.push([outer]); // drop holes for the prototype
  }
  if (!outPolys.length) return null;
  return outPolys.length === 1
    ? { type: "Polygon", coordinates: outPolys[0] }
    : { type: "MultiPolygon", coordinates: outPolys };
}

// within-frame check so far-flung provinces (Siberia, Atlantic isles) are dropped
const inFrame = (geom) => {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys)
    for (const [lon, lat] of poly[0])
      if (lon >= -14 && lon <= 46 && lat >= 33 && lat <= 73) return true;
  return false;
};

const features = [];
for (const f of fc.features) {
  const spec = resolve(f.properties);
  if (!spec) continue;
  const geom = cleanGeom(f.geometry);
  if (!geom || !inFrame(geom)) continue;
  features.push({
    type: "Feature",
    geometry: geom,
    properties: { realm: spec.realm, color: spec.color },
  });
}

// ---- label anchors: area-weighted centroid of each realm's largest polygon --
function ringCentroidArea(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    a += cross; cx += (x0 + x1) * cross; cy += (y0 + y1) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) return null;
  return { cx: cx / (6 * a), cy: cy / (6 * a), area: Math.abs(a) };
}
const anchors = {};
for (const f of features) {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    const c = ringCentroidArea(poly[0]);
    if (!c) continue;
    const cur = anchors[f.properties.realm];
    if (!cur || c.area > cur.area) anchors[f.properties.realm] = c;
  }
}
// hand-tuned overrides where the centroid falls awkwardly
const OVERRIDE = {
  "Sápmi": [22, 68.5], "Novgorod Republic": [35, 59], "Empire of Nicaea": [29, 39.5],
  "Kingdom of Norway": [8.5, 61], "Kingdom of Sweden": [15, 61.5],
};
for (const f of features) {
  const o = OVERRIDE[f.properties.realm];
  f.properties.label = o || (anchors[f.properties.realm]
    ? [round(anchors[f.properties.realm].cx), round(anchors[f.properties.realm].cy)]
    : [0, 0]);
}

const seas = [
  { text: "North Sea", at: [3.0, 56.5] },
  { text: "Norwegian Sea", at: [2.0, 66.0] },
  { text: "Baltic Sea", at: [19.5, 58.4] },
  { text: "Mediterranean Sea", at: [5.0, 37.0] },
  { text: "Black Sea", at: [34.0, 43.3] },
  { text: "Bay of Biscay", at: [-5.0, 45.2] },
  { text: "Adriatic Sea", at: [16.2, 42.6] },
];

writeFileSync(join(here, "europe.json"), JSON.stringify({ type: "FeatureCollection", features, seas }));
const realmCount = new Set(features.map((f) => f.properties.realm)).size;
console.log(`wrote ${features.length} provinces in ${realmCount} realms`);
