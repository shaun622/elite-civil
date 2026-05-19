// analyze-drawing edge function — Stage II semantic pass.
//
// POST /functions/v1/analyze-drawing
// Body: { drawing_page_id: string }
//
// Wall geometry and lengths are computed client-side from the PDF's vector
// data; wall heights are entered by the user from RLs. This function reads
// the drawing's SEMANTICS so the measured walls can be calibrated, coloured
// and named:
//   - the graphic scale bar (two ticks + their real distance) -> calibration
//   - the legend's retaining-wall colours
//   - the lot numbers and their positions
// It does NOT write to the database — it returns the parsed JSON to the
// caller, which fuses it with the client-side vector walls.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { AnalyzeResultSchema } from "./schema.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 8192;
const BUCKET = "drawings";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Json = Record<string, unknown>;

function jsonResponse(body: Json, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function errorResponse(status: number, message: string, extra: Json = {}) {
  return jsonResponse({ error: message, ...extra }, { status });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse(401, "Missing Authorization header");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return errorResponse(500, "Supabase env vars not configured");
  }
  if (!anthropicKey) {
    return errorResponse(500, "ANTHROPIC_API_KEY not configured");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let payload: { drawing_page_id?: string };
  try {
    payload = await req.json();
  } catch {
    return errorResponse(400, "Body must be JSON");
  }

  const pageId = payload.drawing_page_id;
  if (!pageId || typeof pageId !== "string") {
    return errorResponse(400, "drawing_page_id is required");
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return errorResponse(401, "Not authenticated");
  }

  // RLS ensures we only see pages this user owns.
  const { data: page, error: pageErr } = await supabase
    .from("drawing_pages")
    .select("id, image_path, image_width, image_height")
    .eq("id", pageId)
    .single();
  if (pageErr || !page) {
    return errorResponse(404, "Drawing page not found", {
      detail: pageErr?.message,
    });
  }

  try {
    console.log(
      `[analyze-drawing] start page=${pageId} ${page.image_width}x${page.image_height}`,
    );

    // 1. Download the rasterized PNG.
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(page.image_path);
    if (dlErr || !blob) {
      throw new Error(
        `Could not download page image: ${dlErr?.message ?? "unknown"}`,
      );
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const base64 = encodeBase64(bytes);

    const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(
        `Page image is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, which exceeds Anthropic's ~5 MB per-image limit.`,
      );
    }

    // 2. Call Anthropic. Opus 4.7 rejects sampling params; thinking is off.
    const anthropicBody = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: base64,
              },
            },
            {
              type: "text",
              text: `This image is exactly W=${page.image_width} pixels wide and H=${page.image_height} pixels tall. Return every coordinate in this pixel space: x within 0..${page.image_width}, y within 0..${page.image_height}. Read the drawing's scale bar, legend wall colours and lot numbers following the schema in the system prompt.`,
            },
          ],
        },
      ],
    };

    console.log(`[analyze-drawing] calling Anthropic model=${MODEL}`);
    const anthropicResp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      console.error(
        `[analyze-drawing] Anthropic non-OK status=${anthropicResp.status} body=${errText.slice(0, 1000)}`,
      );
      throw new Error(
        `Anthropic API ${anthropicResp.status}: ${errText.slice(0, 500)}`,
      );
    }

    const anthropicData = await anthropicResp.json();
    const stopReason = anthropicData.stop_reason as string | undefined;
    console.log(
      `[analyze-drawing] Anthropic OK stop_reason=${stopReason} usage=${JSON.stringify(anthropicData.usage ?? {})}`,
    );

    // 3. Pull the text block.
    const textBlock = (anthropicData.content ?? []).find(
      (b: { type: string }) => b.type === "text",
    );
    if (!textBlock || typeof textBlock.text !== "string") {
      throw new Error(
        `Model response had no text block (stop_reason=${stopReason}).`,
      );
    }

    // 4. Parse + validate JSON (strip stray code fences defensively).
    const rawText = String(textBlock.text).trim();
    const stripped = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripped);
    } catch (e) {
      console.error(
        `[analyze-drawing] JSON parse failed. raw (first 500):`,
        rawText.slice(0, 500),
      );
      throw new Error(
        `Model output was not valid JSON: ${e instanceof Error ? e.message : "parse error"}`,
      );
    }

    const validated = AnalyzeResultSchema.safeParse(parsed);
    if (!validated.success) {
      console.error(
        `[analyze-drawing] schema validation failed:`,
        JSON.stringify(validated.error.issues),
      );
      throw new Error(
        `Model output did not match schema: ${validated.error.message.slice(0, 500)}`,
      );
    }
    const result = validated.data;

    console.log(
      `[analyze-drawing] page=${pageId} ok: scale_bar=${result.scale_bar.found} colors=${result.wall_colors.length} lots=${result.lots.length}`,
    );

    return jsonResponse({
      ok: true,
      scale_bar: result.scale_bar,
      scale_text: result.scale_text,
      wall_colors: result.wall_colors,
      lots: result.lots,
      warnings: result.warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    console.error(`[analyze-drawing] page=${pageId} failed:`, err);
    return errorResponse(500, message);
  }
});
