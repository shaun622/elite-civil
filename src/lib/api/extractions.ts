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
    // FunctionsHttpError surfaces the response body as `context.response`; try
    // to pull the structured error message out of it.
    type Ctx = { context?: { response?: Response } };
    const ctx = (error as unknown as Ctx).context;
    if (ctx?.response) {
      let body: { error?: string } | null = null;
      try {
        body = (await ctx.response.json()) as { error?: string };
      } catch {
        // body wasn't JSON; fall through to the original error below.
      }
      if (body?.error) {
        throw new Error(body.error);
      }
    }
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
