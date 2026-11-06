/**
 * Target index for the dragged row: how many of the other rows have their
 * midpoint above the pointer. Pass it to `moveGameTo` as `to`.
 */
export function dropIndex(
  midpoints: number[],
  y: number,
  from: number,
): number {
  const above = midpoints.filter((m, i) => i !== from && m < y).length;
  return Math.max(0, Math.min(above, midpoints.length - 1));
}
