import type { ProjectConfig, WallSegment } from "@/types/db";
import { roundHeightUp } from "./calculations";

/** Default band edges (m) — the typical job split: 0–1.6, 1.6–3.0, 3.0+. */
export const DEFAULT_HEIGHT_BAND_EDGES = [1.6, 3.0];

export interface HeightBand {
  label: string;
  count: number;
  lengthMm: number;
  areaM2: number;
}

export interface HeightBandSummaryResult {
  bands: HeightBand[];
  noHeight: { count: number; lengthMm: number };
  totals: { count: number; lengthMm: number; areaM2: number };
}

/** Positive, de-duplicated, ascending band edges. */
export function normalizeBandEdges(values: number[]): number[] {
  const clean = values.filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(clean)].sort((a, b) => a - b);
}

/** The project's configured band edges, or the sensible default split. */
export function resolveBandEdges(
  config: ProjectConfig | null | undefined,
): number[] {
  const raw = config?.heightBandEdges;
  if (Array.isArray(raw)) {
    const norm = normalizeBandEdges(raw);
    if (norm.length) return norm;
  }
  return [...DEFAULT_HEIGHT_BAND_EDGES];
}

export function sameEdges(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Index of the band a height (m) falls in: (0,e0], (e0,e1], … , (eLast,∞).
 *  A height exactly on an edge belongs to the LOWER band — the same rule the
 *  quote (`> min && <= max`) and the post-size lookup use, so the band
 *  summaries here always classify a wall the way it's priced. */
function bandIndex(heightM: number, edges: number[]): number {
  for (let i = 0; i < edges.length; i++) {
    if (heightM <= edges[i]) return i;
  }
  return edges.length;
}

export function bandLabel(i: number, edges: number[]): string {
  if (edges.length === 0) return "All heights";
  const lo = i === 0 ? 0 : edges[i - 1];
  if (i >= edges.length) return `${lo} m +`;
  return `${lo} – ${edges[i]} m`;
}

/**
 * Wall count, linear length and face area totalled per height band. Heights
 * are rounded with the same embedment round-up the engine uses (roundOpts) so
 * the area agrees with Take Off's "Eng m²". Shared by the Review summary and
 * the project Dashboard so both always show identical bands.
 */
export function computeHeightBands(
  segments: readonly Pick<WallSegment, "length_mm" | "height_mm">[],
  edges: number[],
  roundOpts: { enabled: boolean; incrementM: number },
): HeightBandSummaryResult {
  const bands: HeightBand[] = Array.from(
    { length: edges.length + 1 },
    (_, i) => ({
      label: bandLabel(i, edges),
      count: 0,
      lengthMm: 0,
      areaM2: 0,
    }),
  );
  const noHeight = { count: 0, lengthMm: 0 };

  for (const seg of segments) {
    const lengthMm = seg.length_mm ?? 0;
    if (seg.height_mm == null) {
      noHeight.count += 1;
      noHeight.lengthMm += lengthMm;
      continue;
    }
    const heightM = roundHeightUp(seg.height_mm / 1000, roundOpts);
    const band = bands[bandIndex(heightM, edges)];
    band.count += 1;
    band.lengthMm += lengthMm;
    band.areaM2 += (lengthMm / 1000) * heightM;
  }

  const totals = {
    count: bands.reduce((s, b) => s + b.count, 0) + noHeight.count,
    lengthMm: bands.reduce((s, b) => s + b.lengthMm, 0) + noHeight.lengthMm,
    areaM2: bands.reduce((s, b) => s + b.areaM2, 0),
  };
  return { bands, noHeight, totals };
}
