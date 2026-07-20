/**
 * Event image registry. Files live in /public so the static client can serve
 * them without a backend or runtime fetch.
 */

export const EPOCH_EVENT_IMAGES: Record<string, string> = {
  black_death: "/event-art/plague-streets.jpg",
  herring_monopoly: "/event-art/trade-inspection.jpg",
  victual_brothers: "/event-art/storm-at-sea.jpg",
  great_fire: "/event-art/city-fire.jpg",
  novgorod_closed: "/event-art/novgorod-furs.jpg",
};

export const CHOICE_EVENT_IMAGES: Record<string, string> = {
  royal_wedding: "/event-art/league-diet.jpg",
  golden_jubilee: "/event-art/trade-inspection.jpg",
  mercenary_offer: "/event-art/kontor-embargo.jpg",
  expedition: "/event-art/storm-at-sea.jpg",
  envoy_exchange: "/event-art/league-diet.jpg",
  grain_aid: "/event-art/plague-streets.jpg",
  reinforce_walls: "/event-art/city-fire.jpg",
  sap_the_walls: "/event-art/city-fire.jpg",
  call_the_banners: "/event-art/kontor-embargo.jpg",
  forbidden_lore: "/event-art/league-diet.jpg",
  grand_academy: "/event-art/league-diet.jpg",
  monopoly_charter: "/event-art/trade-inspection.jpg",
  settling_season: "/event-art/novgorod-furs.jpg",
  public_works: "/event-art/trade-inspection.jpg",
};

export function epochEventImage(eventId: string): string | undefined {
  return EPOCH_EVENT_IMAGES[eventId];
}

export function choiceEventImage(eventId: string): string | null {
  return CHOICE_EVENT_IMAGES[eventId] ?? null;
}
