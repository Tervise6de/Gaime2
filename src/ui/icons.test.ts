// @vitest-environment happy-dom
/**
 * The icon helpers, which are the project's main `innerHTML` sink.
 *
 * `iconHtml` and its wrappers build markup strings that HUD code interpolates
 * into `innerHTML`. Two contracts matter and neither was pinned: the fallback
 * text must be escaped (it is sometimes a region or realm name, and a map or a
 * save file is not a trusted source), and the whole registry may be null — the
 * game is meant to render identically with no art at all.
 */

import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  glyphHtml,
  iconBtn,
  iconEl,
  iconHtml,
  resourceIconHtml,
  setIconBtnLabel,
} from "@/ui/icons";

describe("escapeHtml", () => {
  it("neutralises every character that could open a tag or attribute", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    // Ampersand first, or the other escapes would be double-encoded.
    expect(escapeHtml("Fish & Chips")).toBe("Fish &amp; Chips");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves ordinary place names alone", () => {
    for (const name of ["Lübeck", "Ösel", "Åbo", "Hålogaland", "Dzūkija"]) {
      expect(escapeHtml(name)).toBe(name);
    }
  });
});

describe("iconHtml", () => {
  it("escapes fallback text rather than trusting it", () => {
    const html = iconHtml(null, '<img src=x onerror="boom">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    // The markup it does emit is a single closed span.
    expect(html.startsWith("<span")).toBe(true);
    expect(html.endsWith("</span>")).toBe(true);
  });

  it("emits registry SVG unescaped — that is the asset, not user input", () => {
    const svg = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';
    expect(iconHtml(svg, "fallback")).toContain(svg);
  });

  it("emits nothing at all when there is neither asset nor fallback", () => {
    expect(iconHtml(null, "")).toBe("");
    expect(iconHtml(undefined, "")).toBe("");
  });

  it("marks every icon decorative, so screen readers read the label instead", () => {
    expect(iconHtml("<svg/>", "x")).toContain('aria-hidden="true"');
    expect(iconHtml(null, "⚓")).toContain('aria-hidden="true"');
  });
});

describe("iconEl", () => {
  it("uses the SVG when present and text when not", () => {
    const withArt = iconEl("<svg><circle/></svg>", "⚓");
    expect(withArt.querySelector("circle")).not.toBeNull();
    expect(withArt.className).toContain("ico-svg");

    const withoutArt = iconEl(null, "⚓");
    expect(withoutArt.textContent).toBe("⚓");
    expect(withoutArt.className).not.toContain("ico-svg");
  });

  it("hides an icon that would render as nothing", () => {
    expect(iconEl(null, "").hidden).toBe(true);
  });
});

describe("the registry wrappers degrade to their placeholders", () => {
  it("returns something usable for every id, art or no art", () => {
    // A real glyph and a real resource id: whatever the registry holds, the
    // caller must get either markup or a clean empty string — never "undefined".
    for (const html of [glyphHtml("warning", "⚠"), resourceIconHtml("salt", "🧂")]) {
      expect(html).not.toContain("undefined");
      expect(html === "" || html.startsWith("<span")).toBe(true);
    }
  });
});

describe("iconBtn", () => {
  it("builds a button whose label can be swapped without losing the icon", () => {
    let clicks = 0;
    const b = iconBtn("warning", "⚠", "Declare war", "hud-btn", () => clicks++);
    expect(b.textContent).toContain("Declare war");
    b.click();
    expect(clicks).toBe(1);

    setIconBtnLabel(b, "Sue for peace");
    expect(b.textContent).toContain("Sue for peace");
    expect(b.textContent).not.toContain("Declare war");
    expect(b.querySelector(".ico-label")).not.toBeNull();
    // The icon child survived the relabel.
    expect(b.children.length).toBe(2);
  });
});
