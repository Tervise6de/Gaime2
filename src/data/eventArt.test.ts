import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHOICE_EVENT_IDS } from "@/systems/events";
import { EPOCH_EVENTS } from "@/data/epochEvents";
import { choiceEventImage } from "@/data/eventArt";

function expectPublicAsset(path: string | undefined | null): void {
  expect(path).toBeTruthy();
  expect(path?.startsWith("/")).toBe(true);
  expect(path).not.toMatch(/^https?:|^data:|\\/);
  expect(existsSync(join(process.cwd(), "public", path!.slice(1)))).toBe(true);
}

describe("event art registry", () => {
  it("gives every historical epoch event a local illustration", () => {
    for (const event of EPOCH_EVENTS) {
      expectPublicAsset(event.image);
    }
  });

  it("gives every choice event a local illustration", () => {
    for (const id of CHOICE_EVENT_IDS) {
      expectPublicAsset(choiceEventImage(id));
    }
  });
});
