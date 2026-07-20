/**
 * Main menu - the boot screen. The title is real DOM text and the emblem is a
 * local asset, so branding can change without baking text into key art.
 */

import { isReduceMotion } from "@/ui/settings";
import { t } from "@/ui/i18n";
import { buildNewGameForm, type NewGameConfig } from "@/ui/newgame";
import { factionByName } from "@/data/factions";
import { factionCrestSvg } from "@/data/art";
import { TRAITS, type TraitId } from "@/data/traits";
import { fullscreenAvailable, isFullscreen, toggleFullscreen } from "@/ui/fullscreen";

const LOADING_ART = [
  "/key-art/loading-map-table.jpg",
  "/key-art/loading-harbor-dark.jpg",
  "/key-art/loading-cog-arrival.jpg",
] as const;

export interface MainMenuHooks {
  /** An autosave exists; label the primary entry "Continue". */
  hasSave: boolean;
  /** A live, unfinished game is loaded; starting fresh needs confirmation. */
  liveGameTurn: number | null;
  /** Start a fresh game with the chosen setup. */
  onNewGame(config: NewGameConfig): void;
  /** Open the HUD's Options overlay. */
  onOpenOptions(): void;
  /** Open the HUD's Records overlay. */
  onOpenRecords(): void;
}

/** Show the main menu; resolves when the player enters the game. */
export function showMainMenu(hooks: MainMenuHooks): Promise<void> {
  preloadKeyArt();

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "title-overlay";
    setLoadingArt(overlay, 0);

    const shell = document.createElement("div");
    shell.className = "title-shell";

    const center = document.createElement("div");
    center.className = "title-center";

    const emblem = document.createElement("img");
    emblem.className = "title-emblem";
    emblem.src = "/key-art/sea-of-coin-emblem.png";
    emblem.alt = "";
    emblem.decoding = "async";
    emblem.setAttribute("aria-hidden", "true");

    const wordmark = document.createElement("h1");
    wordmark.className = "title-wordmark";
    wordmark.textContent = t("menu.wordmark");

    const subtitle = document.createElement("p");
    subtitle.className = "title-subtitle";
    subtitle.textContent = "A Hanseatic trade strategy game";

    const divider = document.createElement("div");
    divider.className = "title-divider";
    divider.setAttribute("aria-hidden", "true");

    const version = document.createElement("p");
    version.className = "title-version";
    version.textContent = `v${typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"} · GAIME Studio`;

    const loading = document.createElement("div");
    loading.className = "title-loading";
    loading.setAttribute("aria-live", "polite");
    const loadingMark = document.createElement("div");
    loadingMark.className = "title-loading-mark";
    loadingMark.textContent = t("menu.wordmark");
    const loadingText = document.createElement("div");
    loadingText.className = "title-loading-text";
    loadingText.textContent = t("menu.loading");
    const loadingBar = document.createElement("div");
    loadingBar.className = "title-loading-bar";
    loading.append(loadingMark, loadingText, loadingBar);

    const menu = document.createElement("div");
    menu.className = "title-menu";

    const primary = menuBtn(
      hooks.hasSave ? t("menu.continue") : t("menu.begin"),
      "primary",
      "anchor",
      hooks.hasSave ? "Last saved council" : "Start in the merchant sea",
    );
    primary.addEventListener("click", () => dismiss());

    const newGameBtn = menuBtn(t("menu.newGame"), "", "ship");
    const fullscreenBtn = menuBtn(t("menu.fullscreen"), "", "fullscreen");
    const optionsBtn = menuBtn(t("menu.options"), "", "gear");
    optionsBtn.addEventListener("click", () => hooks.onOpenOptions());
    const recordsBtn = menuBtn(t("menu.records"), "", "medal");
    recordsBtn.addEventListener("click", () => hooks.onOpenRecords());
    menu.append(primary, newGameBtn, fullscreenBtn, optionsBtn, recordsBtn);

    function syncFullscreenBtn(): void {
      const available = fullscreenAvailable();
      fullscreenBtn.disabled = !available;
      setMenuBtnLabel(fullscreenBtn, t(isFullscreen() ? "menu.exitFullscreen" : "menu.fullscreen"));
      fullscreenBtn.title = available
        ? "Toggle browser fullscreen."
        : "Fullscreen is not available in this browser.";
    }
    fullscreenBtn.addEventListener("click", () => {
      void toggleFullscreen().then(syncFullscreenBtn, syncFullscreenBtn);
    });
    document.addEventListener("fullscreenchange", syncFullscreenBtn);
    syncFullscreenBtn();

    const setup = document.createElement("div");
    setup.className = "title-setup title-newgame-panel";
    setup.style.display = "none";
    const setupHead = document.createElement("div");
    setupHead.className = "title-setup-head";
    setupHead.textContent = t("menu.newGame");
    const form = buildNewGameForm();
    const startBtn = menuBtn(t("menu.startGame"), "primary title-start", "anchor");

    let armed = false;
    function disarmStart(): void {
      armed = false;
      setMenuBtnLabel(startBtn, t("menu.startGame"));
      startBtn.classList.remove("armed");
    }
    startBtn.addEventListener("click", () => {
      if (hooks.liveGameTurn !== null && !armed) {
        armed = true;
        setMenuBtnLabel(startBtn, t("menu.discard", { turn: hooks.liveGameTurn }));
        startBtn.classList.add("armed");
        return;
      }
      const config = form.readConfig();
      setLoadingArt(overlay, config.seed);
      hooks.onNewGame(config);
      dismiss();
    });
    const backBtn = menuBtn(t("menu.back"), "", "back");
    backBtn.addEventListener("click", () => showSetup(false));
    setup.append(setupHead, ...form.rows, startBtn, backBtn);
    newGameBtn.addEventListener("click", () => showSetup(true));

    const setupScreen = document.createElement("div");
    setupScreen.className = "title-newgame-screen";
    setupScreen.style.display = "none";

    const setupLeft = document.createElement("div");
    setupLeft.className = "title-newgame-left";
    const setupBrand = document.createElement("div");
    setupBrand.className = "title-newgame-brand";
    const setupEmblem = document.createElement("img");
    setupEmblem.className = "title-newgame-emblem";
    setupEmblem.src = "/key-art/sea-of-coin-emblem.png";
    setupEmblem.alt = "";
    setupEmblem.decoding = "async";
    setupEmblem.setAttribute("aria-hidden", "true");
    const setupMark = document.createElement("div");
    setupMark.className = "title-newgame-mark";
    setupMark.textContent = t("menu.wordmark");
    const setupSub = document.createElement("div");
    setupSub.className = "title-newgame-sub";
    setupSub.textContent = "A Hanseatic trade strategy game";
    setupBrand.append(setupEmblem, setupMark, setupSub);

    const realmCard = document.createElement("section");
    realmCard.className = "title-realm-card";
    setupLeft.append(setupBrand, realmCard);
    setupScreen.append(setupLeft, setup);

    const hint = document.createElement("p");
    hint.className = "title-hint";
    hint.textContent = t("menu.escContinue");
    let closing = false;

    function showSetup(open: boolean): void {
      menu.style.display = open ? "none" : "flex";
      setup.style.display = open ? "flex" : "none";
      shell.style.display = open ? "none" : "grid";
      setupScreen.style.display = open ? "grid" : "none";
      overlay.classList.toggle("title-creating", open);
      hint.textContent = open ? t("menu.escBack") : t("menu.escContinue");
      overlay.scrollTop = 0;
      if (open) {
        form.refreshSeed();
        disarmStart();
        startBtn.focus();
      } else {
        newGameBtn.focus();
      }
    }

    const playAsSelect = setup.querySelector<HTMLSelectElement>(".hud-playas");
    const renderRealmCard = (): void => {
      renderSelectedRealm(realmCard, playAsSelect?.value || "Lübeck");
    };
    playAsSelect?.addEventListener("change", renderRealmCard);
    renderRealmCard();

    const summary = titlePanel("Campaign Summary", [
      ["House", "Lübeck"],
      ["Reputation", "Renowned"],
      ["Trade influence", "68%"],
      ["Active routes", "14"],
      ["Owned cities", "3"],
    ]);
    summary.classList.add("title-summary");

    const news = titlePanel("Merchant News", [
      ["The Lübeck Fair", "Rare goods and contracts await."],
      ["Market report", "Grain prices rise in Novgorod."],
      ["Tip", "Assign ships to protect trade routes."],
    ]);
    news.classList.add("title-news");

    center.append(emblem, wordmark, subtitle, divider, menu, hint);
    shell.append(summary, center, news);
    overlay.append(shell, setupScreen, version, loading);

    const hudRoot = document.querySelector("#hud") ?? document.body;
    hudRoot.classList.add("title-open");
    hudRoot.append(overlay);
    primary.focus();

    function dismiss(): void {
      if (closing) return;
      closing = true;
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("fullscreenchange", syncFullscreenBtn);
      hudRoot.classList.remove("title-open");
      overlay.classList.add("loading");
      window.setTimeout(finishDismiss, isReduceMotion() ? 90 : 620);
    }

    function finishDismiss(): void {
      if (isReduceMotion()) {
        overlay.remove();
      } else {
        overlay.classList.add("leaving");
        overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
        window.setTimeout(() => overlay.remove(), 600);
      }
      resolve();
    }

    function onKey(ev: KeyboardEvent): void {
      if (hudOverlayOpen()) return;
      const target = ev.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "SELECT");
      if (ev.key === "Escape" && !typing) {
        ev.preventDefault();
        if (setup.style.display !== "none") showSetup(false);
        else primary.focus();
      } else if (ev.key === "Tab") {
        trapFocus(overlay, ev);
      }
      ev.stopPropagation();
    }
    window.addEventListener("keydown", onKey, true);
  });
}

function hudOverlayOpen(): boolean {
  for (const o of document.querySelectorAll<HTMLElement>(".hud-techtree-overlay")) {
    if (o.style.display === "none") continue;
    if (o.querySelector(".hud-options-panel, .hud-records-panel")) return true;
  }
  return false;
}

function trapFocus(container: HTMLElement, ev: KeyboardEvent): void {
  const focusable = container.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  const items = Array.from(focusable).filter((el) => el.offsetParent !== null);
  if (items.length === 0) return;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement as HTMLElement | null;
  if (ev.shiftKey && (active === first || !container.contains(active))) {
    ev.preventDefault();
    last.focus();
  } else if (!ev.shiftKey && (active === last || !container.contains(active))) {
    ev.preventDefault();
    first.focus();
  }
}

function setLoadingArt(overlay: HTMLElement, seed: number): void {
  const idx = Math.abs(seed) % LOADING_ART.length;
  overlay.style.setProperty("--title-loading-image", `url("${LOADING_ART[idx]}")`);
}

function preloadKeyArt(): void {
  if (typeof Image === "undefined") return;
  for (const src of ["/key-art/main-harbor.jpg", "/key-art/sea-of-coin-emblem.png", ...LOADING_ART]) {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
  }
}

function menuBtn(label: string, extra = "", icon: TitleMenuIcon = "anchor", detail = ""): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = ("title-menu-btn " + extra).trim();
  const ornament = document.createElement("span");
  ornament.className = "title-menu-ornament";
  ornament.setAttribute("aria-hidden", "true");
  const glyph = document.createElement("span");
  glyph.className = "title-menu-icon";
  glyph.setAttribute("aria-hidden", "true");
  glyph.innerHTML = TITLE_MENU_ICONS[icon];
  const copy = document.createElement("span");
  copy.className = "title-menu-copy";
  const text = document.createElement("span");
  text.className = "title-menu-label";
  text.textContent = label;
  copy.append(text);
  if (detail) {
    const sub = document.createElement("span");
    sub.className = "title-menu-detail";
    sub.textContent = detail;
    copy.append(sub);
  }
  b.append(ornament, glyph, copy);
  return b;
}

function setMenuBtnLabel(b: HTMLButtonElement, label: string): void {
  const span = b.querySelector<HTMLElement>(".title-menu-label");
  if (span) span.textContent = label;
  else b.textContent = label;
}

function titlePanel(title: string, rows: readonly (readonly [string, string])[]): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "title-side-panel";
  const head = document.createElement("h2");
  head.textContent = title;
  const list = document.createElement("div");
  list.className = "title-side-list";
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "title-side-row";
    const l = document.createElement("span");
    l.textContent = label;
    const v = document.createElement("strong");
    v.textContent = value;
    row.append(l, v);
    list.append(row);
  }
  panel.append(head, list);
  return panel;
}

function renderSelectedRealm(card: HTMLElement, factionName: string): void {
  const def = factionByName(factionName);
  card.innerHTML = "";
  const eyebrow = document.createElement("div");
  eyebrow.className = "title-realm-eyebrow";
  eyebrow.textContent = "Selected realm";
  const body = document.createElement("div");
  body.className = "title-realm-body";
  const crest = document.createElement("div");
  crest.className = "title-realm-crest";
  crest.style.setProperty("--realm-color", def?.color ?? "#b0273b");
  const crestArt = factionCrestSvg(def?.name, def?.color ?? "#b0273b");
  if (crestArt) {
    crest.classList.add("has-art");
    crest.innerHTML = crestArt;
  }
  const names = document.createElement("div");
  names.className = "title-realm-nameblock";
  const name = document.createElement("h2");
  name.textContent = def?.name ?? "Random realm";
  const trait = document.createElement("p");
  trait.textContent = def ? TRAITS[def.trait].label : "Random";
  names.append(name, trait);
  body.append(crest, names);

  const stats = document.createElement("div");
  stats.className = "title-realm-stats";
  const rows = def ? realmStats(def.trait) : [["Realm", "Random"], ["Opening", "Chosen at start"], ["Pressure", "Adaptive"]];
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "title-realm-stat";
    const l = document.createElement("span");
    l.textContent = label;
    const v = document.createElement("strong");
    v.textContent = value;
    row.append(l, v);
    stats.append(row);
  }

  const blurb = document.createElement("p");
  blurb.className = "title-realm-blurb";
  blurb.textContent = def
    ? `${def.blurb} ${def.bonus.label}: ${def.bonus.detail}`
    : "A realm is picked for you.";
  card.append(eyebrow, body, stats, blurb);
}

function realmStats(trait: TraitId): readonly (readonly [string, string])[] {
  switch (trait) {
    case "mercantile":
      return [["Trade influence", "+15%"], ["Wealth generation", "+10%"], ["Market access", "+1"]];
    case "industrious":
      return [["Work output", "+25%"], ["Build tempo", "+10%"], ["Guild access", "+1"]];
    case "fertile":
      return [["Food surplus", "+25%"], ["Growth pressure", "+10%"], ["Settlers", "+1"]];
    case "martial":
      return [["Unit cost", "-20%"], ["Border pressure", "+10%"], ["Muster", "+1"]];
    case "scholarly":
      return [["Knowledge", "+30%"], ["Research pace", "+10%"], ["Civic access", "+1"]];
  }
}

type TitleMenuIcon = "anchor" | "ship" | "gear" | "medal" | "fullscreen" | "back";

const TITLE_MENU_ICONS: Record<TitleMenuIcon, string> = {
  anchor: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v13"/><path d="M8.5 7h7"/><path d="M12 3.5a2 2 0 110 4 2 2 0 010-4z"/><path d="M5 13c0 4 3 7 7 7s7-3 7-7"/><path d="M5 13l-2 2M19 13l2 2"/></svg>',
  ship: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15.5h16l-2.3 4.2H7z"/><path d="M8 15.5V6l8 3.2v6.3"/><path d="M8 6h8"/><path d="M6 21c1.2-.8 2.4-.8 3.6 0 1.2.8 2.4.8 3.6 0 1.2-.8 2.4-.8 3.6 0"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.7 5.7l2.1 2.1M16.2 16.2l2.1 2.1M18.3 5.7l-2.1 2.1M7.8 16.2l-2.1 2.1"/></svg>',
  medal: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4.5"/><path d="M9.4 12.1L7.8 20l4.2-2 4.2 2-1.6-7.9"/></svg>',
  fullscreen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4"/><path d="M4 4l6 6"/><path d="M16 4h4v4"/><path d="M20 4l-6 6"/><path d="M8 20H4v-4"/><path d="M4 20l6-6"/><path d="M16 20h4v-4"/><path d="M20 20l-6-6"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/><path d="M9 12h11"/></svg>',
};
