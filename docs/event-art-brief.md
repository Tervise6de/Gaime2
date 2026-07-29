# Event Illustration Registry

Event illustrations are now wired into the game through `src/data/eventArt.ts`.
The image files live under `public/event-art/`, so the static client can serve
them directly with no runtime fetch and no database dependency.

## Current Set

| File | Used for |
|---|---|
| `city-fire.jpg` | Great fire, wall, siege and conflict decisions |
| `kontor-embargo.jpg` | Embargo, mercenary and muster decisions |
| `storm-at-sea.jpg` | Pirates, risky expeditions and sea-lane danger |
| `league-diet.jpg` | Envoys, councils, marriages and scholarly decisions |
| `novgorod-furs.jpg` | Novgorod, eastern trade and settlement beats |
| `plague-streets.jpg` | Plague and emergency grain-relief beats |
| `trade-inspection.jpg` | Trade booms, monopolies and charters |

## Wanted

| Event | Wants | Standing in |
|---|---|---|
| `bay_salt` (Bay Salt, c. 1400) | A salt fleet putting in — sacks and heaps of coarse Atlantic salt coming ashore against a northern quay, Lüneburg's boiling-houses idle behind | `trade-inspection.jpg` |

## Adding More

Use landscape 16:9 images, no baked-in text, and keep the files local unless
events move to a server/CMS later. Add the image under `public/event-art/`, map
the event id in `src/data/eventArt.ts`, and let `src/data/eventArt.test.ts`
verify that the mapped file exists.

If future event content becomes editable from the database, keep the stable
default images in GitHub and let the DB optionally override the image path.
