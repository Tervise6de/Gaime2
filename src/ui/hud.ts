/**
 * HUD — the DOM/CSS layer over the canvas.
 *
 * The UI observes GameState and emits intents through `HudHandlers`; it never
 * mutates the simulation directly. It rebuilds its panels from state on every
 * update (cheap at this scale) so it always reflects the live game.
 */

import { UNITS, totalUnits } from "@/systems/data";
import { nationNetIncome } from "@/systems/economy";
import { prestige } from "@/systems/scoring";
import { unitCost } from "@/systems/actions";
import type { GameState, UnitType } from "@/systems/types";
import { UNIT_TYPES } from "@/systems/types";

export interface HudHandlers {
  onEndTurn(): void;
  onRaise(type: UnitType): void;
  onBuildFort(): void;
  onSetTax(rate: number): void;
  onNewGame(): void;
  onToggleMap(): void;
}

export interface Hud {
  update(state: GameState, selected: number): void;
  setMapLabel(label: string): void;
  root: HTMLElement;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createHud(root: HTMLElement, handlers: HudHandlers): Hud {
  const topbar = el("div", "hud-topbar");
  const sidepanel = el("div", "hud-panel");
  const logpanel = el("div", "hud-log");
  const controls = el("div", "hud-controls");

  root.append(topbar, sidepanel, logpanel, controls);

  // Static controls (built once).
  const taxLabel = el("span", "hud-tax-label");
  const tax = el("input", "hud-tax");
  tax.type = "range";
  tax.min = "0";
  tax.max = "34";
  tax.step = "1";
  tax.addEventListener("input", () => handlers.onSetTax(Number(tax.value) / 100));

  const mapBtn = el("button", "hud-btn", "Kaart");
  mapBtn.title = "Vaheta kaardi kuvamist";
  mapBtn.addEventListener("click", () => handlers.onToggleMap());
  const endBtn = el("button", "hud-btn hud-btn-primary", "Lõpeta käik");
  endBtn.addEventListener("click", () => handlers.onEndTurn());
  const newBtn = el("button", "hud-btn", "Uus mäng");
  newBtn.addEventListener("click", () => handlers.onNewGame());
  controls.append(taxLabel, tax, mapBtn, endBtn, newBtn);

  function setMapLabel(label: string): void {
    mapBtn.textContent = label;
  }

  function update(state: GameState, selected: number): void {
    const player = state.nations.find((n) => n.isPlayer)!;

    // Top bar.
    topbar.replaceChildren();
    const ownedCount = state.regions.filter((r) => r.owner === player.id).length;
    const income = nationNetIncome(state, player.id);
    topbar.append(
      stat("Käik", `${state.turn} / ${state.maxTurns}`),
      stat("Kuld", `${Math.round(player.treasury)}`),
      stat("Tulu", `${income >= 0 ? "+" : ""}${Math.round(income)}`),
      stat("Alad", `${ownedCount} / ${state.regions.length}`),
      stat("Prestiiž", `${prestige(state, player.id)}`),
      stat("Maks", `${Math.round(player.taxRate * 100)}%`),
    );
    tax.value = String(Math.round(player.taxRate * 100));
    taxLabel.textContent = `Maks ${Math.round(player.taxRate * 100)}%`;

    // Side panel — selected region.
    sidepanel.replaceChildren();
    if (selected < 0) {
      sidepanel.append(el("div", "hud-hint", "Vali ala kaardilt."));
    } else {
      const region = state.regions[selected];
      const owner = region.owner >= 0 ? state.nations[region.owner] : null;
      const title = el("div", "hud-panel-title", region.name);
      const swatch = el("span", "hud-swatch");
      swatch.style.background = owner ? owner.color : "#5a606c";
      title.prepend(swatch);
      sidepanel.append(title);
      sidepanel.append(
        row("Omanik", owner ? owner.name : "Neutraalne"),
        row("Maastik", TERRAIN_ET[region.terrain]),
        row("Rahvastik", String(Math.round(region.population))),
        row("Kindlus", "★".repeat(region.fort) || "–"),
      );

      const army = state.armies.find((a) => a.location === selected);
      if (army && totalUnits(army.units) > 0) {
        const parts = UNIT_TYPES.filter((t) => army.units[t] > 0)
          .map((t) => `${UNIT_ET[t]} ${army.units[t]}`)
          .join(", ");
        const armyOwner = state.nations[army.owner];
        sidepanel.append(row("Vägi", `${armyOwner.name}: ${parts}`));
      }

      // Player actions only on owned regions during play.
      if (region.owner === player.id && state.phase === "playing") {
        const actions = el("div", "hud-actions");
        for (const type of UNIT_TYPES) {
          const cost = unitCost(type);
          const btn = el("button", "hud-btn hud-btn-sm", `${UNIT_ET[type]} (${cost})`);
          btn.disabled = player.treasury < cost;
          btn.title = `Rünnak ${UNITS[type].attack} / Kaitse ${UNITS[type].defense}`;
          btn.addEventListener("click", () => handlers.onRaise(type));
          actions.append(btn);
        }
        const fortCost = 20 + region.fort * 12;
        const fortBtn = el("button", "hud-btn hud-btn-sm", `Kindlus (${fortCost})`);
        fortBtn.disabled = player.treasury < fortCost || region.fort >= 4;
        fortBtn.addEventListener("click", () => handlers.onBuildFort());
        actions.append(fortBtn);
        sidepanel.append(actions);
        sidepanel.append(el("div", "hud-hint", "Vali oma vägi, seejärel klõpsa naaberala rünnakuks/liikumiseks."));
      }
    }

    // Log — last several entries.
    logpanel.replaceChildren();
    for (const line of state.log.slice(-6)) logpanel.append(el("div", "hud-log-line", line));

    endBtn.disabled = state.phase === "ended";
  }

  function stat(label: string, value: string): HTMLElement {
    const wrap = el("div", "hud-stat");
    wrap.append(el("span", "hud-stat-label", label), el("span", "hud-stat-value", value));
    return wrap;
  }

  function row(label: string, value: string): HTMLElement {
    const wrap = el("div", "hud-row");
    wrap.append(el("span", "hud-row-label", label), el("span", "hud-row-value", value));
    return wrap;
  }

  return { update, setMapLabel, root };
}

const TERRAIN_ET: Record<string, string> = {
  plains: "Tasandik",
  forest: "Mets",
  hills: "Küngas",
  mountains: "Mägi",
  coast: "Rannik",
};

const UNIT_ET: Record<UnitType, string> = {
  militia: "Maakaitse",
  infantry: "Jalavägi",
  ranged: "Vibukütid",
  cavalry: "Ratsavägi",
  siege: "Piiramismasin",
};
