/** Browser fullscreen helpers. Requires a direct user gesture to enter. */

export function fullscreenAvailable(): boolean {
  return typeof document !== "undefined" && document.fullscreenEnabled;
}

export function isFullscreen(): boolean {
  return typeof document !== "undefined" && document.fullscreenElement !== null;
}

export async function toggleFullscreen(target: HTMLElement = document.documentElement): Promise<boolean> {
  if (!fullscreenAvailable()) return false;
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return false;
  }
  await target.requestFullscreen({ navigationUI: "hide" });
  return true;
}
