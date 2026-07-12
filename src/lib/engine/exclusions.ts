/* ============================================================
 * Include / exclude toggles for the costing pipeline.
 *
 * A toggled-off item is stored as a sentinel key (value 1) in the existing
 * `projects.cost_overrides` map (Record<string, number>), so there is no new
 * DB column and it flows through normalize() untouched. Four key shapes:
 *
 *   exclude:<costLineId>              one Cost Breakdown line off
 *   exclude:cat:<CostCategory>       a whole Cost Breakdown category off
 *                                    (cost + quote only; does NOT empty the
 *                                    Materials Order)
 *   exclude:mat:<MaterialCategory>   a feature off EVERYWHERE (written by both
 *                                    the P&P card toggle and the Materials
 *                                    category toggle: one key, one truth)
 *   exclude:mat:<MaterialCategory>:<description>
 *                                    one Materials line off (order only; used
 *                                    where there is no 1:1 cost line: steel
 *                                    size rows and wedges)
 *
 * Cost line ids never contain ":" so parsing after the prefix is unambiguous.
 * The same `cost_overrides` map also holds bare `<costLineId>` qty overrides
 * and `quote_rate:`/`quote_qty:` quote numerics; the predicates below tell the
 * three conventions apart.
 * ============================================================ */

import type { CostCategory, CostOverrides, MaterialCategory } from "./types";

export const EXCLUDE_PREFIX = "exclude:";
export const QUOTE_PREFIXES = ["quote_rate:", "quote_qty:"] as const;

export const excludeLineKey = (costLineId: string) =>
  `${EXCLUDE_PREFIX}${costLineId}`;
export const excludeCatKey = (cat: CostCategory) =>
  `${EXCLUDE_PREFIX}cat:${cat}`;
export const excludeMatKey = (cat: MaterialCategory) =>
  `${EXCLUDE_PREFIX}mat:${cat}`;
export const excludeMatLineKey = (cat: MaterialCategory, description: string) =>
  `${EXCLUDE_PREFIX}mat:${cat}:${description}`;

export const isExcludeKey = (k: string) => k.startsWith(EXCLUDE_PREFIX);
export const isQuoteKey = (k: string) =>
  QUOTE_PREFIXES.some((p) => k.startsWith(p));
/** A bare cost-line qty override: not an exclusion and not a quote numeric. */
export const isQtyOverrideKey = (k: string) => !isExcludeKey(k) && !isQuoteKey(k);

/** The Materials category a cost line represents, so a feature toggle
 *  (`exclude:mat:<cat>`) reaches every cost line for that material. Labour /
 *  hour lines are intentionally absent (a material toggle keeps labour). */
export function materialCategoryForCostLine(
  id: string,
): MaterialCategory | null {
  if (id === "post-concrete") return "Concrete";
  if (id.startsWith("post-steel-")) return "Steel";
  if (id === "other-brackets-material" || id === "other-brackets-labour")
    return "Fence Brackets";
  if (
    id === "build-super-sleepers" ||
    id === "build-super-supports" ||
    id === "build-concrete-sleepers"
  )
    return "Sleepers";
  if (id === "backfill-geo1m" || id === "backfill-geo2m") return "Geofabric";
  if (id === "backfill-agline") return "Ag Line";
  if (id === "backfill-gravel") return "Gravel";
  return null;
}

/** The single cost line a Materials line is 1:1 with, or null when there is no
 *  clean pair (steel size rows, wedges, and fence brackets which map to two
 *  cost lines and so use the category key instead). Prefers the stable
 *  `pairedCostId` set at generation; the description switch is a back-compat
 *  fallback for lines built without it. */
export function pairedCostLineId(line: {
  category: string;
  description: string;
  pairedCostId?: string;
}): string | null {
  if (line.pairedCostId) return line.pairedCostId;
  switch (line.category) {
    case "Concrete":
      return "post-concrete";
    case "Ag Line":
      return "backfill-agline";
    case "Gravel":
      return "backfill-gravel";
    case "Sleepers":
      if (line.description.includes("Super Sleeper")) return "build-super-sleepers";
      if (line.description.includes("Super Support")) return "build-super-supports";
      if (line.description.includes("Concrete Sleeper"))
        return "build-concrete-sleepers";
      return null; // Wedges
    case "Geofabric":
      return line.description.includes("0.9")
        ? "backfill-geo1m"
        : "backfill-geo2m";
    default:
      return null; // Steel, Fence Brackets
  }
}

/** The canonical exclusion key a Materials-line checkbox writes: the paired
 *  cost line's key where one exists (so Cost and Materials pages agree), the
 *  Fence Brackets feature key (two cost lines), else an order-only line key. */
export function materialLineExclusionKey(line: {
  category: MaterialCategory;
  description: string;
  pairedCostId?: string;
}): string {
  const paired = pairedCostLineId(line);
  if (paired) return excludeLineKey(paired);
  if (line.category === "Fence Brackets") return excludeMatKey("Fence Brackets");
  return excludeMatLineKey(line.category, line.description);
}

/** Is this Cost Breakdown line excluded: by its own key, its category box, or
 *  the feature (material category) it belongs to. */
export function isCostLineExcluded(
  ov: CostOverrides,
  line: { id: string; category: CostCategory },
): boolean {
  if (ov[excludeLineKey(line.id)]) return true;
  if (ov[excludeCatKey(line.category)]) return true;
  const mat = materialCategoryForCostLine(line.id);
  if (mat && ov[excludeMatKey(mat)]) return true;
  return false;
}

/** Is this Materials line excluded: by its feature/category, or by its own
 *  canonical key (which, for paired lines, is the cost line's key, so a Cost
 *  page exclusion shows here too). Cost-only category boxes do not apply. */
export function isMaterialLineExcluded(
  ov: CostOverrides,
  line: { category: MaterialCategory; description: string; pairedCostId?: string },
): boolean {
  if (ov[excludeMatKey(line.category)]) return true;
  if (ov[materialLineExclusionKey(line)]) return true;
  return false;
}
