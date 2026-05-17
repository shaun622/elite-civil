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

export async function addWallSegment(
  extractionId: string,
  userId: string,
  input: WallSegmentUpdate,
): Promise<WallSegment> {
  const sourceId = `manual_${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await supabase
    .from("wall_segments")
    .insert({
      extraction_id: extractionId,
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
