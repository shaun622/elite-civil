import { supabase } from "@/lib/supabase";
import type {
  DimensionLabel,
  DrawingPage,
  Extraction,
  ExtractionBundle,
  WallSegment,
  WallSegmentUpdate,
} from "@/types/db";

export async function loadExtractionBundle(
  drawingPageId: string,
): Promise<ExtractionBundle> {
  const { data: page, error: pageErr } = await supabase
    .from("drawing_pages")
    .select("*")
    .eq("id", drawingPageId)
    .single();
  if (pageErr || !page) {
    throw new Error(pageErr?.message ?? "Drawing page not found.");
  }

  const { data: extraction, error: extErr } = await supabase
    .from("extractions")
    .select("*")
    .eq("drawing_page_id", drawingPageId)
    .maybeSingle();
  if (extErr) throw extErr;
  if (!extraction) {
    throw new Error(
      "No extraction yet for this page. Run extraction from the project page first.",
    );
  }

  const [{ data: segments, error: segErr }, { data: dims, error: dimErr }] =
    await Promise.all([
      supabase
        .from("wall_segments")
        .select("*")
        .eq("extraction_id", extraction.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("dimension_labels")
        .select("*")
        .eq("extraction_id", extraction.id)
        .order("created_at", { ascending: true }),
    ]);
  if (segErr) throw segErr;
  if (dimErr) throw dimErr;

  return {
    page: page as DrawingPage,
    extraction: extraction as Extraction,
    segments: (segments ?? []) as WallSegment[],
    dimensions: (dims ?? []) as DimensionLabel[],
  };
}

function normalizeUpdate(patch: WallSegmentUpdate): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === "string") {
      const trimmed = v.trim();
      out[k] = trimmed.length === 0 ? null : trimmed;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function updateWallSegment(
  segment: WallSegment,
  patch: WallSegmentUpdate,
): Promise<WallSegment> {
  const originalValues = segment.user_edited
    ? (segment.original_values ?? null)
    : {
        label: segment.label,
        length_mm: segment.length_mm,
        height_mm: segment.height_mm,
        thickness_mm: segment.thickness_mm,
        notes: segment.notes,
      };

  const { data, error } = await supabase
    .from("wall_segments")
    .update({
      ...normalizeUpdate(patch),
      user_edited: true,
      original_values: originalValues,
    })
    .eq("id", segment.id)
    .select()
    .single();
  if (error) throw error;
  return data as WallSegment;
}

/** Walk back from an extraction to find the owning project, so newly
 *  added PDF-flow walls carry project_id alongside extraction_id (the
 *  Take Off page query is keyed by project_id). */
async function projectIdForExtraction(
  extractionId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("extractions")
    .select("drawing_page_id, drawing_pages!inner(drawing_id, drawings!inner(project_id))")
    .eq("id", extractionId)
    .maybeSingle();
  if (error || !data) return null;
  const dp = (data as { drawing_pages?: { drawings?: { project_id?: string } } })
    .drawing_pages;
  return dp?.drawings?.project_id ?? null;
}

export async function addWallSegment(
  extractionId: string,
  userId: string,
  input: WallSegmentUpdate,
): Promise<WallSegment> {
  const sourceId = `manual_${crypto.randomUUID().slice(0, 8)}`;
  const projectId = await projectIdForExtraction(extractionId);
  const { data, error } = await supabase
    .from("wall_segments")
    .insert({
      extraction_id: extractionId,
      project_id: projectId,
      user_id: userId,
      source_id: sourceId,
      ...normalizeUpdate(input),
      confidence: 1.0,
      user_added: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as WallSegment;
}

export async function deleteWallSegment(id: string): Promise<void> {
  const { error } = await supabase.from("wall_segments").delete().eq("id", id);
  if (error) throw error;
}

export async function lockReview(
  extractionId: string,
  userId: string,
): Promise<Extraction> {
  const { data, error } = await supabase
    .from("extractions")
    .update({
      reviewed: true,
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
    })
    .eq("id", extractionId)
    .select()
    .single();
  if (error) throw error;

  // Also flip the page status to 'reviewed' for the project page badge.
  await supabase
    .from("drawing_pages")
    .update({ extraction_status: "reviewed" })
    .eq("id", data.drawing_page_id);

  return data as Extraction;
}

export async function unlockReview(
  extractionId: string,
): Promise<Extraction> {
  const { data, error } = await supabase
    .from("extractions")
    .update({
      reviewed: false,
      reviewed_at: null,
      reviewed_by: null,
    })
    .eq("id", extractionId)
    .select()
    .single();
  if (error) throw error;

  await supabase
    .from("drawing_pages")
    .update({ extraction_status: "extracted" })
    .eq("id", data.drawing_page_id);

  return data as Extraction;
}

/* ============================================================
 * Scale rescaling — recompute every wall length for a new ratio.
 * ============================================================ */

// The page PNG is rasterized at 200 DPI of the plotted sheet, so a sheet
// drawn at 1:R has this many mm of real distance per image pixel.
const MM_PER_PX_PER_SCALE = 25.4 / 200;

/** Parse a scale ratio out of a scale note: "1:500" -> 500, "500" -> 500. */
export function parseScaleRatio(text: string | null): number | null {
  if (!text) return null;
  const afterColon = text.match(/:\s*(\d+(?:\.\d+)?)/);
  if (afterColon) return parseFloat(afterColon[1]);
  const bare = text.trim().match(/^(\d+(?:\.\d+)?)$/);
  return bare ? parseFloat(bare[1]) : null;
}

function readMmPerPx(raw: unknown): number | null {
  if (raw && typeof raw === "object" && "mm_per_px" in raw) {
    const v = (raw as Record<string, unknown>).mm_per_px;
    if (typeof v === "number" && v > 0) return v;
  }
  return null;
}

export type RescaleResult = {
  extraction: Extraction;
  segments: WallSegment[];
};

/**
 * Rescale every wall on an extraction to a new drawing scale ratio. Lengths
 * scale by the ratio of the new calibration to the old, so manual edits and
 * dragged geometry are preserved proportionally. The extraction's scale note
 * and stored mm-per-pixel are updated so later edits use the new scale.
 */
async function persistRescale(
  extraction: Extraction,
  segments: WallSegment[],
  newMmPerPx: number,
): Promise<RescaleResult> {
  const oldMmPerPx = readMmPerPx(extraction.raw_response);
  let factor: number;
  if (oldMmPerPx) {
    factor = newMmPerPx / oldMmPerPx;
  } else {
    const oldRatio = parseScaleRatio(extraction.scale_text);
    if (!oldRatio) {
      throw new Error(
        "This page has no calibration to rescale from — re-measure it from the PDF instead.",
      );
    }
    factor = newMmPerPx / (MM_PER_PX_PER_SCALE * oldRatio);
  }

  const newSegments = segments.map((seg) =>
    seg.length_mm === null
      ? seg
      : { ...seg, length_mm: Math.round(seg.length_mm * factor) },
  );

  const toUpdate = newSegments.filter((s) => s.length_mm !== null);
  const results = await Promise.all(
    toUpdate.map((seg) =>
      supabase
        .from("wall_segments")
        .update({ length_mm: seg.length_mm })
        .eq("id", seg.id),
    ),
  );
  for (const r of results) {
    if (r.error) {
      throw new Error(`Failed to rescale a wall: ${r.error.message}`);
    }
  }

  const rawResponse: Record<string, unknown> =
    extraction.raw_response && typeof extraction.raw_response === "object"
      ? { ...(extraction.raw_response as Record<string, unknown>) }
      : {};
  rawResponse.mm_per_px = newMmPerPx;
  const ratio = Math.round(newMmPerPx / MM_PER_PX_PER_SCALE);

  const { data: ext, error: extErr } = await supabase
    .from("extractions")
    .update({ scale_text: `1:${ratio}`, raw_response: rawResponse })
    .eq("id", extraction.id)
    .select()
    .single();
  if (extErr || !ext) {
    throw new Error(extErr?.message ?? "Failed to update the scale.");
  }

  return { extraction: ext as Extraction, segments: newSegments };
}

/** Rescale every wall to a new drawing scale ratio (e.g. 500 for 1:500). */
export async function rescaleExtractionWalls(
  extraction: Extraction,
  segments: WallSegment[],
  newRatio: number,
): Promise<RescaleResult> {
  if (!Number.isFinite(newRatio) || newRatio <= 0) {
    throw new Error("Enter a valid scale ratio, e.g. 500 for 1:500.");
  }
  return persistRescale(extraction, segments, MM_PER_PX_PER_SCALE * newRatio);
}

/**
 * Rescale every wall from a known real-world distance between two points
 * picked on the drawing (image-pixel coordinates) — the two-point
 * calibration, applied after the page has already been measured.
 */
export async function rescaleExtractionByDistance(
  extraction: Extraction,
  segments: WallSegment[],
  p0: [number, number],
  p1: [number, number],
  distanceMetres: number,
): Promise<RescaleResult> {
  const pixelDist = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]);
  if (pixelDist < 1) {
    throw new Error("The two calibration points are too close together.");
  }
  if (!Number.isFinite(distanceMetres) || distanceMetres <= 0) {
    throw new Error("Enter the real distance between the points, in metres.");
  }
  return persistRescale(
    extraction,
    segments,
    (distanceMetres * 1000) / pixelDist,
  );
}
