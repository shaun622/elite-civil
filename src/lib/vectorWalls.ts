import { supabase } from "@/lib/supabase";
import { loadPdf } from "@/lib/pdfRender";
import {
  extractPageVectors,
  measureWallRuns,
  pathOBB,
} from "@/lib/pdfVectors";

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
  /** Centreline polyline in raster-pixel coords: [x0,y0,x1,y1]. */
  polyline: number[];
  lengthMm: number;
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
    const polyline = [
      obb.cx - ux * hl,
      obb.cy - uy * hl,
      obb.cx + ux * hl,
      obb.cy + uy * hl,
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
      warnings: [
        "Lengths measured from PDF vector geometry. Wall heights are not yet populated — add them from the drawing's height labels.",
      ],
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
      label: `${wall.typeLabel} wall ${n}`,
      length_mm: Math.round(wall.lengthMm),
      height_mm: null,
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
