// analyze-drawing edge function — Stage II semantic pass.
//
// POST /functions/v1/analyze-drawing
// Body: { drawing_page_id, tiles: [{ base64, originX, originY,
//         width, height }] }
//
// Two passes run in parallel:
//   - Whole page (the stored PNG): scale bar, legend colours, lot numbers —
//     large features that read fine from one downscaled image.
//   - Tiles (rendered full-resolution by the client): ground RL spot levels
//     — small numbers that need full resolution to read accurately.
// RL coordinates are offset back into full-page pixels and merged. Wall
// geometry/lengths are computed client-side; this only reads semantics.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { PageResultSchema, TileResultSchema } from "./schema.ts";
import { PAGE_PROMPT, TILE_PROMPT } from "./prompt.ts";

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

type Tile = {
  base64: string;
  originX: number;
  originY: number;
  width: number;
  height: number;
};

function isTile(v: unknown): v is Tile {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.base64 === "string" &&
    typeof t.originX === "number" &&
    typeof t.originY === "number" &&
    typeof t.width === "number" &&
    typeof t.height === "number"
  );
}

/** One Anthropic vision call; returns the parsed JSON from the text block.
 *  Throws on HTTP error, a missing text block, or invalid JSON. */
async function anthropicJson(
  systemPrompt: string,
  imageBase64: string,
  userText: string,
  anthropicKey: string,
): Promise<unknown> {
  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: "text",
        text: systemPrompt,
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
              data: imageBase64,
            },
          },
          { type: "text", text: userText },
        ],
      },
    ],
  };

  const resp = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic API ${resp.status}: ${errText.slice(0, 400)}`);
  }
  const data = await resp.json();
  const textBlock = (data.content ?? []).find(
    (b: { type: string }) => b.type === "text",
  );
  if (!textBlock || typeof textBlock.text !== "string") {
    throw new Error("Model response had no text block");
  }
  const raw = String(textBlock.text)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(raw);
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

  let payload: { drawing_page_id?: string; tiles?: unknown };
  try {
    payload = await req.json();
  } catch {
    return errorResponse(400, "Body must be JSON");
  }

  const pageId = payload.drawing_page_id;
  if (!pageId || typeof pageId !== "string") {
    return errorResponse(400, "drawing_page_id is required");
  }
  const tilesRaw = payload.tiles;
  if (
    !Array.isArray(tilesRaw) ||
    tilesRaw.length === 0 ||
    !tilesRaw.every(isTile)
  ) {
    return errorResponse(400, "Body must include a non-empty `tiles` array.");
  }
  const tiles = tilesRaw as Tile[];

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return errorResponse(401, "Not authenticated");
  }

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
      `[analyze-drawing] start page=${pageId} ${page.image_width}x${page.image_height} tiles=${tiles.length}`,
    );

    // Whole-page image for the scale bar / legend / lots pass.
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(page.image_path);
    if (dlErr || !blob) {
      throw new Error(
        `Could not download page image: ${dlErr?.message ?? "unknown"}`,
      );
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pageBase64 = encodeBase64(bytes);
    const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(
        `Page image is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, which exceeds Anthropic's ~5 MB per-image limit.`,
      );
    }

    // Whole-page pass — throws on failure (scale bar / colours are essential).
    const pagePromise = (async () => {
      const parsed = await anthropicJson(
        PAGE_PROMPT,
        pageBase64,
        `This image is exactly W=${page.image_width} pixels wide and H=${page.image_height} pixels tall. Return every coordinate in this pixel space. Read the scale bar, legend wall colours and lot numbers following the schema.`,
        anthropicKey,
      );
      const v = PageResultSchema.safeParse(parsed);
      if (!v.success) {
        throw new Error(
          `Page result did not match schema: ${JSON.stringify(v.error.issues).slice(0, 300)}`,
        );
      }
      return v.data;
    })();

    // Tile passes — each reads RLs; a failed tile is skipped, not fatal.
    const tilePromises = tiles.map(async (tile) => {
      try {
        const parsed = await anthropicJson(
          TILE_PROMPT,
          tile.base64,
          `This tile is exactly W=${tile.width} pixels wide and H=${tile.height} pixels tall — one full-resolution section of a larger drawing. Read every ground RL spot level in it, with tile-local coordinates.`,
          anthropicKey,
        );
        const v = TileResultSchema.safeParse(parsed);
        if (!v.success) {
          console.error(
            `[analyze-drawing] tile schema fail: ${JSON.stringify(v.error.issues).slice(0, 200)}`,
          );
          return null;
        }
        return v.data.rls;
      } catch (err) {
        console.error(`[analyze-drawing] tile failed:`, err);
        return null;
      }
    });

    const [pageResult, ...tileResults] = await Promise.all([
      pagePromise,
      ...tilePromises,
    ]);

    // Offset RLs into full-page pixels and de-duplicate the tile overlaps.
    const rls: { value: number; x: number; y: number }[] = [];
    tiles.forEach((tile, i) => {
      const tr = tileResults[i];
      if (!tr) return;
      for (const r of tr) {
        rls.push({
          value: r.value,
          x: r.x + tile.originX,
          y: r.y + tile.originY,
        });
      }
    });
    const dedupRls: typeof rls = [];
    for (const r of rls) {
      const dup = dedupRls.some(
        (k) => k.value === r.value && Math.hypot(k.x - r.x, k.y - r.y) < 40,
      );
      if (!dup) dedupRls.push(r);
    }

    const warnings = [...pageResult.warnings];
    const okTiles = tileResults.filter((t) => t !== null).length;
    if (okTiles < tiles.length) {
      warnings.push(
        `${tiles.length - okTiles} of ${tiles.length} page tiles could not be read — some RLs may be missing.`,
      );
    }

    console.log(
      `[analyze-drawing] page=${pageId} ok: scale_bar=${pageResult.scale_bar.found} colors=${pageResult.wall_colors.length} lots=${pageResult.lots.length} rls=${dedupRls.length}`,
    );

    return jsonResponse({
      ok: true,
      scale_bar: pageResult.scale_bar,
      scale_text: pageResult.scale_text,
      wall_colors: pageResult.wall_colors,
      lots: pageResult.lots,
      rls: dedupRls,
      warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    console.error(`[analyze-drawing] page=${pageId} failed:`, err);
    return errorResponse(500, message);
  }
});
