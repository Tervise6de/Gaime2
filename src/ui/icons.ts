/**
 * DOM-side icon helpers over the art registry (data/art.ts).
 *
 * Every helper degrades gracefully: when the registry has no asset for an id,
 * the original emoji/text placeholder is rendered instead, so the UI is
 * identical with an empty registry. Icons are decorative (`aria-hidden`);
 * meaning is always carried by the adjacent label or tooltip.
 */

import { GLYPH_ART, RESOURCE_ART, UNIT_ART, BUILDING_ART, type GlyphId, type ResourceArtId } from "@/data/art";
import type { UnitType } from "@/data/units";
import type { BuildingId } from "@/data/buildings";

/**
 * An inline-SVG icon element, or a text (emoji) span when no asset exists. With
 * neither an asset nor fallback text (a null registry entry used purely
 * decoratively), returns an empty non-rendering span so nothing collapses to a
 * zero-size artifact — honouring the "renders fine with an all-null registry"
 * contract.
 */
export function iconEl(svg: string | null | undefined, fallbackText: string, className = "ico"): HTMLElement {
  const span = document.createElement("span");
  span.className = svg ? `${className} ico-svg` : className;
  span.setAttribute("aria-hidden", "true");
  if (svg) span.innerHTML = svg;
  else if (fallbackText) span.textContent = fallbackText;
  else span.hidden = true;
  return span;
}

/** Same as `iconEl` but as an HTML string, for innerHTML template sites. */
export function iconHtml(svg: string | null | undefined, fallbackText: string, className = "ico"): string {
  if (svg) return `<span class="${className} ico-svg" aria-hidden="true">${svg}</span>`;
  if (!fallbackText) return ""; // no asset, no fallback → emit nothing rather than an empty span
  return `<span class="${className}" aria-hidden="true">${escapeHtml(fallbackText)}</span>`;
}

export function glyphEl(id: GlyphId, fallbackText: string, className = "ico"): HTMLElement {
  return iconEl(GLYPH_ART[id], fallbackText, className);
}

export function glyphHtml(id: GlyphId, fallbackText: string, className = "ico"): string {
  return iconHtml(GLYPH_ART[id], fallbackText, className);
}

export function resourceIconEl(id: ResourceArtId, fallbackText: string, className = "ico"): HTMLElement {
  return iconEl(RESOURCE_ART[id], fallbackText, className);
}

export function resourceIconHtml(id: ResourceArtId, fallbackText: string, className = "ico"): string {
  return iconHtml(RESOURCE_ART[id], fallbackText, className);
}

export function unitIconHtml(id: UnitType, fallbackText: string, className = "ico"): string {
  return iconHtml(UNIT_ART[id], fallbackText, className);
}

export function buildingIconHtml(id: BuildingId, fallbackText: string, className = "ico"): string {
  return iconHtml(BUILDING_ART[id], fallbackText, className);
}

export function unitIconEl(id: UnitType, fallbackText: string, className = "ico"): HTMLElement {
  return iconEl(UNIT_ART[id], fallbackText, className);
}

export function buildingIconEl(id: BuildingId, fallbackText: string, className = "ico"): HTMLElement {
  return iconEl(BUILDING_ART[id], fallbackText, className);
}

/** A button whose label is `[icon] text` — the emoji fallback keeps today's look. */
export function iconBtn(
  glyph: GlyphId,
  fallbackText: string,
  label: string,
  className: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = className;
  b.append(glyphEl(glyph, fallbackText), labelSpan(label));
  b.addEventListener("click", onClick);
  return b;
}

/** Swap the text part of an `iconBtn` label (icon child stays). */
export function setIconBtnLabel(b: HTMLButtonElement, label: string): void {
  const span = b.querySelector(".ico-label");
  if (span) span.textContent = label;
  else b.append(labelSpan(label));
}

function labelSpan(label: string): HTMLElement {
  const s = document.createElement("span");
  s.className = "ico-label";
  s.textContent = label;
  return s;
}

/** Escape a string for safe interpolation into an innerHTML template. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
