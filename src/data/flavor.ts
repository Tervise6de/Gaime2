/**
 * Flavour text — deterministic variety for the most repetitive player-facing
 * lines (war, peace, trade, assaults). Purely presentational: these strings feed
 * the turn `log`, never a state transition, so varying them cannot change the
 * simulation.
 *
 * Determinism (docs/game-design.md §7): variety is chosen by hashing a few
 * *stable* keys (seed, turn, the ids involved) rather than by drawing from the
 * seeded RNG. This keeps the same event on the same turn always phrased the same
 * way (reproducible, testable) **and** avoids consuming the RNG stream — a stray
 * `rng.next()` on the log path would shift every downstream combat/AI roll and
 * break seed-based tests. A pure hash gives replayable variety for free.
 *
 * The string tables are data (editable content); `pickVariant`/`fill` are the
 * tiny pure helpers that read them, mirroring how `data/palette.ts` and
 * `data/art.ts` already colocate pure helpers with their tables.
 */

/** FNV-1a over the joined keys → a 32-bit unsigned hash. Pure, stable. */
function hashKeys(keys: ReadonlyArray<string | number>): number {
  let h = 0x811c9dc5;
  const s = keys.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Pick one variant deterministically from `keys`. The same keys always yield the
 * same choice; different keys spread across the table. Empty table → "".
 */
export function pickVariant(variants: readonly string[], ...keys: Array<string | number>): string {
  if (variants.length === 0) return "";
  return variants[hashKeys(keys) % variants.length]!;
}

/** Fill `{name}` placeholders in a template from `vars` (missing keys kept verbatim). */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Convenience: pick a variant and fill it in one call. */
export function flavor(
  variants: readonly string[],
  vars: Record<string, string | number>,
  ...keys: Array<string | number>
): string {
  return fill(pickVariant(variants, ...keys), vars);
}

// --- Diplomacy ---------------------------------------------------------------

/** {a} declares war on {b}. */
export const WAR_DECLARED: readonly string[] = [
  "{a} declared war on {b}!",
  "{a} raises its banners against {b} — war!",
  "Heralds proclaim {a}'s war upon {b}!",
  "{a} takes up the sword against {b}!",
  "War! {a} marches against {b}.",
];

/** {a} and {b} make peace. */
export const PEACE_MADE: readonly string[] = [
  "{a} and {b} made peace.",
  "{a} and {b} lay down their arms — peace at last.",
  "{a} and {b} sign a peace.",
  "The war between {a} and {b} ends in peace.",
  "{a} and {b} sheathe their swords.",
];

/** {a} and {b} open a trade route. */
export const TRADE_OPENED: readonly string[] = [
  "{a} and {b} opened a trade route.",
  "Caravans link {a} and {b} — a trade route opens.",
  "{a} and {b} strike a trade accord.",
  "Merchants of {a} and {b} open the roads to commerce.",
  "A trade route now binds {a} and {b}.",
];

// --- Combat (the verb clause; callers keep the "(losses X vs Y)" tally) -------

/** Attacker won but did not capture — {atk} at {region}. */
export const ASSAULT_WON: readonly string[] = [
  "{atk} won at {region}",
  "{atk} carried the field at {region}",
  "{atk} broke the defenders of {region}",
  "{atk} prevailed at {region}",
];

/** Attacker won and captured — the flourish appended after the region name. */
export const CAPTURE_TAG: readonly string[] = [
  "{region} captured!",
  "{region} falls!",
  "{region} is taken!",
  "{region} is stormed and taken!",
];

/** Attacker was repelled — {atk} at {region}. */
export const ASSAULT_REPELLED: readonly string[] = [
  "{atk} was repelled at {region}",
  "{atk} was thrown back from {region}",
  "{atk}'s assault on {region} was broken",
  "{atk} faltered before the walls of {region}",
];

// --- Turn-summary headline (a one-line chronicle above the itemised diff) -----

/** Openers for a headline that then lists the turn's events. {turn} available. */
export const CHRONICLE_LEAD: readonly string[] = [
  "This turn",
  "The realm stirs",
  "Word from the court",
  "As the season turns",
  "From the chronicles",
];

/** Said when a turn passed without notable events. */
export const QUIET_TURN: readonly string[] = [
  "A quiet turn — the realm goes about its business.",
  "Little of note this turn; the ledgers tick over.",
  "A calm turn passes over the realm.",
  "Nothing stirs the court this turn.",
];
