# Event Illustration Brief

> **What this is.** The historical **epoch events** (`data/epochEvents.ts`) show a
> notification card when they fire, with an **illustration slot**. None have art
> yet, so every card currently shows an **open placeholder** ("Illustration
> coming"). This file lists the events that need a picture and what each should
> depict, so art can be dropped in one event at a time.
>
> **Format.** Landscape **16:9**, ~**880×495** (the card is 480 px wide; 2× for
> crisp displays). Warm, painterly, low-detail — matching the game's Brick-Gothic /
> Hanseatic look. No text baked into the image.
>
> **How to wire one in.** Drop the file under `public/events/<id>.jpg` (or use a
> data URI) and set `image: "/events/<id>.jpg"` on that event in
> `data/epochEvents.ts`. The card swaps the placeholder for the image
> automatically — no code change. Remove the row below once done.

---

## Events needing a picture

| # | Event `id` | Name · year | Illustration to depict |
|---|------------|-------------|------------------------|
| 1 | `black_death` | **The Black Death** · 1350 | A plague-struck Hanseatic port: gabled brick houses under a sick sky, a cart of the dead, a near-empty quay. Grim, muted. |
| 2 | `herring_monopoly` | **The Herring Monopoly** · 1370 | A wharf heaped with barrels of salted herring; cogs unloading; coins changing hands. Prosperous, bustling, warm light. |
| 3 | `victual_brothers` | **The Victual Brothers** · 1395 | Pirates in a small craft closing on a laden merchant cog on a grey Baltic; a black flag, drawn blades. Tense. |
| 4 | `great_fire` | **A Great Fire** · 1476 | Night fire tearing through timber wharf-houses (Bergen's Bryggen); silhouettes with buckets against orange flame and smoke. |
| 5 | `novgorod_closed` | **The Peterhof Closed** · 1494 | The Novgorod Kontor's gates barred by Muscovite guards; German merchants turned away with their bundles. Cold, final. |

*(As more epoch events are added to `data/epochEvents.ts`, add a row here so the
art backlog stays complete.)*

---

## Notes

- The placeholder is a **deliberate open slot**, not an error — a dashed gold
  frame with the event's emoji and "Illustration coming". Shipping without art is
  fine; pictures can land incrementally.
- Players can silence these cards entirely (the card's **"Don't show event notices
  again"** toggle, or **Options → Gameplay → Show historical event notices**); the
  events still fire and log regardless.
