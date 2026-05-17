import { supabase } from "@/lib/supabase";
import { loadPdf, rasterizePage } from "@/lib/pdfRender";
import type {
  Drawing,
  DrawingPage,
  DrawingWithPages,
} from "@/types/db";

const BUCKET = "drawings";
const DPI = 200;
const SIGNED_URL_TTL_SEC = 60 * 60;

export type UploadStage =
  | { kind: "uploading-pdf" }
  | { kind: "reading-pdf" }
  | { kind: "rasterizing"; page: number; total: number }
  | { kind: "uploading-page"; page: number; total: number }
  | { kind: "saving" }
  | { kind: "done" };

export type UploadProgress = (stage: UploadStage) => void;

function newDrawingId(): string {
  return crypto.randomUUID();
}

function storagePath(userId: string, drawingId: string, name: string): string {
  return `${userId}/${drawingId}/${name}`;
}

export async function listDrawingsForProject(
  projectId: string,
): Promise<DrawingWithPages[]> {
  const { data: drawings, error: drawingsErr } = await supabase
    .from("drawings")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (drawingsErr) throw drawingsErr;
  if (!drawings || drawings.length === 0) return [];

  const ids = drawings.map((d) => d.id);
  const { data: pages, error: pagesErr } = await supabase
    .from("drawing_pages")
    .select("*")
    .in("drawing_id", ids)
    .order("page_number", { ascending: true });
  if (pagesErr) throw pagesErr;

  const byDrawing = new Map<string, DrawingPage[]>();
  for (const p of (pages ?? []) as DrawingPage[]) {
    const arr = byDrawing.get(p.drawing_id) ?? [];
    arr.push(p);
    byDrawing.set(p.drawing_id, arr);
  }

  return (drawings as Drawing[]).map((d) => ({
    ...d,
    pages: byDrawing.get(d.id) ?? [],
  }));
}

export async function getSignedUrlsForPaths(
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SEC);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}

export async function uploadDrawing(opts: {
  file: File;
  projectId: string;
  userId: string;
  onProgress?: UploadProgress;
}): Promise<DrawingWithPages> {
  const { file, projectId, userId, onProgress } = opts;
  const drawingId = newDrawingId();
  const pdfPath = storagePath(userId, drawingId, "original.pdf");

  onProgress?.({ kind: "uploading-pdf" });
  const { error: pdfErr } = await supabase.storage
    .from(BUCKET)
    .upload(pdfPath, file, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (pdfErr) throw pdfErr;

  onProgress?.({ kind: "reading-pdf" });
  const pdf = await loadPdf(await file.arrayBuffer());
  const total = pdf.numPages;

  const pageInserts: Omit<DrawingPage, "id" | "created_at">[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
      onProgress?.({ kind: "rasterizing", page: pageNumber, total });
      const rendered = await rasterizePage(pdf, pageNumber, DPI);

      onProgress?.({ kind: "uploading-page", page: pageNumber, total });
      const pngPath = storagePath(userId, drawingId, `page-${pageNumber}.png`);
      const { error: pngErr } = await supabase.storage
        .from(BUCKET)
        .upload(pngPath, rendered.blob, {
          contentType: "image/png",
          upsert: false,
        });
      if (pngErr) throw pngErr;

      pageInserts.push({
        drawing_id: drawingId,
        user_id: userId,
        page_number: pageNumber,
        image_path: pngPath,
        image_width: rendered.width,
        image_height: rendered.height,
        view_type: "unknown",
        extraction_status: "pending",
        extraction_error: null,
      });
    }

    onProgress?.({ kind: "saving" });

    const { data: drawing, error: drawingErr } = await supabase
      .from("drawings")
      .insert({
        id: drawingId,
        project_id: projectId,
        user_id: userId,
        original_filename: file.name,
        file_path: pdfPath,
        page_count: total,
      })
      .select()
      .single();
    if (drawingErr) throw drawingErr;

    const { data: insertedPages, error: pagesErr } = await supabase
      .from("drawing_pages")
      .insert(pageInserts)
      .select();
    if (pagesErr) throw pagesErr;

    onProgress?.({ kind: "done" });
    return {
      ...(drawing as Drawing),
      pages: (insertedPages ?? []) as DrawingPage[],
    };
  } catch (err) {
    // Best-effort cleanup of storage objects so we don't leave orphans on
    // failure. DB rows are only inserted after all pages upload, so we only
    // need to clean storage here.
    try {
      const objects = [
        pdfPath,
        ...pageInserts.map((p) => p.image_path),
      ];
      await supabase.storage.from(BUCKET).remove(objects);
    } catch {
      // swallow — original error is more useful
    }
    throw err;
  }
}

export async function deleteDrawing(drawing: DrawingWithPages): Promise<void> {
  const paths = [drawing.file_path, ...drawing.pages.map((p) => p.image_path)];
  await supabase.storage.from(BUCKET).remove(paths);
  const { error } = await supabase
    .from("drawings")
    .delete()
    .eq("id", drawing.id);
  if (error) throw error;
}
