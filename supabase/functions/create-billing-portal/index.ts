// create-billing-portal edge function.
//
// POST /functions/v1/create-billing-portal
// Body: {}
//
// Returns a Stripe Customer Portal URL the user can visit to manage their
// subscription (cancel, change payment method, view invoices). The user
// must already have a stripe_customer_id on file — created the first time
// they upgrade via create-checkout-session.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import {
  CORS_HEADERS,
  errorResponse,
  jsonResponse,
  stripeCall,
} from "../_shared/stripe.ts";

type StripePortalSession = { id: string; url: string };

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
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const appUrl =
    Deno.env.get("APP_PUBLIC_URL") ?? "https://elite-civil.pages.dev";

  if (!stripeKey) return errorResponse(500, "STRIPE_SECRET_KEY not configured");
  if (!supabaseUrl || !supabaseAnonKey) {
    return errorResponse(500, "Supabase env not configured");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return errorResponse(401, "Not authenticated");

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return errorResponse(
      400,
      "No Stripe customer on file. Upgrade first to create one.",
    );
  }

  const session = await stripeCall<StripePortalSession>(
    "/billing_portal/sessions",
    {
      customer: sub.stripe_customer_id,
      return_url: `${appUrl}/settings`,
    },
    stripeKey,
  );

  return jsonResponse({ url: session.url });
});
