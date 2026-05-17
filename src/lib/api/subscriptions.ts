import { supabase } from "@/lib/supabase";

export type Subscription = {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: "trial" | "starter" | "pro";
  status: "trial" | "active" | "past_due" | "cancelled" | "incomplete";
  current_period_start: string | null;
  current_period_end: string | null;
  drawings_used_this_period: number;
  drawings_limit: number | null;
  storage_bytes_limit: number | null;
  created_at: string;
  updated_at: string;
};

export type StorageUsage = {
  user_id: string;
  drawing_bytes: number;
  page_bytes: number;
  total_bytes: number;
};

export type BillingSnapshot = {
  subscription: Subscription | null;
  usage: StorageUsage;
};

export async function loadBillingSnapshot(
  userId: string,
): Promise<BillingSnapshot> {
  const [{ data: sub, error: subErr }, { data: usage, error: usageErr }] =
    await Promise.all([
      supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_storage_usage")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
  if (subErr) throw subErr;
  if (usageErr) throw usageErr;
  return {
    subscription: (sub as Subscription) ?? null,
    usage:
      (usage as StorageUsage) ?? {
        user_id: userId,
        drawing_bytes: 0,
        page_bytes: 0,
        total_bytes: 0,
      },
  };
}

export async function startStripeCheckout(
  plan: "starter" | "pro",
): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke<
    { url: string } | { error: string }
  >("create-checkout-session", { body: { plan } });
  if (error) {
    type CtxErr = { context?: Response | { response?: Response } };
    const ctx = (error as unknown as CtxErr).context;
    const response =
      ctx instanceof Response
        ? ctx
        : ctx && "response" in ctx
          ? ctx.response
          : undefined;
    if (response) {
      try {
        const body = (await response.clone().json()) as { error?: string };
        if (body?.error) throw new Error(body.error);
      } catch {
        // not JSON; fall through
      }
    }
    throw error;
  }
  if (!data || !("url" in data) || !data.url) {
    throw new Error(
      data && "error" in data && typeof data.error === "string"
        ? data.error
        : "Could not start checkout",
    );
  }
  return { url: data.url };
}

export async function openStripeBillingPortal(): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke<
    { url: string } | { error: string }
  >("create-billing-portal", { body: {} });
  if (error) throw error;
  if (!data || !("url" in data) || !data.url) {
    throw new Error("Could not open billing portal");
  }
  return { url: data.url };
}
