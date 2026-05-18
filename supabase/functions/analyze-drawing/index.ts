// analyze-drawing edge function — Stage II semantic pass (tiled).
//
// POST /functions/v1/analyze-drawing
// Body: { page_width, page_height, tiles: [{ base64, originX, originY,
//         width, height }] }
//
// The client renders the PDF page into a grid of full-resolution tiles so
// small annotations (wall-height numbers) are not lost to image
// downsampling. This function reads each tile with Claude in parallel,
// offsets every coordinate back into full-page pixels, merges + de-dups the
// results, and returns the drawing's semantics: scale bar, legend colours,
// wall-height labels and lot numbers. Wall geometry is computed client-side.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { AnalyzeResultSchema, type AnalyzeResult } from "./schema.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-7";
// One tile holds a fraction of the sheet, so 6K output tokens is ample.
const MAX_TOKENS = 6000;

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

/** Read one tile with Claude. Returns null if the call or parse fails, so a
 *  single bad tile never sinks the whole page. */
async function analyzeTile(
  tile: Tile,
  anthropicKey: string,
): Promise<AnalyzeResult | null> {
  try {
    const body = {
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
                data: tile.base64,
              },
            },
            {
              type: "text",
              text: `This tile is exactly W=${tile.width} pixels wide and H=${tile.height} pixels tall — one section of a larger architectural drawing. Return every coordinate in tile-local pixels (x within 0..${tile.width}, y within 0..${tile.height}). Read the scale bar, legend wall colours, wall-height labels and lot numbers visible in this tile, following the schema in the system prompt.`,
            },
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
      console.error(
        `[analyze-drawing] tile Anthropic non-OK ${resp.status}: ${errText.slice(0, 400)}`,
      );
      return null;
    }

    const data = await resp.json();
    const textBlock = (data.content ?? []).find(
      (b: { type: string }) => b.type === "text",
    );
    if (!textBlock || typeof textBlock.text !== "string") return null;

    const raw = String(textBlock.text)
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const parsed = JSON.parse(raw);
    const validated = AnalyzeResultSchema.safeParse(parsed);
    if (!validated.success) {
      console.error(
        `[analyze-drawing] tile schema fail: ${JSON.stringify(validated.error.issues).slice(0, 300)}`,
      );
      return null;
    }
    return validated.data;
  } catch (err) {
    console.error(`[analyze-drawing] tile failed:`, err);
    return null;
  }
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

  let payload: { tiles?: unknown };
  try {
    payload = await req.json();
  } catch {
    return errorResponse(400, "Body must be JSON");
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

  try {
    console.log(`[analyze-drawing] start: ${tiles.length} tiles`);

    const results = await Promise.all(
      tiles.map((t) => analyzeTile(t, anthropicKey)),
    );
    const okCount = results.filter((r) => r !== null).length;
    if (okCount === 0) {
      throw new Error("The AI could not read any of the page tiles.");
    }

    // Merge — offset every tile-local coordinate into full-page pixels.
    const heightLabels: { value_m: number; x: number; y: number }[] = [];
    const lots = new Map<string, { name: string; x: number; y: number }>();
    const wallColors = new Map<string, { type_label: string; hex: string }>();
    const warnings = new Set<string>();
    let scaleText: string | null = null;
    let scaleBar: {
      found: boolean;
      p0: [number, number] | null;
      p1: [number, number] | null;
      length_m: number | null;
    } = { found: false, p0: null, p1: null, length_m: null };
    let bestScaleSpan = 0;

    tiles.forEach((tile, i) => {
      const r = results[i];
      if (!r) return;
      const { originX: ox, originY: oy } = tile;

      for (const h of r.height_labels) {
        heightLabels.push({ value_m: h.value_m, x: h.x + ox, y: h.y + oy });
      }
      for (const lot of r.lots) {
        if (!lots.has(lot.name)) {
          lots.set(lot.name, { name: lot.name, x: lot.x + ox, y: lot.y + oy });
        }
      }
      for (const wc of r.wall_colors) {
        if (!wallColors.has(wc.type_label)) wallColors.set(wc.type_label, wc);
      }
      for (const w of r.warnings) warnings.add(w);
      if (scaleText === null && r.scale_text) scaleText = r.scale_text;

      const sb = r.scale_bar;
      if (sb.found && sb.p0 && sb.p1 && sb.length_m) {
        const span = Math.hypot(sb.p0[0] - sb.p1[0], sb.p0[1] - sb.p1[1]);
        if (span > bestScaleSpan) {
          bestScaleSpan = span;
          scaleBar = {
            found: true,
            p0: [sb.p0[0] + ox, sb.p0[1] + oy],
            p1: [sb.p1[0] + ox, sb.p1[1] + oy],
            length_m: sb.length_m,
          };
        }
      }
    });

    // De-duplicate height labels seen twice in overlapping tiles: same value
    // within 60 px is the same label.
    const dedupHeights: { value_m: number; x: number; y: number }[] = [];
    for (const h of heightLabels) {
      const dup = dedupHeights.some(
        (k) =>
          Math.round(k.value_m * 10) === Math.round(h.value_m * 10) &&
          Math.hypot(k.x - h.x, k.y - h.y) < 60,
      );
      if (!dup) dedupHeights.push(h);
    }

    if (okCount < tiles.length) {
      warnings.add(
        `${tiles.length - okCount} of ${tiles.length} page tiles could not be read — some labels may be missing.`,
      );
    }

    console.log(
      `[analyze-drawing] merged ${okCount}/${tiles.length} tiles: scale_bar=${scaleBar.found} colors=${wallColors.size} heights=${dedupHeights.length} lots=${lots.size}`,
    );

    return jsonResponse({
      ok: true,
      scale_bar: scaleBar,
      scale_text: scaleText,
      wall_colors: [...wallColors.values()],
      height_labels: dedupHeights,
      lots: [...lots.values()],
      warnings: [...warnings],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    console.error(`[analyze-drawing] failed:`, err);
    return errorResponse(500, message);
  }
});
