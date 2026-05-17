// create-checkout-session edge function.
//
// POST /functions/v1/create-checkout-session
// Body: { plan: "starter" | "pro" }
//
// Creates (or reuses) a Stripe Customer for the authenticated user, then
// generates a Checkout Session for the subscription tier they chose.
// Returns { url } which the frontend redirects to.
//
// Required environment / secrets:
//   STRIPE_SECRET_KEY
//   STRIPE_STARTER_PRICE_ID
//   STRIPE_PRO_PRICE_ID
//   APP_PUBLIC_URL          (e.g. https://elite-civil.pages.dev)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import {
  CORS_HEADERS,
  errorResponse,
  jsonResponse,
  stripeCall,
} from "../_shared/stripe.ts";

type Plan = "starter" | "pro";

type StripeCustomer = { id: string };
type StripeCheckoutSession = { id: string; url: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return errorResponse(401, "Missing Authorization header");

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const starterPrice = Deno.env.get("STRIPE_STARTER_PRICE_ID");
  const proPrice = Deno.env.get("STRIPE_PRO_PRICE_ID");
  const appUrl = Deno.env.get("APP_PUBLIC_URL") ?? "https://elite-civil.pages.dev";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!stripeKey) return errorResponse(500, "STRIPE_SECRET_KEY not configured");
  if (!starterPrice || !proPrice) {
    return errorResponse(500, "Stripe price IDs not configured");
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    return errorResponse(500, "Supabase env not configured");
  }

  let payload: { plan?: Plan };
  try {
    payload = await req.json();
  } catch {
    return errorResponse(400, "Body must be JSON");
  }
  const plan = payload.plan;
  if (plan !== "starter" && plan !== "pro") {
    return errorResponse(400, "plan must be 'starter' or 'pro'");
  }
  const priceId = plan === "starter" ? starterPrice : proPrice;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return errorResponse(401, "Not authenticated");
  const user = userData.user;

  // Fetch (or initialize) the user's subscription row.
  const { data: sub, error: subErr } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (subErr) return errorResponse(500, `Load subscription: ${subErr.message}`);

  let customerId = sub?.stripe_customer_id ?? null;

  if (!customerId) {
    const created = await stripeCall<StripeCustomer>(
      "/customers",
      {
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      },
      stripeKey,
    );
    customerId = created.id;
    await supabase
      .from("subscriptions")
      .update({ stripe_customer_id: customerId })
      .eq("user_id", user.id);
  }

  const session = await stripeCall<StripeCheckoutSession>(
    "/checkout/sessions",
    {
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      success_url: `${appUrl}/settings?stripe=success`,
      cancel_url: `${appUrl}/settings?stripe=cancel`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan },
      },
    },
    stripeKey,
  );

  return jsonResponse({ url: session.url });
});
