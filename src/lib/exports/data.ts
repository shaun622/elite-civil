import { supabase } from "@/lib/supabase";
import { getSignedUrlsForPaths } from "@/lib/api/drawings";
import type {
  DrawingPage,
  Drawing,
  Extraction,
  Project,
  WallSegment,
} from "@/types/db";

export type ExportPage = {
  drawing: Drawing;
  page: DrawingPage;
  extraction: Extraction;
  segments: WallSegment[];
  imageUrl: string | null;
};

export type ExportBundle = {
  project: Project;
  pages: ExportPage[];
};

export type ExportFilter = {
  reviewedOnly?: boolean;
};

/**
 * Fetch everything needed to build a CSV or PDF takeoff for a project.
 * Skips pages with no extraction. Optionally restricts to reviewed pages.
 */
export async function loadExportBundle(
  projectId: string,
  filter: ExportFilter = {},
): Promise<ExportBundle> {
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (projErr || !project) {
    throw new Error(projErr?.message ?? "Project not found.");
  }

  const { data: drawings, error: drawErr } = await supabase
    .from("drawings")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (drawErr) throw drawErr;
  if (!drawings || drawings.length === 0) {
    return { project: project as Project, pages: [] };
  }

  const drawingIds = drawings.map((d) => d.id);
  const { data: pages, error: pagesErr } = await supabase
    .from("drawing_pages")
    .select("*")
    .in("drawing_id", drawingIds)
    .order("page_number", { ascending: true });
  if (pagesErr) throw pagesErr;

  let eligiblePages = (pages ?? []) as DrawingPage[];
  if (filter.reviewedOnly) {
    eligiblePages = eligiblePages.filter(
      (p) => p.extraction_status === "reviewed",
    );
  } else {
    eligiblePages = eligiblePages.filter(
      (p) =>
        p.extraction_status === "extracted" ||
        p.extraction_status === "reviewed",
    );
  }
  if (eligiblePages.length === 0) {
    return { project: project as Project, pages: [] };
  }

  const eligiblePageIds = eligiblePages.map((p) => p.id);
  const { data: extractions, error: extErr } = await supabase
    .from("extractions")
    .select("*")
    .in("drawing_page_id", eligiblePageIds);
  if (extErr) throw extErr;
  const extByPage = new Map<string, Extraction>();
  for (const e of (extractions ?? []) as Extraction[]) {
    extByPage.set(e.drawing_page_id, e);
  }

  const extractionIds = (extractions ?? []).map((e) => e.id);
  const segmentsByExtraction = new Map<string, WallSegment[]>();
  if (extractionIds.length > 0) {
    const { data: segments, error: segErr } = await supabase
      .from("wall_segments")
      .select("*")
      .in("extraction_id", extractionIds)
      .order("created_at", { ascending: true });
    if (segErr) throw segErr;
    for (const s of (segments ?? []) as WallSegment[]) {
      const list = segmentsByExtraction.get(s.extraction_id) ?? [];
      list.push(s);
      segmentsByExtraction.set(s.extraction_id, list);
    }
  }

  const drawingById = new Map<string, Drawing>();
  for (const d of drawings as Drawing[]) drawingById.set(d.id, d);

  // Sign URLs in one batch.
  const signedUrls = await getSignedUrlsForPaths(
    eligiblePages.map((p) => p.image_path),
  );

  const out: ExportPage[] = [];
  for (const page of eligiblePages) {
    const extraction = extByPage.get(page.id);
    if (!extraction) continue;
    const segments = segmentsByExtraction.get(extraction.id) ?? [];
    const drawing = drawingById.get(page.drawing_id);
    if (!drawing) continue;
    out.push({
      drawing,
      page,
      extraction,
      segments,
      imageUrl: signedUrls[page.image_path] ?? null,
    });
  }

  return { project: project as Project, pages: out };
}
