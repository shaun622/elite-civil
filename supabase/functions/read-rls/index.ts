// read-rls edge function — reads the reduced-level (RL) numbers out of a
// small image crop the user has marquee-selected on the drawing.
//
// POST /functions/v1/read-rls
// Body: { image_base64: string }   // a PNG crop, base64 (no data: prefix)
// Returns: { ok: true, numbers: number[] }
//
// Used by the Review page's "Grab RLs" tool: the user boxes the two
// numbers at a wall end, we OCR just that crop (far more reliable than the
// whole-page auto pass), and the client pairs them into the wall's RLs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 1024;

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

const SYSTEM_PROMPT = `You read numbers off a small crop of a civil
engineering site plan. The crop contains reduced levels (RLs / spot
levels) — decimal numbers like 49.20, 47.30, 68.755. Read EVERY numeric
value you can see in the image, exactly as printed (keep the decimals).

Ignore anything that is not a level number: lot numbers in boxes, scale
text, north arrows, hatching, contour labels written along a curve, and
any "(1.90)"-style bracketed height callouts (these are derived heights,
not RLs — skip them).

Return ONLY minified JSON in this exact shape, nothing else:
{"numbers":[49.20,47.30]}
If you see no level numbers, return {"numbers":[]}.`;

async function readNumbers(
  imageBase64: string,
  anthropicKey: string,
): Promise<number[]> {
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
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: "Read every reduced-level number in this crop and return the JSON.",
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
  const parsed = JSON.parse(raw) as { numbers?: unknown };
  if (!parsed || !Array.isArray(parsed.numbers)) {
    throw new Error("Model response was not the expected { numbers: [] }");
  }
  return parsed.numbers
    .map((n) => (typeof n === "number" ? n : parseFloat(String(n))))
    .filter((n) => Number.isFinite(n));
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

  // Require a signed-in user (RLS-style gate), but no DB row is needed —
  // the client sends the crop directly.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return errorResponse(401, "Not authenticated");
  }

  let payload: { image_base64?: unknown };
  try {
    payload = await req.json();
  } catch {
    return errorResponse(400, "Body must be JSON");
  }
  const imageBase64 = payload.image_base64;
  if (typeof imageBase64 !== "string" || imageBase64.length < 50) {
    return errorResponse(400, "image_base64 (a PNG crop) is required");
  }

  try {
    const numbers = await readNumbers(imageBase64, anthropicKey);
    console.log(`[read-rls] read ${numbers.length} number(s)`);
    return jsonResponse({ ok: true, numbers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Read failed";
    console.error("[read-rls] failed:", err);
    return errorResponse(500, message);
  }
});
