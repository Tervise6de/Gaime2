/**
 * HUD (heads-up display).
 *
 * The DOM/CSS overlay that sits above the canvas map (design doc §7 hybrid:
 * canvas for the map, DOM for the UI). It *observes* game state and *emits
 * intents* through callbacks — it never mutates the simulation directly.
 *
 * Shows: turn, treasury + stockpiles, a live preview of next turn's income, the
 * tax slider, the end-turn button, and a detail panel for the selected region.
 */

import { MAX_TAX_RATE } from "@/core/constants";
import type { GameState, Nation, ResourceKind } from "@/core/types";
import { TERRAIN } from "@/data/terrain";
import { computePlayerEconomy, computeRegionProduction } from "@/systems/economy";

export interface HudCallbacks {
  /** Player changed the tax rate (0..MAX_TAX_RATE). */
  onTaxChange(rate: number): void;
  /** Player pressed End Turn. */
  onEndTurn(): void;
}

export interface Hud {
  /** Re-render the HUD from the current state and selection. */
  update(state: GameState, selectedRegionId: number | null): void;
  /** Remove the HUD from the DOM. */
  destroy(): void;
}

const RESOURCE_META: Record<ResourceKind, { label: string; icon: string }> = {
  gold: { label: "Gold", icon: "◈" },
  food: { label: "Food", icon: "❦" },
  materials: { label: "Materials", icon: "⛏" },
  knowledge: { label: "Knowledge", icon: "✦" },
};

const RESOURCE_ORDER: ResourceKind[] = [
  "gold",
  "food",
  "materials",
  "knowledge",
];

/** Tiny hyperscript-style element helper. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: className, ...rest } = props;
  if (className) node.className = className;
  Object.assign(node, rest);
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

/** Format a signed per-turn delta, e.g. `+3.5` / `-1.2`. */
function signed(n: number): string {
  const r = Math.round(n * 10) / 10;
  return (r >= 0 ? "+" : "") + r.toString();
}

export function createHud(root: HTMLElement, callbacks: HudCallbacks): Hud {
  // --- Top bar: turn + stockpiles + income preview ---------------------------
  const turnLabel = el("span", { class: "hud-turn" });
  const statTiles = new Map<ResourceKind, { value: HTMLElement; delta: HTMLElement }>();

  const statsRow = el("div", { class: "hud-stats" });
  for (const kind of RESOURCE_ORDER) {
    const value = el("span", { class: "hud-stat-value" });
    const delta = el("span", { class: "hud-stat-delta" });
    statTiles.set(kind, { value, delta });
    statsRow.append(
      el("div", { class: "hud-stat", title: RESOURCE_META[kind].label }, [
        el("span", { class: "hud-stat-icon" }, [RESOURCE_META[kind].icon]),
        el("span", { class: "hud-stat-label" }, [RESOURCE_META[kind].label]),
        value,
        delta,
      ]),
    );
  }

  const topBar = el("header", { class: "hud-top" }, [
    el("div", { class: "hud-brand" }, [turnLabel]),
    statsRow,
  ]);

  // --- Bottom bar: tax slider + end turn -------------------------------------
  const taxValue = el("span", { class: "hud-tax-value" });
  const taxSlider = el("input", {
    type: "range",
    min: "0",
    max: String(Math.round(MAX_TAX_RATE * 100)),
    step: "1",
    class: "hud-tax-slider",
  });
  taxSlider.addEventListener("input", () => {
    callbacks.onTaxChange(Number(taxSlider.value) / 100);
  });

  const endTurnBtn = el("button", { class: "hud-endturn", type: "button" }, [
    "End Turn ▸",
  ]);
  endTurnBtn.addEventListener("click", () => callbacks.onEndTurn());

  const bottomBar = el("footer", { class: "hud-bottom" }, [
    el("label", { class: "hud-tax" }, [
      el("span", { class: "hud-tax-label" }, ["Tax rate"]),
      taxSlider,
      taxValue,
    ]),
    endTurnBtn,
  ]);

  // --- Side panel: selected region details -----------------------------------
  const regionPanel = el("aside", { class: "hud-region hud-region--empty" });

  const container = el("div", { class: "hud" }, [topBar, bottomBar, regionPanel]);
  root.append(container);

  function renderRegionPanel(state: GameState, selectedRegionId: number | null): void {
    regionPanel.replaceChildren();
    if (selectedRegionId === null) {
      regionPanel.classList.add("hud-region--empty");
      regionPanel.append(
        el("p", { class: "hud-hint" }, ["Click a region to inspect it."]),
      );
      return;
    }
    const region = state.regions[selectedRegionId];
    if (!region) return;
    regionPanel.classList.remove("hud-region--empty");

    const terrain = TERRAIN[region.terrain];
    const owner: Nation | undefined =
      region.ownerId === null
        ? undefined
        : state.nations.find((n) => n.id === region.ownerId);

    const swatch = el("span", { class: "hud-swatch" });
    swatch.style.setProperty("--swatch", terrain.color);

    const rows: (Node | string)[] = [
      el("h2", { class: "hud-region-name" }, [region.name]),
      el("div", { class: "hud-region-meta" }, [
        swatch,
        el("span", {}, [terrain.name + (region.coastal ? " · Coastal" : "")]),
      ]),
      el("dl", { class: "hud-region-facts" }, [
        el("dt", {}, ["Owner"]),
        el("dd", {}, [owner ? owner.name : "Unclaimed"]),
        el("dt", {}, ["Population"]),
        el("dd", {}, [String(region.population)]),
        el("dt", {}, ["Neighbours"]),
        el("dd", {}, [String(region.adjacency.length)]),
      ]),
    ];

    // Production breakdown (only meaningful for owned regions).
    if (owner) {
      const prod = computeRegionProduction(region, owner.taxRate);
      rows.push(el("h3", { class: "hud-region-sub" }, ["Production / turn"]));
      const prodList = el("ul", { class: "hud-prod" });
      for (const kind of RESOURCE_ORDER) {
        prodList.append(
          el("li", {}, [
            el("span", { class: "hud-prod-icon" }, [RESOURCE_META[kind].icon]),
            el("span", { class: "hud-prod-label" }, [RESOURCE_META[kind].label]),
            el("span", { class: "hud-prod-val" }, [signed(prod[kind])]),
          ]),
        );
      }
      rows.push(prodList);
    }

    regionPanel.append(...rows);
  }

  return {
    update(state: GameState, selectedRegionId: number | null): void {
      const player = state.nations.find((n) => n.id === state.playerNationId)!;
      const economy = computePlayerEconomy(state);

      turnLabel.textContent = `Turn ${state.turn}`;

      for (const kind of RESOURCE_ORDER) {
        const tile = statTiles.get(kind)!;
        tile.value.textContent = String(Math.round(player.stockpile[kind]));
        tile.delta.textContent = signed(economy.totals[kind]);
        tile.delta.classList.toggle("is-negative", economy.totals[kind] < 0);
      }

      const pct = Math.round(player.taxRate * 100);
      taxSlider.value = String(pct);
      taxValue.textContent = `${pct}%`;

      renderRegionPanel(state, selectedRegionId);
    },
    destroy(): void {
      container.remove();
    },
  };
}
