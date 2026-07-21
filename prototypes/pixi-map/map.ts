// PixiJS (WebGL) prototype: the Gaime2 world map as a clean, playable strategy
// map. Real European geography + 13th-century realms from the reference, but
// rendered game-style: crisp borders, readable labels, raised-board depth,
// and hover / click selection — not an antique parchment look.
import {
  Application,
  Container,
  Graphics,
  Text,
  Sprite,
  Texture,
  BlurFilter,
} from "pixi.js";
import { geoConicConformal } from "d3-geo";
import data from "./europe.json";

const W = 1480;
const H = 1100;

// ---- palette (clean game map) ---------------------------------------------
const SEA = 0x21445b; // deep muted blue — makes the realms pop
const SEA_DEEP = 0x18313f; // outer sea, for a soft depth gradient
const BORDER = 0x14202a; // crisp territory borders
const SHADOW = 0x0b1620; // landmass drop shadow
const LABEL = 0x1b1710;
const LABEL_HALO = 0xf3ecdc;
const SEA_LABEL = 0x8fb6d2;
const HOVER = 0xffffff;
const SELECT = 0xffd66b;

// ---- projection: conic conformal fit to a European window ------------------
const proj = geoConicConformal().parallels([43, 62]).rotate([-15, 0]);
// fit to the window's corner points (a Polygon would trip d3's winding rule)
const WINDOW = {
  type: "MultiPoint" as const,
  coordinates: [[-12, 34], [42, 34], [42, 71], [-12, 71]],
};
proj.fitExtent([[40, 74], [W - 40, H - 44]], WINDOW as any);
const project = (lon: number, lat: number): [number, number] => {
  const p = proj([lon, lat]);
  return p ? [p[0], p[1]] : [0, 0];
};

function toRings(geom: any): number[][] {
  const rings: number[][] = [];
  const polys =
    geom.type === "Polygon"
      ? [geom.coordinates]
      : geom.type === "MultiPolygon"
      ? geom.coordinates
      : [];
  for (const poly of polys) {
    const flat: number[] = [];
    for (const [lon, lat] of poly[0]) {
      const [x, y] = project(lon, lat);
      flat.push(x, y);
    }
    if (flat.length >= 6) rings.push(flat);
  }
  return rings;
}

function seaGradient(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(
    w * 0.5, h * 0.46, Math.min(w, h) * 0.2,
    w * 0.5, h * 0.5, Math.max(w, h) * 0.7
  );
  const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
  g.addColorStop(0, hex(SEA));
  g.addColorStop(1, hex(SEA_DEEP));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}

const serif = 'Georgia, "Times New Roman", serif';

// ---- boot ------------------------------------------------------------------
const app = new Application();
await app.init({ width: W, height: H, antialias: true, background: SEA });
document.getElementById("app")!.appendChild(app.canvas);

// sea with a soft radial depth
const sea = Sprite.from(Texture.from(seaGradient(W, H)));
sea.width = W;
sea.height = H;
app.stage.addChild(sea);

// landmass drop shadow (soft, offset) — gives a raised game-board feel
const shadow = new Container();
const shadowG = new Graphics();
for (const f of data.features)
  for (const ring of toRings(f.geometry)) shadowG.poly(ring).fill(SHADOW);
shadow.addChild(shadowG);
shadow.filters = [new BlurFilter({ strength: 6 })];
shadow.alpha = 0.5;
shadow.x = 5;
shadow.y = 7;
app.stage.addChild(shadow);

// realms
const land = new Container();
app.stage.addChild(land);
const hoverLayer = new Graphics();
app.stage.addChild(hoverLayer);
const selectLayer = new Graphics();
app.stage.addChild(selectLayer);

type Realm = { g: Graphics; rings: number[][]; realm: string; color: number };
const realms: Realm[] = [];
let selected: Realm | null = null;

for (const f of data.features) {
  const rings = toRings(f.geometry);
  const color = (f.properties as any).color as number;
  const g = new Graphics();
  for (const ring of rings) {
    g.poly(ring).fill({ color });
    g.poly(ring).stroke({ width: 1.1, color: BORDER, alpha: 0.9, join: "round" });
  }
  g.eventMode = "static";
  g.cursor = "pointer";
  land.addChild(g);
  const r: Realm = { g, rings, realm: (f.properties as any).realm, color };
  realms.push(r);
  g.on("pointerover", () => hover(r));
  g.on("pointerout", () => hover(null));
  g.on("pointertap", () => select(r));
}

// ---- labels ----------------------------------------------------------------
const labelLayer = new Container();
app.stage.addChild(labelLayer);

function placeLabel(
  text: string, lon: number, lat: number,
  o: { size: number; color: number; halo?: number; italic?: boolean; caps?: boolean }
) {
  const [x, y] = project(lon, lat);
  if (x < 28 || x > W - 28 || y < 40 || y > H - 28) return;
  const t = new Text({
    text: o.caps ? text.toUpperCase() : text,
    style: {
      fontFamily: serif,
      fontSize: o.size,
      fontStyle: o.italic ? "italic" : "normal",
      fontWeight: o.italic ? "normal" : "600",
      fill: o.color,
      align: "center",
      letterSpacing: o.caps ? 1.5 : 0.2,
      ...(o.halo !== undefined
        ? { stroke: { color: o.halo, width: 3.2, alpha: 0.85 } }
        : {}),
    },
  });
  t.anchor.set(0.5);
  t.x = x;
  t.y = y;
  labelLayer.addChild(t);
}

const labelled = new Set<string>();
for (const f of data.features) {
  const p = f.properties as any;
  if (labelled.has(p.realm)) continue; // one label per realm
  labelled.add(p.realm);
  placeLabel(p.realm, p.label[0], p.label[1], { size: 16, color: LABEL, halo: LABEL_HALO });
}
for (const s of (data as any).seas as { text: string; at: [number, number] }[])
  placeLabel(s.text, s.at[0], s.at[1], { size: 15, color: SEA_LABEL, italic: true });

// ---- hover + select feedback ----------------------------------------------
const readout = new Text({
  text: "Hover a realm",
  style: { fontFamily: serif, fontSize: 19, fill: 0xcfe0ea, fontStyle: "italic" },
});
readout.anchor.set(0.5, 1);
readout.x = W / 2;
readout.y = H - 22;
app.stage.addChild(readout);

function hover(r: Realm | null) {
  hoverLayer.clear();
  if (!r) {
    readout.text = selected ? `Selected: ${selected.realm}` : "Hover a realm";
    return;
  }
  for (const ring of r.rings) {
    hoverLayer.poly(ring).fill({ color: HOVER, alpha: 0.16 });
    hoverLayer.poly(ring).stroke({ width: 2, color: HOVER, alpha: 0.6, join: "round" });
  }
  readout.text = r.realm;
}

function select(r: Realm) {
  selected = r;
  selectLayer.clear();
  for (const ring of r.rings)
    selectLayer.poly(ring).stroke({ width: 3.4, color: SELECT, alpha: 0.95, join: "round" });
  readout.text = `Selected: ${r.realm}`;
}

// ---- minimal compass + title ----------------------------------------------
const compass = new Graphics();
compass.circle(70, 92, 22).stroke({ width: 1.4, color: 0x9fb6c6, alpha: 0.7 });
compass.poly([70, 74, 75, 92, 70, 88, 65, 92]).fill({ color: 0xd98b6a });
compass.poly([70, 110, 75, 92, 70, 96, 65, 92]).fill({ color: 0x9fb6c6, alpha: 0.8 });
app.stage.addChild(compass);
const nLabel = new Text({
  text: "N",
  style: { fontFamily: serif, fontSize: 15, fill: 0xcfe0ea, fontWeight: "bold" },
});
nLabel.anchor.set(0.5);
nLabel.x = 70;
nLabel.y = 60;
app.stage.addChild(nLabel);

const title = new Text({
  text: "EUROPE · 1227",
  style: {
    fontFamily: serif, fontSize: 22, fontWeight: "bold",
    fill: 0xe6eef4, letterSpacing: 4,
  },
});
title.anchor.set(0.5, 0);
title.x = W / 2;
title.y = 26;
app.stage.addChild(title);

// demo hook: drive hover/select without a real pointer (for screenshots)
(window as any).__demo = (name: string) => {
  const r = realms.find((x) => x.realm === name);
  if (r) {
    select(r);
    hover(r);
  }
};
(window as any).__mapReady = true;
