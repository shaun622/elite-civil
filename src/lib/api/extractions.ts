import { supabase } from "@/lib/supabase";

export type ExtractDrawingSuccess = {
  ok: true;
  extraction_id: string;
  view_type: "plan" | "elevation" | "section" | "unknown";
  units: "mm" | "m" | "ft" | "in" | "unknown";
  scale_text: string | null;
  overall_confidence: number | null;
  wall_segment_count: number;
  dimension_label_count: number;
  warnings: string[];
  usage?: Record<string, unknown>;
};

export async function extractDrawingPage(
  drawingPageId: string,
): Promise<ExtractDrawingSuccess> {
  const { data, error } = await supabase.functions.invoke<
    ExtractDrawingSuccess | { error: string }
  >("extract-drawing", {
    body: { drawing_page_id: drawingPageId },
  });
  if (error) {
    // supabase-js FunctionsHttpError stores the raw Response as `context`
    // (not `context.response`). Pull the structured error message out of it.
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
        console.error("[extract-drawing] server error:", body.error);
        throw new Error(body.error);
      }
    }
    // eslint-disable-next-line no-console
    console.error("[extract-drawing] unhandled invoke error:", error);
    throw error;
  }
  if (!data || !("ok" in data)) {
    const message =
      data && "error" in data && typeof data.error === "string"
        ? data.error
        : "Extraction failed";
    throw new Error(message);
  }
  return data;
}
