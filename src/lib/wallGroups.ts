/* ============================================================
 * Lot grouping — shared by the Review list and the Take Off table
 * so both show walls in the same grouped order.
 *
 * A "group" is simply a distinct `lot` value. Callers pass walls
 * ALREADY ordered by sort_order (that's how the queries return
 * them), so grouping just buckets them preserving first-seen
 * order: a group lands at the position of its earliest-sorted
 * wall, and walls within a group stay in sort_order. Walls of the
 * same lot are kept together even if another lot's wall sorts
 * between them.
 * ============================================================ */

/** The placeholder key for walls with no lot set yet. */
export const UNGROUPED_KEY = "__ungrouped__";

export type WallGroup<T> = {
  /** The lot name, or null for the ungrouped bucket. */
  lot: string | null;
  /** Stable key for React lists / dnd containers. */
  key: string;
  walls: T[];
};

function normaliseLot(lot: string | null | undefined): string | null {
  const t = lot?.trim();
  return t ? t : null;
}

/**
 * Bucket pre-sorted items into lot groups, preserving order. `getLot`
 * pulls the lot off each item (a WallSegment, or a Take Off row).
 */
export function groupByLot<T>(
  items: T[],
  getLot: (item: T) => string | null,
): WallGroup<T>[] {
  const groups: WallGroup<T>[] = [];
  const byKey = new Map<string, WallGroup<T>>();
  for (const item of items) {
    const lot = normaliseLot(getLot(item));
    const key = lot ?? UNGROUPED_KEY;
    let g = byKey.get(key);
    if (!g) {
      g = { lot, key, walls: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.walls.push(item);
  }
  return groups;
}
