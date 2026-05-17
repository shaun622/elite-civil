// extract-drawing edge function.
//
// POST /functions/v1/extract-drawing
// Body: { drawing_page_id: string }
//
// Flow:
//   1. Verify the caller is authenticated and owns the drawing_page.
//   2. Mark drawing_pages.extraction_status = 'extracting'.
//   3. Download the rasterized PNG from the private "drawings" bucket.
//   4. Call Anthropic Messages API (claude-sonnet-4-6) with the cached system
//      prompt and the image. Adaptive thinking is enabled.
//   5. Validate the JSON response against the spec schema.
//   6. Insert the extraction + wall_segments + dimension_labels rows
//      (best-effort; rolls back the parent row on partial failure).
//   7. Mark drawing_pages.extraction_status = 'extracted'.
//   8. Return the parsed extraction payload to the caller.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { ExtractionResultSchema } from "./schema.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
// Higher cap because adaptive thinking burns through tokens before the JSON
// output is produced. 16K leaves plenty of room for both.
const MAX_TOKENS = 16384;
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
  const userId = userData.user.id;

  // RLS ensures we only see pages this user owns.
  const { data: page, error: pageErr } = await supabase
    .from("drawing_pages")
    .select("id, drawing_id, image_path, image_width, image_height, extraction_status")
    .eq("id", pageId)
    .single();
  if (pageErr || !page) {
    return errorResponse(404, "Drawing page not found", { detail: pageErr?.message });
  }

  if (page.extraction_status === "extracting") {
    return errorResponse(409, "Extraction already in progress for this page");
  }

  // Block re-extracting an already-extracted page for now (Step 5 will add
  // explicit re-run UI; the unique constraint on extractions enforces this
  // server-side too).
  if (page.extraction_status === "extracted" || page.extraction_status === "reviewed") {
    return errorResponse(409, "Page is already extracted");
  }

  await supabase
    .from("drawing_pages")
    .update({ extraction_status: "extracting", extraction_error: null })
    .eq("id", pageId);

  try {
    console.log(`[extract-drawing] start page=${pageId} path=${page.image_path} ${page.image_width}x${page.image_height}`);

    // 1. Download the PNG.
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(page.image_path);
    if (dlErr || !blob) {
      throw new Error(`Could not download page image: ${dlErr?.message ?? "unknown"}`);
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const base64 = encodeBase64(bytes);
    console.log(
      `[extract-drawing] downloaded image: ${bytes.byteLength} bytes (${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB) -> ${base64.length} base64 chars`,
    );

    // Pre-check against Anthropic's per-image size cap. The wire limit is
    // 5 MB; we leave a small safety margin for the JSON envelope. PNGs at
    // 200 DPI on A1/A0 architectural sheets can easily exceed this — surface
    // a clear error instead of letting the API 400 with a less useful message.
    const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(
        `Page image is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, which exceeds Anthropic's ~5 MB per-image limit. Re-rasterize at lower DPI (we will lower the default in a follow-up).`,
      );
    }

    // 2. Call Anthropic.
    //
    // Note: the spec asks for `temperature: 0.0`, but that's incompatible
    // with adaptive thinking on Sonnet 4.6 — Anthropic 400s the request.
    // The system prompt is explicit enough that we don't really need
    // temperature=0 for stable output. We omit `temperature` (default 1.0)
    // and rely on adaptive thinking + the strict JSON schema in the prompt.
    const anthropicBody = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
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
              text: `Image dimensions: W=${page.image_width} x H=${page.image_height} pixels. Extract retaining-wall measurements following the schema in the system prompt.`,
            },
          ],
        },
      ],
    };

    console.log(`[extract-drawing] calling Anthropic model=${MODEL}`);
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
        `[extract-drawing] Anthropic API non-OK status=${anthropicResp.status} body=${errText.slice(0, 1000)}`,
      );
      throw new Error(`Anthropic API ${anthropicResp.status}: ${errText.slice(0, 500)}`);
    }

    const anthropicData = await anthropicResp.json();
    const stopReason = anthropicData.stop_reason as string | undefined;
    const blockTypes = (anthropicData.content ?? []).map(
      (b: { type: string }) => b.type,
    );
    console.log(
      `[extract-drawing] Anthropic OK stop_reason=${stopReason} blocks=${JSON.stringify(blockTypes)} usage=${JSON.stringify(anthropicData.usage ?? {})}`,
    );

    // 3. Extract the final text block (skip any thinking blocks).
    const textBlock = (anthropicData.content ?? []).find(
      (b: { type: string }) => b.type === "text",
    );
    if (!textBlock || typeof textBlock.text !== "string") {
      throw new Error(
        `Model response had no text block (stop_reason=${stopReason}, blocks=${JSON.stringify(blockTypes)}). If stop_reason is max_tokens, the model ran out of tokens during thinking before producing the JSON.`,
      );
    }

    // 4. Parse + validate JSON. Some models occasionally wrap JSON in code
    // fences despite the instruction — strip them defensively.
    const raw = String(textBlock.text).trim();
    const stripped = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripped);
    } catch (e) {
      console.error(
        `[extract-drawing] JSON parse failed. raw output (first 500 chars):`,
        raw.slice(0, 500),
      );
      throw new Error(
        `Model output was not valid JSON: ${e instanceof Error ? e.message : "parse error"}`,
      );
    }

    const validated = ExtractionResultSchema.safeParse(parsed);
    if (!validated.success) {
      console.error(
        `[extract-drawing] schema validation failed. issues:`,
        JSON.stringify(validated.error.issues),
      );
      throw new Error(
        `Model output did not match schema: ${validated.error.message.slice(0, 500)}`,
      );
    }
    const result = validated.data;

    // 5. Insert extraction parent.
    const { data: extraction, error: insExtractionErr } = await supabase
      .from("extractions")
      .insert({
        drawing_page_id: pageId,
        user_id: userId,
        raw_response: parsed as Json,
        scale_text: result.scale_text,
        scale_bbox: result.scale_bbox,
        units: result.units,
        view_type: result.view_type,
        overall_confidence: result.overall_confidence,
        warnings: result.warnings,
      })
      .select()
      .single();
    if (insExtractionErr || !extraction) {
      throw new Error(`Failed to insert extraction: ${insExtractionErr?.message}`);
    }

    // 6. Insert wall_segments. Keep Claude's source IDs around so we can
    // resolve dimension_labels.applies_to_segment_id afterwards.
    const segmentInserts = result.wall_segments.map((seg) => ({
      extraction_id: extraction.id,
      user_id: userId,
      source_id: seg.id,
      label: seg.label,
      length_mm: seg.length_mm,
      height_mm: seg.height_mm,
      thickness_mm: seg.thickness_mm,
      polyline: seg.polyline,
      label_bbox: seg.label_bbox,
      source_dimension_ids: seg.source_dimension_ids,
      confidence: seg.confidence,
      notes: seg.notes,
    }));
    let segmentBySourceId = new Map<string, string>();
    if (segmentInserts.length > 0) {
      const { data: segments, error: segErr } = await supabase
        .from("wall_segments")
        .insert(segmentInserts)
        .select("id, source_id");
      if (segErr) {
        throw new Error(`Failed to insert wall_segments: ${segErr.message}`);
      }
      segmentBySourceId = new Map(
        (segments ?? []).map((s) => [s.source_id as string, s.id as string]),
      );
    }

    // 7. Insert dimension_labels with applies_to_segment_id resolved.
    if (result.dimension_labels.length > 0) {
      const dimInserts = result.dimension_labels.map((dim) => {
        const owningSegment = result.wall_segments.find((seg) =>
          seg.source_dimension_ids.includes(dim.id),
        );
        return {
          extraction_id: extraction.id,
          user_id: userId,
          source_id: dim.id,
          text_raw: dim.text_raw,
          value_normalized_mm: dim.value_normalized_mm,
          bbox: dim.bbox,
          confidence: dim.confidence,
          applies_to_segment_id: owningSegment
            ? (segmentBySourceId.get(owningSegment.id) ?? null)
            : null,
        };
      });
      const { error: dimErr } = await supabase
        .from("dimension_labels")
        .insert(dimInserts);
      if (dimErr) {
        throw new Error(`Failed to insert dimension_labels: ${dimErr.message}`);
      }
    }

    await supabase
      .from("drawing_pages")
      .update({
        extraction_status: "extracted",
        extraction_error: null,
        view_type: result.view_type,
      })
      .eq("id", pageId);

    return jsonResponse({
      ok: true,
      extraction_id: extraction.id,
      view_type: result.view_type,
      units: result.units,
      scale_text: result.scale_text,
      overall_confidence: result.overall_confidence,
      wall_segment_count: result.wall_segments.length,
      dimension_label_count: result.dimension_labels.length,
      warnings: result.warnings,
      usage: anthropicData.usage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    console.error(`[extract-drawing] page=${pageId} failed:`, err);

    await supabase
      .from("drawing_pages")
      .update({
        extraction_status: "failed",
        extraction_error: message.slice(0, 1000),
      })
      .eq("id", pageId);

    // Clean up any orphaned extraction row from this attempt.
    await supabase
      .from("extractions")
      .delete()
      .eq("drawing_page_id", pageId);

    return errorResponse(500, message);
  }
});
