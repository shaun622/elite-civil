// Tiny Stripe REST wrapper shared by the three Stripe-related edge functions.
// Uses fetch + form-urlencoded so we don't pull in the heavyweight SDK on
// every cold start.

export const STRIPE_API_BASE = "https://api.stripe.com/v1";

export function stripeFormEncode(
  obj: Record<string, unknown>,
  prefix = "",
): string {
  const params: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) {
      params.push(stripeFormEncode(v as Record<string, unknown>, key));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        const arrKey = `${key}[${i}]`;
        if (typeof item === "object") {
          params.push(stripeFormEncode(item as Record<string, unknown>, arrKey));
        } else {
          params.push(`${encodeURIComponent(arrKey)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else {
      params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return params.filter(Boolean).join("&");
}

export async function stripeCall<T>(
  path: string,
  body: Record<string, unknown> | null,
  secretKey: string,
  method: "GET" | "POST" = "POST",
): Promise<T> {
  const url = `${STRIPE_API_BASE}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Stripe-Version": "2024-11-20.acacia",
    },
  };
  if (body) {
    const encoded = stripeFormEncode(body);
    (init.headers as Record<string, string>)["Content-Type"] =
      "application/x-www-form-urlencoded";
    init.body = encoded;
  }
  const resp = await fetch(url, init);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Stripe ${path} ${resp.status}: ${text.slice(0, 600)}`);
  }
  return (await resp.json()) as T;
}

/**
 * Verify a Stripe-Signature header on a raw request body. Constant-time
 * comparison, supports the v1=<hex> format Stripe sends.
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k, v];
    }),
  ) as Record<string, string>;

  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const tsSec = parseInt(t, 10);
  if (Number.isNaN(tsSec)) return false;

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsSec) > toleranceSeconds) return false;

  const signedPayload = `${t}.${rawBody}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signedPayload));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return constantTimeEqual(hex, v1);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(
  body: Record<string, unknown>,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export function errorResponse(
  status: number,
  message: string,
): Response {
  return jsonResponse({ error: message }, { status });
}
