/**
 * Historical "epoch" events (docs/hansa times.md §1, §9, §11) — the big, dated
 * beats of the Hanseatic age: plague, a fish monopoly won, pirates, a great fire,
 * a Kontor lost. A SEPARATE system from the bounded random events
 * (systems/events.ts): each is anchored to a real year but fires within a ±
 * window, with a chance it happens at all — so every game gets its own timeline
 * and no two share one, and nothing ever lands on the same turn twice.
 *
 * Serialisable content only — the effect is a *descriptor* (data); the logic that
 * applies it lives in systems/epochs.ts, keeping this table pure content so
 * balancing (which events, when, how likely, how hard) is editing this file.
 */

import { epochEventImage } from "@/data/eventArt";
import type { KontorId } from "@/data/kontore";

/** What an epoch event does when it fires (a data descriptor; logic in epochs.ts). */
export type EpochEffect =
  | { kind: "plague"; regions: number; popLoss: number; unrest: number }
  | { kind: "trade_boom"; goldPerRegion: number }
  | { kind: "pirates"; goldLoss: number; unrest: number }
  | { kind: "great_fire"; popLoss: number; materialsLoss: number; unrest: number }
  | { kind: "kontor_closed"; kontor: KontorId };

export interface EpochEventDef {
  id: string;
  name: string;
  /** Historical anchor year (hansa times.md). */
  year: number;
  /** ± jitter in years, so the event never fires at the same turn across games. */
  windowYears: number;
  /** Probability it happens at all this game (0..1) — "may or may not happen". */
  chance: number;
  /** What it does when it fires. */
  effect: EpochEffect;
  /** Flavour logged when it fires; "{place}" is filled with the affected region. */
  headline: string;
  /** Emoji motif used as the notification's glyph and image-placeholder icon. */
  icon: string;
  /** A short paragraph of real historical context, shown in the notification. */
  description: string;
  /**
   * Illustration for the notification (a path under /public or a data URI).
   * Undefined until art exists — the notification then shows an open placeholder.
   * The events still needing art are tracked in docs/event-art-brief.md.
   */
  image?: string;
}

/**
 * The historical timeline. Years and facts are from hansa times.md; the numbers
 * (window, chance, magnitude) are game-tuning. Ordered by year for readability;
 * scheduleEpochs (epochs.ts) re-sorts the *rolled* schedule by fire turn.
 */
export const EPOCH_EVENTS: readonly EpochEventDef[] = [
  {
    id: "black_death",
    name: "The Black Death",
    image: epochEventImage("black_death"),
    year: 1350, // reached the Hansa ports in 1350, by the very trade lanes (§11)
    windowYears: 10,
    chance: 0.85,
    effect: { kind: "plague", regions: 3, popLoss: 0.5, unrest: 12 },
    headline: "The Black Death arrives by ship — {place} and the great towns lose near half their people.",
    icon: "☠️",
    description:
      "The Black Death reaches the Hanseatic ports — carried, like everything else, up the very trade lanes that made the towns rich. Hamburg and Bremen lost more than half their people; councils, guilds and whole trades were gutted in a single summer.",
  },
  {
    id: "herring_monopoly",
    name: "The Herring Monopoly",
    image: epochEventImage("herring_monopoly"),
    year: 1370, // Peace of Stralsund gave a Baltic fish monopoly (§9)
    windowYears: 12,
    chance: 0.6,
    effect: { kind: "trade_boom", goldPerRegion: 3 },
    headline: "A monopoly on the Baltic fish trade is won — salted herring pours gold into every port.",
    icon: "🐟",
    description:
      "By the Peace of Stralsund the League wins a monopoly on the Baltic fish trade. Salted herring — preserved with Lüneburg's 'white gold' — is distributed across a Europe with no refrigeration, and the gold flows back to every port that handles it.",
  },
  {
    id: "victual_brothers",
    name: "The Victual Brothers",
    image: epochEventImage("victual_brothers"),
    year: 1395, // the Vitalienbrüder preyed on the sea-lanes c. 1390s–1400s (§9)
    windowYears: 15,
    chance: 0.6,
    effect: { kind: "pirates", goldLoss: 30, unrest: 4 },
    headline: "The Victual Brothers prey on the sea-lanes — a convoy off {place} is taken by pirates.",
    icon: "🏴‍☠️",
    description:
      "Privateers first hired in the Sweden–Denmark war, the Victual Brothers — the 'Likedeelers', or equal-sharers — turn to open piracy across the Baltic and North Sea, preying on merchant shipping until their bloody suppression at Hamburg around 1400.",
  },
  {
    id: "great_fire",
    name: "A Great Fire",
    image: epochEventImage("great_fire"),
    year: 1476, // the wooden Bryggen (Bergen) burned repeatedly (§4)
    windowYears: 40,
    chance: 0.55,
    effect: { kind: "great_fire", popLoss: 0.2, materialsLoss: 20, unrest: 6 },
    headline: "Fire tears through the crowded wharves of {place} — warehouses and homes are lost.",
    icon: "🔥",
    description:
      "The crowded, timber-built wharves of the Hansa — above all Bergen's Bryggen — burned again and again. A great fire could gut a town's warehouses and homes in a single night: the price of packing a port tight with wooden gable-houses.",
  },
  {
    id: "novgorod_closed",
    name: "The Peterhof Closed",
    image: epochEventImage("novgorod_closed"),
    year: 1494, // Ivan III shut the Novgorod Peterhof and deported its merchants (§9)
    windowYears: 12,
    chance: 0.7,
    effect: { kind: "kontor_closed", kontor: "novgorod" },
    headline: "Moscow shuts the Novgorod Peterhof and deports its merchants — the eastern trade collapses.",
    icon: "🚫",
    description:
      "Ivan III of Moscow shuts the Novgorod Peterhof and deports its German merchants to Moscow, to break the League's grip on Russian trade. The gateway to Russian furs and wax is gone — a structural blow to the whole eastern network.",
  },
];
