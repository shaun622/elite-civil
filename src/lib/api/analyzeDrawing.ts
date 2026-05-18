import { supabase } from "@/lib/supabase";

/** Two scale-bar ticks + their real distance, for auto-calibration. */
export type AnalyzeScaleBar = {
  found: boolean;
  p0: [number, number] | null;
  p1: [number, number] | null;
  length_m: number | null;
};

export type AnalyzeWallColor = { type_label: string; hex: string };
export type AnalyzeHeightLabel = { value_m: number; x: number; y: number };
export type AnalyzeLot = { name: string; x: number; y: number };

export type AnalyzeDrawingResult = {
  ok: true;
  scale_bar: AnalyzeScaleBar;
  scale_text: string | null;
  wall_colors: AnalyzeWallColor[];
  height_labels: AnalyzeHeightLabel[];
  lots: AnalyzeLot[];
  warnings: string[];
};

/**
 * Stage II semantic pass: ask the analyze-drawing edge function to read the
 * scale bar, legend colours, wall-height labels and lot numbers off a page.
 * The result is fused client-side onto the vector-measured walls.
 */
export async function analyzeDrawingPage(
  drawingPageId: string,
): Promise<AnalyzeDrawingResult> {
  const { data, error } = await supabase.functions.invoke<
    AnalyzeDrawingResult | { error: string }
  >("analyze-drawing", {
    body: { drawing_page_id: drawingPageId },
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
