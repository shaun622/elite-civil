import { supabase } from "@/lib/supabase";
import { renderPageTiles } from "@/lib/pdfTiles";

/** Two scale-bar ticks + their real distance, for auto-calibration. */
export type AnalyzeScaleBar = {
  found: boolean;
  p0: [number, number] | null;
  p1: [number, number] | null;
  length_m: number | null;
};

export type AnalyzeWallColor = { type_label: string; hex: string };
export type AnalyzeLot = { name: string; x: number; y: number };
/** A ground reduced level read off the drawing, in full-page pixels. */
export type AnalyzeRl = { value: number; x: number; y: number };

export type AnalyzeDrawingResult = {
  ok: true;
  scale_bar: AnalyzeScaleBar;
  scale_text: string | null;
  wall_colors: AnalyzeWallColor[];
  lots: AnalyzeLot[];
  rls: AnalyzeRl[];
  warnings: string[];
};

/**
 * Stage II semantic pass. Renders the PDF page into full-resolution tiles
 * (so small RL numbers survive) and sends them to the analyze-drawing edge
 * function, which reads the scale bar / legend / lots from the whole page
 * and the RL spot levels from the tiles. The result is fused client-side
 * onto the vector-measured walls.
 */
export async function analyzeDrawingPage(
  drawingPageId: string,
  file: ArrayBuffer,
  pageNumber: number,
): Promise<AnalyzeDrawingResult> {
  const { tiles } = await renderPageTiles(file, pageNumber);

  const { data, error } = await supabase.functions.invoke<
    AnalyzeDrawingResult | { error: string }
  >("analyze-drawing", {
    body: { drawing_page_id: drawingPageId, tiles },
  });
  if (error) {
    // supabase-js FunctionsHttpError stores the raw Response as `context`.
    type CtxErr = { context?: Response | { response?: Response } };
    const ctxField = (error as unknown as CtxErr).context;
    const response =
      ctxField instanceof Response
        ? ctxField
        : ctxField && "response" in ctxField
          ? ctxField.response
          : undefined;

    if (response) {
      let body: { error?: string } | null = null;
      try {
        body = (await response.clone().json()) as { error?: string };
      } catch {
        // not JSON; fall through to the original error below.
      }
      if (body?.error) {
        // eslint-disable-next-line no-console
        console.error("[analyze-drawing] server error:", body.error);
        throw new Error(body.error);
      }
    }
    // eslint-disable-next-line no-console
    console.error("[analyze-drawing] unhandled invoke error:", error);
    throw error;
  }
  if (!data || !("ok" in data)) {
    const message =
      data && "error" in data && typeof data.error === "string"
        ? data.error
        : "Auto-detect failed";
    throw new Error(message);
  }
  return data;
}
