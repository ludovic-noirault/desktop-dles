export const DEFAULT_SIDEBAR_WIDTH = 220;
export const MIN_SIDEBAR_WIDTH = 180;

export function clampSidebarWidth(width: number, windowWidth: number): number {
  const max = Math.max(MIN_SIDEBAR_WIDTH, Math.floor(windowWidth / 2));
  return Math.min(max, Math.max(MIN_SIDEBAR_WIDTH, width));
}
