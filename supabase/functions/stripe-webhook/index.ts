// stripe-webhook edge function.
//
// POST /functions/v1/stripe-webhook
// Body: raw Stripe event JSON
// Header: Stripe-Signature
//
// This endpoint MUST be deployed with --no-verify-jwt because Stripe doesn't
// send a Supabase user JWT — it sends its own HMAC signature, which we
// verify here.
//
// Required environment / secrets:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET
//   SUPABASE_SERVICE_ROLE_KEY  (writes bypass RLS for system events)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import {
  CORS_HEADERS,
  errorResponse,
  jsonResponse,
  stripeCall,
  verifyStripeSignature,
} from "../_shared/stripe.ts";

type StripeSubscription = {
  id: string;
  status: string;
  customer: string;
  current_period_start: number;
  current_period_end: number;
  items: {
    data: Array<{
      price: { id: string };
    }>;
  };
  metadata: { supabase_user_id?: string; plan?: string };
};

type StripeInvoice = {
  id: string;
  customer: string;
  subscription: string | null;
  period_start: number;
  period_end: number;
};

type StripeCheckoutSession = {
  id: string;
  client_reference_id: string | null;
  customer: string | null;
  subscription: string | null;
};

const STARTER_LIMITS = {
  drawings_limit: 30,
  storage_bytes_limit: 5 * 1024 * 1024 * 1024,
};
const PRO_LIMITS = {
  drawings_limit: null as number | null,
  storage_bytes_limit: 50 * 1024 * 1024 * 1024,
};

function planFromPriceId(priceId: string): "starter" | "pro" | null {
  if (priceId === Deno.env.get("STRIPE_STARTER_PRICE_ID")) return "starter";
  if (priceId === Deno.env.get("STRIPE_PRO_PRICE_ID")) return "pro";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey) return errorResponse(500, "STRIPE_SECRET_KEY not configured");
  if (!webhookSecret) {
    return errorResponse(500, "STRIPE_WEBHOOK_SECRET not configured");
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse(500, "Supabase env not configured");
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get("Stripe-Signature");
  const ok = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);
  if (!ok) {
    return errorResponse(400, "Invalid Stripe signature");
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return errorResponse(400, "Webhook body was not JSON");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as unknown as StripeCheckoutSession;
        const userId = session.client_reference_id;
        if (userId && session.customer) {
          await admin
            .from("subscriptions")
            .update({
              stripe_customer_id: session.customer,
              stripe_subscription_id: session.subscription,
            })
            .eq("user_id", userId);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data
          .object as unknown as StripeSubscription;
        await applySubscription(admin, subscription, stripeKey);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data
          .object as unknown as StripeSubscription;
        await admin
          .from("subscriptions")
          .update({
            plan: "trial",
            status: "cancelled",
            drawings_limit: 0,
            storage_bytes_limit: 200 * 1024 * 1024,
          })
          .eq("stripe_customer_id", subscription.customer);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as unknown as StripeInvoice;
        await admin
          .from("subscriptions")
          .update({
            status: "active",
            drawings_used_this_period: 0,
            current_period_start: new Date(
              invoice.period_start * 1000,
            ).toISOString(),
            current_period_end: new Date(
              invoice.period_end * 1000,
            ).toISOString(),
          })
          .eq("stripe_customer_id", invoice.customer);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as unknown as StripeInvoice;
        await admin
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("stripe_customer_id", invoice.customer);
        break;
      }

      default:
        // Ignore unhandled events; Stripe sends a lot of them.
        break;
    }

    return jsonResponse({ received: true });
  } catch (err) {
    console.error("[stripe-webhook] handler error:", err);
    return errorResponse(
      500,
      err instanceof Error ? err.message : "webhook handler failed",
    );
  }
});

async function applySubscription(
  admin: ReturnType<typeof createClient>,
  subscription: StripeSubscription,
  stripeKey: string,
) {
  const priceId = subscription.items.data[0]?.price.id;
  const plan = priceId ? planFromPriceId(priceId) : null;
  if (!plan) return;

  const limits = plan === "starter" ? STARTER_LIMITS : PRO_LIMITS;

  // Find the user via metadata first; fall back to a Stripe lookup by
  // customer (in case metadata wasn't set on creation).
  let userId = subscription.metadata.supabase_user_id ?? null;
  if (!userId) {
    type StripeCustomer = {
      metadata?: { supabase_user_id?: string };
    };
    const customer = await stripeCall<StripeCustomer>(
      `/customers/${subscription.customer}`,
      null,
      stripeKey,
      "GET",
    );
    userId = customer.metadata?.supabase_user_id ?? null;
  }

  if (!userId) {
    console.error(
      "[stripe-webhook] could not resolve user for subscription",
      subscription.id,
    );
    return;
  }

  await admin
    .from("subscriptions")
    .update({
      stripe_customer_id: subscription.customer,
      stripe_subscription_id: subscription.id,
      plan,
      status: mapStripeStatus(subscription.status),
      drawings_limit: limits.drawings_limit,
      storage_bytes_limit: limits.storage_bytes_limit,
      current_period_start: new Date(
        subscription.current_period_start * 1000,
      ).toISOString(),
      current_period_end: new Date(
        subscription.current_period_end * 1000,
      ).toISOString(),
    })
    .eq("user_id", userId);
}

function mapStripeStatus(
  stripeStatus: string,
): "active" | "past_due" | "cancelled" | "incomplete" | "trial" {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "cancelled";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    default:
      return "incomplete";
  }
}
