import { supabase } from "@/lib/supabase";

type ReadRlsResult = { ok: true; numbers: number[] } | { error: string };

/**
 * OCR a marquee-selected crop of the drawing for its reduced-level (RL)
 * numbers, via the `read-rls` edge function. Returns the numbers found,
 * in the order the model read them. Throws on failure.
 */
export async function readRlsFromCrop(imageBase64: string): Promise<number[]> {
  const { data, error } = await supabase.functions.invoke<ReadRlsResult>(
    "read-rls",
    { body: { image_base64: imageBase64 } },
  );
  if (error) {
    // FunctionsHttpError keeps the raw Response on `context`; try to surface
    // the server's JSON `error` message.
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx instanceof Response) {
      try {
        const body = (await ctx.clone().json()) as { error?: string };
        if (body?.error) throw new Error(body.error);
      } catch {
        // not JSON — fall through
      }
    }
    throw error;
  }
  if (!data || !("ok" in data)) {
    throw new Error(
      data && "error" in data ? data.error : "Could not read the numbers.",
    );
  }
  return data.numbers;
}
