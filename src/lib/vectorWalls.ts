import { supabase } from "@/lib/supabase";
import { loadPdf } from "@/lib/pdfRender";
import {
  extractPageVectors,
  measureWalls,
  type VectorPath,
} from "@/lib/pdfVectors";
import type { AnalyzeLot, AnalyzeRl } from "@/lib/api/analyzeDrawing";
import type { RlPair } from "@/types/db";

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

/**
 * mm of real-world distance per raster pixel for a drawing plotted at
 * 1:ratio. The page is rasterized at RASTER_DPI of the plotted sheet, so
 * one pixel spans (25.4 / RASTER_DPI) mm of paper × the scale ratio.
 */
export function mmPerPxFromScaleRatio(ratio: number): number {
  return (25.4 / RASTER_DPI) * ratio;
}

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
  /** Lot the wall sits on, fused from the AI lot labels — Stage II. */
  lotName?: string | null;
  /** RL pairs fused from the AI-read RLs — one per wall end. Stage II. */
  rlPairs?: RlPair[];
};

export type ExtractWallsOptions = {
  wallColors: WallColorSpec[];
  /** Millimetres of real-world distance per device pixel (at VECTOR_SCALE). */
  mmPerPx: number;
};

/**
 * Measure walls from a specific set of paths the user has hand-picked
 * on the canvas. Used by the "Pick walls one by one" mode on mono-
 * colour drawings where the colour filter can't distinguish walls
 * from contours / dimensions / boundaries.
 *
 * Each picked path's colour is treated as its own wall type; the
 * junction-aware grouping inside measureWalls still kicks in, so a
 * dashed wall the user picked one piece of (with run-expansion) comes
 * back as a single measured run.
 */
export function measurePickedWalls(opts: {
  vectors: import("@/lib/pdfVectors").PageVectors;
  pickedIndices: Set<number>;
  mmPerPx: number;
  typeLabel?: string;
}): MeasuredWall[] {
  const { vectors, pickedIndices, mmPerPx } = opts;
  if (pickedIndices.size === 0) return [];
  const typeLabel = opts.typeLabel ?? "Manual selection";

  const subset = vectors.paths.filter((_, i) => pickedIndices.has(i));
  const colors = new Set(subset.map((p) => p.color.toLowerCase()));
  // Lower min-length here than the colour-driven extractor because the
  // user has explicitly chosen each path — they know it's a wall, no
  // need to drop short ones as likely-noise.
  const runs = measureWalls(subset, colors, { minRunLengthPx: 1 });

  return runs.map((run) => ({
    color: run.color.toLowerCase(),
    typeLabel,
    polyline: flatToPairs(run.polyline),
    lengthMm: run.lengthPx * mmPerPx,
  }));
}

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
  const typeByColor = new Map(
    opts.wallColors.map((w) => [w.color.toLowerCase(), w.typeLabel]),
  );
  const colors = new Set(typeByColor.keys());

  // Drop runs shorter than half a metre — real retaining walls are always
  // much longer, and small same-colour features (orange height brackets,
  // arrowheads near RLs) produce dot-like junk runs otherwise.
  const runs = measureWalls(vectors.paths, colors, {
    minRunLengthPx: 500 / mmPerPx,
  });

  return runs.map((run) => ({
    color: run.color.toLowerCase(),
    typeLabel: typeByColor.get(run.color.toLowerCase()) ?? "Wall",
    polyline: flatToPairs(run.polyline),
    lengthMm: run.lengthPx * mmPerPx,
  }));
}

/** Flat [x0,y0,x1,y1,...] → [x,y] pairs. */
function flatToPairs(flat: number[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let k = 0; k + 1 < flat.length; k += 2) {
    pairs.push([flat[k], flat[k + 1]]);
  }
  return pairs;
}

export type SaveVectorWallsResult = {
  extractionId: string;
  wallCount: number;
};

/** Average wall height (mm) from RL pairs — null when there are none. */
function rlPairsAvgHeightMm(pairs: RlPair[] | undefined): number | null {
  if (!pairs || pairs.length === 0) return null;
  const sum = pairs.reduce((s, p) => s + (p.top - p.bottom), 0);
  return Math.round((sum / pairs.length) * 1000);
}

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

  const withRls = walls.filter((w) => (w.rlPairs?.length ?? 0) > 0).length;
  const warnings =
    withRls > 0
      ? [
          `Lengths measured from PDF vector geometry. Top/Bottom RLs were auto-read from the drawing for ${withRls} of ${walls.length} walls — verify each wall's RLs before quoting.`,
        ]
      : [
          "Lengths measured from PDF vector geometry. Enter Top RL and Bottom RL for each wall to set its height.",
        ];

  // Walk drawing_page -> drawing to find the owning project. New
  // wall_segments rows carry `project_id` so the project-wide Take Off
  // query picks them up alongside any manually-entered walls.
  const { data: pageRow, error: pageErr } = await supabase
    .from("drawing_pages")
    .select("drawing_id, drawings!inner(project_id)")
    .eq("id", drawingPageId)
    .maybeSingle();
  if (pageErr || !pageRow) {
    throw new Error(pageErr?.message ?? "Owning drawing not found.");
  }
  const projectId =
    (pageRow as { drawings?: { project_id?: string | null } }).drawings
      ?.project_id ?? null;

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
      project_id: projectId,
      user_id: userId,
      source_id: `vec_${i + 1}`,
      label: wall.lotName
        ? `Lot ${wall.lotName} — ${wall.typeLabel}`
        : `${wall.typeLabel} wall ${n}`,
      length_mm: Math.round(wall.lengthMm),
      height_mm: rlPairsAvgHeightMm(wall.rlPairs),
      thickness_mm: null,
      rl_pairs: wall.rlPairs ?? [],
      polyline: wall.polyline,
      label_bbox: null,
      source_dimension_ids: [],
      confidence: 0.9,
      notes: `${wall.typeLabel} — length measured from PDF vector geometry.`,
      user_added: false,
      // Map the AI-read lot label onto the BE Landscapes `lot` column
      // so it shows up immediately in the Take Off table. Wall type /
      // design / position stay null — they take the engine's defaults
      // until the user picks each per wall.
      lot: wall.lotName ?? null,
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

function wallMidpoint(polyline: [number, number][]): [number, number] {
  if (polyline.length === 0) return [0, 0];
  const a = polyline[0];
  const b = polyline[polyline.length - 1];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * Attach AI-read semantics to measured walls: name each wall by its nearest
 * lot, and pair the two RLs flanking each wall end into the wall's RL pairs
 * (top = the higher level, bottom = the lower). Best-effort — walls with
 * nothing nearby keep their default label and no RL pairs.
 */
export function fuseWallSemantics(
  walls: MeasuredWall[],
  lots: AnalyzeLot[],
  // RLs are intentionally NOT auto-paired onto walls — guessing which two
  // levels belong to each wall end mis-assigned them too often. Walls arrive
  // with empty RLs; the user fills each one with the "Grab RLs" marquee on
  // the Review page. Kept in the signature so callers don't change.
  _rls: AnalyzeRl[],
): MeasuredWall[] {
  return walls.map((wall) => {
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
    return { ...wall, lotName, rlPairs: [] };
  });
}
