import { supabase } from "@/lib/supabase";
import { loadPdf } from "@/lib/pdfRender";
import {
  extractPageVectors,
  measureWallRuns,
  pathOBB,
  type VectorPath,
} from "@/lib/pdfVectors";
import type {
  AnalyzeHeightLabel,
  AnalyzeLot,
} from "@/lib/api/analyzeDrawing";

/**
 * Stage I of the vector pipeline: turn a PDF page's vector linework into
 * measured wall runs, and persist them as `wall_segments`.
 *
 * Vectors are extracted at the same DPI the page PNG was rasterised at, so
 * every coordinate is already in the review screen's pixel space — the
 * DrawingViewer overlay renders them with no transform.
 */

const RASTER_DPI = 200;
/** Vector extraction scale so coords match the stored 200-DPI PNG. */
export const VECTOR_SCALE = RASTER_DPI / 72;

export type WallColorSpec = {
  /** Lowercase hex, e.g. "#dd6e00". */
  color: string;
  /** Human label for this colour, e.g. "Type 1". */
  typeLabel: string;
};

export type MeasuredWall = {
  color: string;
  typeLabel: string;
  /** Centreline as [x,y] pixel pairs — [[x0,y0],[x1,y1]] in raster space. */
  polyline: [number, number][];
  lengthMm: number;
  /** Average wall height (mm), fused from the AI height labels — Stage II. */
  heightMm?: number | null;
  /** Lot the wall sits on, fused from the AI lot labels — Stage II. */
  lotName?: string | null;
};

export type ExtractWallsOptions = {
  wallColors: WallColorSpec[];
  /** Millimetres of real-world distance per device pixel (at VECTOR_SCALE). */
  mmPerPx: number;
  minPieceLengthM?: number;
  minThicknessM?: number;
  maxGapM?: number;
};

/** Extract + measure retaining walls from one PDF page's vector geometry. */
export async function extractWallsFromPdfPage(
  file: File | ArrayBuffer,
  pageNumber: number,
  opts: ExtractWallsOptions,
): Promise<MeasuredWall[]> {
  const data =
    file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const pdf = await loadPdf(data);
  const vectors = await extractPageVectors(pdf, pageNumber, VECTOR_SCALE);

  const { mmPerPx } = opts;
  const minLenPx = ((opts.minPieceLengthM ?? 1.5) * 1000) / mmPerPx;
  const minThickPx = ((opts.minThicknessM ?? 0.1) * 1000) / mmPerPx;
  const maxGapPx = ((opts.maxGapM ?? 5) * 1000) / mmPerPx;

  const typeByColor = new Map(
    opts.wallColors.map((w) => [w.color.toLowerCase(), w.typeLabel]),
  );
  const colors = new Set(typeByColor.keys());

  const runs = measureWallRuns(
    vectors.paths,
    colors,
    minLenPx,
    minThickPx,
    maxGapPx,
  );

  return runs.map((run) => {
    // Centreline = the run's whole-chain OBB long axis as a 2-point line.
    const allPoints: number[] = [];
    for (const p of run.paths) allPoints.push(...p.points);
    const obb = pathOBB(allPoints);
    const ux = Math.cos(obb.angle);
    const uy = Math.sin(obb.angle);
    const hl = obb.length / 2;
    // Two [x,y] pairs — the shape the review overlay + exports expect.
    const polyline: [number, number][] = [
      [obb.cx - ux * hl, obb.cy - uy * hl],
      [obb.cx + ux * hl, obb.cy + uy * hl],
    ];
    return {
      color: run.color.toLowerCase(),
      typeLabel: typeByColor.get(run.color.toLowerCase()) ?? "Wall",
      polyline,
      lengthMm: run.lengthPx * mmPerPx,
    };
  });
}

export type SaveVectorWallsResult = {
  extractionId: string;
  wallCount: number;
};

/**
 * Persist measured walls for a page: replaces any existing extraction with
 * a fresh `extractions` row + one `wall_segments` row per wall. Lengths come
 * from the vector geometry; heights/labels are left for the user (or the
 * Stage II AI pass) to fill in.
 */
export async function saveVectorWalls(opts: {
  drawingPageId: string;
  userId: string;
  walls: MeasuredWall[];
  scaleText: string | null;
  mmPerPx: number;
}): Promise<SaveVectorWallsResult> {
  const { drawingPageId, userId, walls, scaleText, mmPerPx } = opts;

  const withHeights = walls.filter((w) => w.heightMm != null).length;
  const warnings =
    withHeights > 0
      ? [
          `Lengths measured from PDF vector geometry. Heights auto-assigned from the drawing's labels for ${withHeights} of ${walls.length} walls — verify before quoting and fill any blanks.`,
        ]
      : [
          "Lengths measured from PDF vector geometry. Wall heights are not yet populated — add them from the drawing's height labels.",
        ];

  // Clear any prior extraction (cascade removes its wall_segments / dims).
  const { error: delErr } = await supabase
    .from("extractions")
    .delete()
    .eq("drawing_page_id", drawingPageId);
  if (delErr) throw delErr;

  const { data: extraction, error: extErr } = await supabase
    .from("extractions")
    .insert({
      drawing_page_id: drawingPageId,
      user_id: userId,
      raw_response: {
        source: "pdf-vectors",
        mm_per_px: mmPerPx,
        wall_count: walls.length,
      },
      scale_text: scaleText,
      units: "mm",
      view_type: "plan",
      overall_confidence: 0.9,
      warnings,
    })
    .select()
    .single();
  if (extErr || !extraction) {
    throw new Error(extErr?.message ?? "Failed to create extraction.");
  }

  // Number walls per type label: "Type 1 wall 1", "Type 1 wall 2", …
  const perType = new Map<string, number>();
  const segmentRows = walls.map((wall, i) => {
    const n = (perType.get(wall.typeLabel) ?? 0) + 1;
    perType.set(wall.typeLabel, n);
    return {
      extraction_id: extraction.id,
      user_id: userId,
      source_id: `vec_${i + 1}`,
      label: wall.lotName
        ? `Lot ${wall.lotName} — ${wall.typeLabel}`
        : `${wall.typeLabel} wall ${n}`,
      length_mm: Math.round(wall.lengthMm),
      height_mm: wall.heightMm ?? null,
      thickness_mm: null,
      polyline: wall.polyline,
      label_bbox: null,
      source_dimension_ids: [],
      confidence: 0.9,
      notes: `${wall.typeLabel} — length measured from PDF vector geometry.`,
      user_added: false,
    };
  });

  if (segmentRows.length > 0) {
    const { error: segErr } = await supabase
      .from("wall_segments")
      .insert(segmentRows);
    if (segErr) throw segErr;
  }

  await supabase
    .from("drawing_pages")
    .update({ extraction_status: "extracted", extraction_error: null })
    .eq("id", drawingPageId);

  return { extractionId: extraction.id, wallCount: walls.length };
}

/* ============================================================
 * Stage II fusion — attach AI-read semantics to measured walls.
 * ============================================================ */

/** Distinct stroke colours present in a page's vector linework (lowercased). */
export function distinctVectorColors(paths: VectorPath[]): string[] {
  const seen = new Set<string>();
  for (const p of paths) seen.add(p.color.toLowerCase());
  return [...seen];
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().toLowerCase().match(/^#?([0-9a-f]{6})$/);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Snap an AI-estimated wall colour to the nearest colour that actually
 * appears in the PDF's vector linework, so the measurement's exact-colour
 * filter has a real colour to match. Returns null if nothing is close.
 */
export function snapHexToColors(
  hex: string,
  palette: string[],
): string | null {
  const target = hexToRgb(hex);
  if (!target) return null;
  let best: string | null = null;
  let bestD = Infinity;
  for (const c of palette) {
    const rgb = hexToRgb(c);
    if (!rgb) continue;
    const d =
      (rgb[0] - target[0]) ** 2 +
      (rgb[1] - target[1]) ** 2 +
      (rgb[2] - target[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  // Reject a "nearest" that is not really the same colour (~80 per channel).
  return best && bestD <= 3 * 80 * 80 ? best : null;
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Shortest distance from a point to a wall's centreline polyline. */
function pointToWallDist(
  x: number,
  y: number,
  polyline: [number, number][],
): number {
  let best = Infinity;
  for (let i = 0; i + 1 < polyline.length; i++) {
    const d = distToSegment(
      x,
      y,
      polyline[i][0],
      polyline[i][1],
      polyline[i + 1][0],
      polyline[i + 1][1],
    );
    if (d < best) best = d;
  }
  return best;
}

function wallMidpoint(polyline: [number, number][]): [number, number] {
  if (polyline.length === 0) return [0, 0];
  const a = polyline[0];
  const b = polyline[polyline.length - 1];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * Attach AI-read semantics to measured walls: assign each height label to
 * its nearest wall (averaging where several fall on one wall) and name each
 * wall by its nearest lot. Best-effort — walls with nothing nearby keep a
 * null height and the default type label. A no-op when both lists are empty.
 */
export function fuseWallSemantics(
  walls: MeasuredWall[],
  heightLabels: AnalyzeHeightLabel[],
  lots: AnalyzeLot[],
  /** Max px from a wall for a height label to count as belonging to it. */
  maxHeightDistPx = 480,
): MeasuredWall[] {
  const heightAcc = walls.map(() => ({ sum: 0, count: 0 }));

  for (const h of heightLabels) {
    let bestIdx = -1;
    let bestD = Infinity;
    walls.forEach((w, i) => {
      const d = pointToWallDist(h.x, h.y, w.polyline);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0 && bestD <= maxHeightDistPx) {
      heightAcc[bestIdx].sum += h.value_m;
      heightAcc[bestIdx].count += 1;
    }
  }

  return walls.map((wall, i) => {
    const acc = heightAcc[i];
    const heightMm =
      acc.count > 0 ? Math.round((acc.sum / acc.count) * 1000) : null;

    let lotName: string | null = null;
    if (lots.length > 0) {
      const [mx, my] = wallMidpoint(wall.polyline);
      let bestD = Infinity;
      for (const lot of lots) {
        const d = (lot.x - mx) ** 2 + (lot.y - my) ** 2;
        if (d < bestD) {
          bestD = d;
          lotName = lot.name;
        }
      }
    }

    return { ...wall, heightMm, lotName };
  });
}
