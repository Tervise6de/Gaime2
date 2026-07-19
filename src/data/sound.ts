/**
 * The Øresund Sound toll — trade as power (hansa times.md §11; docs/hansa-plan.md §6).
 *
 * Whoever holds Zealand (Copenhagen — Kronborg castle at Helsingør) commands the
 * narrows between the Baltic and the North Sea, and levies a toll on every Baltic
 * ship carrying goods west to the great markets (London, Bruges). It is the
 * League-vs-Denmark flashpoint made mechanical: a chokepoint you can *tax*, *close
 * to enemies*, or *seize* to free your own trade.
 *
 * The toll is decided by *endpoints*, not the route's drawn lane: a Baltic port's
 * goods bound for a western Kontor must pass the Sound; Atlantic ports (England,
 * Flanders, Norway, the North-Sea German towns, and the Danish straits themselves)
 * reach those markets without it, and Bergen/Novgorod trade never touches it.
 *
 * Serialisable content only — no logic, no DOM. Map-specific to the Hansa board
 * (the region ids below); other maps carry no Sound (`state.sound` stays absent).
 */

import type { KontorId } from "@/data/kontore";

export const SOUND = {
  /** Host region — Zealand/Copenhagen; its holder levies the toll. */
  regionId: 23,
  name: "The Øresund Sound",
  /** Default skim on a crossing route's income (a quarter — the historic order). */
  defaultRate: 0.25,
  /** Ceiling the holder may raise the toll to. */
  maxRate: 0.4,
  /**
   * Atlantic / North-Sea regions — reachable from the western Kontore WITHOUT
   * passing the Sound (England, Flanders, Norway, the North-Sea German ports, and
   * the Danish straits). A route whose source is *not* here is a Baltic port, and
   * pays the toll when bound for a western market.
   */
  westRegions: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 16, 23, 24, 25, 27, 28, 29, 30, 31, 32] as readonly number[],
  /** The western markets a Baltic ship reaches only by passing the Øresund. */
  tolledKontore: ["london", "bruges"] as KontorId[],
} as const;
