import type { ProjectConfig, WallSegment } from "@/types/db";
import { embedmentOpts, roundHeightUp } from "./calculations";

/* ============================================================
 * Auto-split a drawn wall into per-pricing-band sections.
 *
 * A wall's RL pairs are stations along its length; the wall's
 * height is their average. When some stations sit above a
 * pricing band edge (post size / quote rate boundary), pricing
 * the whole wall at the average under-prices the tall sections
 * and orders the wrong posts. Splitting by band reproduces what
 * the estimator would get by drawing one wall per band — without
 * having to draw them separately.
 *
 * Each RL pair represents an equal share of the wall's length
 * (the same assumption that makes avg-height × length the m²).
 * ============================================================ */

export interface WallSection {
  /** Fraction of the wall's length this section covers (RL-pair share). */
  share: number;
  /** Raw (un-rounded) average height of the section's RL pairs, metres. */
  heightM: number;
  /** How many RL stations landed in this section. */
  pairCount: number;
}

/** Pricing band edges (m): every boundary where the post size or the quote
 *  rate changes — the union of postSizeRanges and non-tier extra-over bands. */
export function pricingBandEdges(config: ProjectConfig): number[] {
  const edges = new Set<number>();
  for (const r of config.engineering.postSizeRanges) {
    if (r.heightMax > 0) edges.add(r.heightMax);
  }
  for (const b of config.extraOverBands) {
    if (/upper|lower/i.test(b.label)) continue;
    if (b.heightMin > 0) edges.add(b.heightMin);
    if (b.heightMax > 0) edges.add(b.heightMax);
  }
  return [...edges].sort((a, b) => a - b);
}

/** Pricing-convention band index: a height exactly on an edge belongs to the
 *  LOWER band — matching the quote's `> min && <= max` filter and the
 *  first-match post-size lookup. */
function pricingBandIndex(heightM: number, edges: number[]): number {
  for (let i = 0; i < edges.length; i++) {
    if (heightM <= edges[i]) return i;
  }
  return edges.length;
}

/**
 * Split a wall into pricing-band sections from its RL pairs. Returns null
 * when no split applies: a manual height override (the user took control),
 * fewer than two usable pairs, or all pairs in one band. Band membership is
 * decided on the ROUNDED pair height (the height the engine prices).
 */
export function splitSegmentSections(
  seg: Pick<WallSegment, "rl_pairs" | "height_override_mm">,
  config: ProjectConfig,
): WallSection[] | null {
  if (seg.height_override_mm != null) return null;
  const heights = (seg.rl_pairs ?? [])
    .map((p) => p.top - p.bottom)
    .filter((h) => Number.isFinite(h) && h > 0);
  if (heights.length < 2) return null;

  const edges = pricingBandEdges(config);
  if (edges.length === 0) return null;
  const round = embedmentOpts(config);

  const groups = new Map<number, number[]>();
  for (const h of heights) {
    const idx = pricingBandIndex(roundHeightUp(h, round), edges);
    const g = groups.get(idx) ?? [];
    g.push(h);
    groups.set(idx, g);
  }
  if (groups.size < 2) return null;

  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, hs]) => ({
      share: hs.length / heights.length,
      heightM: hs.reduce((s, h) => s + h, 0) / hs.length,
      pairCount: hs.length,
    }));
}

/** Expand segments into per-section pseudo-segments (length_mm/height_mm) so
 *  height-band summaries count each section in its own band, matching the
 *  quote and materials order. Unsplit walls pass through unchanged. */
export function expandSegmentsByPricingBands<
  T extends Pick<
    WallSegment,
    "rl_pairs" | "height_override_mm" | "length_mm" | "height_mm"
  >,
>(
  segments: T[],
  config: ProjectConfig,
): { length_mm: number | null; height_mm: number | null }[] {
  const out: { length_mm: number | null; height_mm: number | null }[] = [];
  for (const seg of segments) {
    const sections =
      seg.length_mm != null && seg.length_mm > 0
        ? splitSegmentSections(seg, config)
        : null;
    if (!sections) {
      out.push({ length_mm: seg.length_mm, height_mm: seg.height_mm });
      continue;
    }
    for (const s of sections) {
      out.push({
        length_mm: (seg.length_mm ?? 0) * s.share,
        height_mm: Math.round(s.heightM * 1000),
      });
    }
  }
  return out;
}
