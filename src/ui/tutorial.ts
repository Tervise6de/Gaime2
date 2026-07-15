/**
 * Interactive first-game tutorial — a skippable, re-openable coached walkthrough.
 *
 * It runs *over* the already-rendered HUD: each step spotlights a live UI element
 * (by CSS selector) and shows a one-line explanation, advancing on Next. Purely a
 * presentation layer over the DOM — it reads element positions and never touches
 * the sim. The step list is exported as pure data so its shape can be unit-tested.
 */

export interface TutorialStep {
  /** CSS selector of the element to spotlight, or null for a centred card. */
  target: string | null;
  title: string;
  body: string;
}

/** The coached sequence. Selectors point at stable HUD hooks. */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    target: null,
    title: "Welcome, ruler",
    body: "You lead one realm among rivals. Grow your economy, keep your people content, and win by conquest, Great Works, or prestige. This quick tour points out the essentials — you can skip it any time.",
  },
  {
    target: ".hud-topbar",
    title: "Your treasury & production",
    body: "Gold, food, materials and knowledge — with each resource's per-turn flow. Watch food (famine bites) and gold (bankruptcy disbands troops). The victory bar up top tracks who's nearest a victory.",
  },
  {
    target: ".hud-tax-slider",
    title: "Set your tax rate",
    body: "Higher tax turns more trade into gold — but steadily raises unrest. Ease off when regions grow restless; a province in revolt can secede.",
  },
  {
    target: "#game-canvas",
    title: "The world map",
    body: "Each node is a region you can click to inspect and develop: queue buildings, raise armies, read its unrest. Your armies (coloured badges) move along the links to expand or attack.",
  },
  {
    target: ".hud-tech-menu",
    title: "Research",
    body: "Knowledge funds one technology at a time — each shows its effect inline. Techs unlock buildings, units and yield bonuses. Open the full tree with 'Tech tree'.",
  },
  {
    target: ".hud-right",
    title: "Diplomacy",
    body: "Make war or peace, sign pacts, gift gold, demand tribute — or open a trade route (gold each turn while at peace). The strength chip shows how each rival compares to you; a Reeling badge marks a rival in crisis.",
  },
  {
    target: ".hud-endturn",
    title: "End your turn",
    body: "When you've set policy and moved armies, end the turn — rivals act, the economy resolves, and events fire. That's the whole loop: plan, commit, resolve. Good luck!",
  },
];

const SEEN_KEY = "gaime2:tutorialSeen";

export function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
    // The tour is the richer onboarding, so also retire the legacy first-run hints
    // box (still reachable via the 💡 Help button) — one welcome flow, not two.
    localStorage.setItem("gaime2:hintsSeen", "1");
  } catch {
    /* storage unavailable — the tour just re-offers next time */
  }
}

/**
 * Run the tour over the live HUD. Builds a dimmed overlay with a highlight ring
 * and an instruction card; Next/→/Enter advance, Skip/Esc end it. Marks "seen"
 * on completion or skip and cleans up all DOM it created.
 */
export function runTutorial(): void {
  if (document.querySelector(".tut-overlay")) return; // already running

  const overlay = document.createElement("div");
  overlay.className = "tut-overlay";
  const highlight = document.createElement("div");
  highlight.className = "tut-highlight";
  const card = document.createElement("div");
  card.className = "tut-card";
  overlay.append(highlight, card);
  document.body.append(overlay);

  let i = 0;

  function finish(): void {
    markTutorialSeen();
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    overlay.remove();
  }

  // Reposition the spotlight/card when the viewport changes. Named so `finish`
  // can remove it — an anonymous listener would leak on every tour (the tour is
  // re-openable), each firing `render()` against detached DOM forever after.
  function onResize(): void {
    render();
  }

  function render(): void {
    const step = TUTORIAL_STEPS[i]!;
    const target = step.target ? document.querySelector(step.target) : null;
    const rect = target instanceof HTMLElement ? target.getBoundingClientRect() : null;

    if (rect && rect.width > 0) {
      const pad = 6;
      highlight.style.display = "block";
      highlight.style.left = `${rect.left - pad}px`;
      highlight.style.top = `${rect.top - pad}px`;
      highlight.style.width = `${rect.width + pad * 2}px`;
      highlight.style.height = `${rect.height + pad * 2}px`;
    } else {
      highlight.style.display = "none";
    }

    const last = i === TUTORIAL_STEPS.length - 1;
    card.innerHTML =
      `<div class="tut-step">Step ${i + 1} of ${TUTORIAL_STEPS.length}</div>` +
      `<h3 class="tut-title"></h3>` +
      `<p class="tut-body"></p>` +
      `<div class="tut-actions">` +
      `<button class="tut-skip">Skip tour</button>` +
      `<button class="tut-next">${last ? "Start playing" : "Next →"}</button>` +
      `</div>`;
    // Text nodes (not innerHTML) so content can never inject markup.
    card.querySelector(".tut-title")!.textContent = step.title;
    card.querySelector(".tut-body")!.textContent = step.body;
    card.querySelector<HTMLButtonElement>(".tut-skip")!.onclick = finish;
    card.querySelector<HTMLButtonElement>(".tut-next")!.onclick = next;

    // Position the card near the target (below if room, else above), else centre.
    positionCard(rect);
  }

  function positionCard(rect: DOMRect | null): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Measure after content is set.
    const cw = card.offsetWidth || 320;
    const ch = card.offsetHeight || 160;
    if (!rect) {
      card.style.left = `${Math.round((vw - cw) / 2)}px`;
      card.style.top = `${Math.round((vh - ch) / 2)}px`;
      return;
    }
    let top = rect.bottom + 12;
    if (top + ch > vh - 8) top = Math.max(8, rect.top - ch - 12);
    let left = rect.left + rect.width / 2 - cw / 2;
    left = Math.max(8, Math.min(left, vw - cw - 8));
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  }

  function next(): void {
    if (i >= TUTORIAL_STEPS.length - 1) {
      finish();
      return;
    }
    i += 1;
    render();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      finish();
    } else if (e.key === "Enter" || e.key === "ArrowRight") {
      e.preventDefault();
      next();
    }
  }

  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  render();
}
