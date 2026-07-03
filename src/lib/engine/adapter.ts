/* ============================================================
 * Adapter between the DB row shape (`WallSegment`) and the
 * engine's input shape (`WallEntry`). The BE Landscapes engine
 * works in metres and assumes every wall has a lot label, wall
 * type, design, and position. Our DB stores measurements in
 * millimetres and lets the estimator fields be null until the
 * user fills them in on the Take Off table.
 *
 * `segmentToEntry` is permissive: it accepts partly-filled rows
 * (e.g. a freshly-measured wall with no lot yet) by substituting
 * conservative defaults. `calculateBundle` is the single high-
 * level entry the pages should call — it converts, validates,
 * skips unusable rows, and runs every downstream calculation.
 * ============================================================ */

import type { Project, ProjectConfig, WallSegment } from "@/types/db";
import { defaultConfig } from "./defaults";
import { splitSegmentSections } from "./wallSections";
import {
  calculateAllWalls,
  calculateCostBreakdown,
  generateCostBreakdownDetail,
  generateMaterialsOrder,
  generateQuotationLines,
  getUniqueLotCount,
} from "./calculations";
import type {
  CostBreakdown,
  CostBreakdownDetail,
  MaterialsOrder,
  QuotationLineItem,
  WallCalculated,
  WallEntry,
} from "./types";

/**
 * Convert a DB `WallSegment` row to a `WallEntry` the engine can
 * consume. Returns `null` if the row is missing the geometry the
 * engine needs (length or height) — those rows are silently
 * skipped by the higher-level helpers.
 *
 * Defaults applied when estimator fields are still null:
 *   - lot: "" (engine still totals it, just under the blank lot)
 *   - wallType: "Single"
 *   - wallDesign: "Super Sleeper"
 *   - position: "Left"
 */
export function segmentToEntry(seg: WallSegment): WallEntry | null {
  if (seg.length_mm == null || seg.height_mm == null) return null;
  if (seg.length_mm <= 0 || seg.height_mm <= 0) return null;

  return {
    id: seg.id,
    sourceId: seg.id,
    lot: seg.lot ?? "",
    type: seg.wall_type ?? "Single",
    wallDesign: seg.wall_design ?? "Super Sleeper",
    position: seg.position ?? "Left",
    lengthLM: seg.length_mm / 1000,
    height: seg.height_mm / 1000,
  };
}

/**
 * Convert many segments at once, dropping any that can't be used.
 *
 * A wall whose RL stations span a pricing band edge is auto-split into one
 * entry per band (length apportioned by RL-pair share, height = that band's
 * RL average) — the same result as drawing one wall per band, so posts and
 * quote rates match the tall sections instead of the whole-wall average.
 */
export function segmentsToEntries(
  segments: WallSegment[],
  config: ProjectConfig,
): WallEntry[] {
  const entries: WallEntry[] = [];
  for (const seg of segments) {
    const entry = segmentToEntry(seg);
    if (!entry) continue;
    const sections = splitSegmentSections(seg, config);
    if (!sections) {
      entries.push(entry);
      continue;
    }
    sections.forEach((s, i) => {
      entries.push({
        ...entry,
        id: `${seg.id}::s${i}`,
        lengthLM: entry.lengthLM * s.share,
        height: s.heightM,
      });
    });
  }
  return entries;
}

/**
 * Return the effective project config — the project's own config
 * if it has one, otherwise the BE Landscapes baseline defaults.
 * Pass a project or `null` (e.g. before it loads).
 */
export function getEffectiveConfig(
  project: Pick<Project, "config"> | null | undefined,
): ProjectConfig {
  return project?.config ?? defaultConfig;
}

/**
 * Everything-at-once helper for the estimator pages: takes the
 * raw DB rows + project, returns the engine-calculated walls,
 * cost breakdown, quotation lines, and materials order.
 *
 * Pages that need just one piece (e.g. Take Off only needs
 * `calculatedWalls`) can still call this — the extra work is
 * cheap and keeps every page reading from a consistent view.
 */
export interface EngineBundle {
  config: ProjectConfig;
  entries: WallEntry[];
  calculatedWalls: WallCalculated[];
  costBreakdown: CostBreakdown;
  costBreakdownDetail: CostBreakdownDetail;
  quotationLines: QuotationLineItem[];
  materialsOrder: MaterialsOrder;
  uniqueLotCount: number;
}

export function calculateBundle(
  segments: WallSegment[],
  project: Pick<Project, "config" | "cost_overrides"> | null | undefined,
): EngineBundle {
  const config = getEffectiveConfig(project);
  const entries = segmentsToEntries(segments, config);
  const overrides = project?.cost_overrides ?? {};
  const calculatedWalls = calculateAllWalls(entries, config);
  const costBreakdown = calculateCostBreakdown(entries, config, overrides);
  const costBreakdownDetail = generateCostBreakdownDetail(
    entries,
    config,
    overrides,
  );
  const quotationLines = generateQuotationLines(entries, config, overrides);
  const materialsOrder = generateMaterialsOrder(entries, config);
  const uniqueLotCount = getUniqueLotCount(entries);

  return {
    config,
    entries,
    calculatedWalls,
    costBreakdown,
    costBreakdownDetail,
    quotationLines,
    materialsOrder,
    uniqueLotCount,
  };
}
