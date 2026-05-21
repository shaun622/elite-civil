import { useEffect, useState, type FormEvent } from "react";
import { Building, CreditCard, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import {
  changePassword,
  getProfile,
  updateProfile,
  type ProfileRow,
} from "@/lib/api/profile";
import {
  loadBillingSnapshot,
  openStripeBillingPortal,
  startStripeCheckout,
  type BillingSnapshot,
} from "@/lib/api/subscriptions";
import { cn } from "@/lib/utils";

type Tab = "profile" | "company" | "billing";

export function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("profile");

  return (
    <main className="container py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account, company branding, and subscription.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[200px_1fr]">
          <nav className="flex flex-row gap-2 lg:flex-col">
            <TabButton
              active={tab === "profile"}
              onClick={() => setTab("profile")}
              icon={<User className="h-4 w-4" />}
              label="Profile"
            />
            <TabButton
              active={tab === "company"}
              onClick={() => setTab("company")}
              icon={<Building className="h-4 w-4" />}
              label="Company"
            />
            <TabButton
              active={tab === "billing"}
              onClick={() => setTab("billing")}
              icon={<CreditCard className="h-4 w-4" />}
              label="Billing"
            />
          </nav>

          <div className="space-y-6">
            {tab === "profile" && <ProfileTab />}
            {tab === "company" && user && <CompanyTab userId={user.id} />}
            {tab === "billing" && user && <BillingTab userId={user.id} />}
          </div>
        </div>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ProfileTab() {
  const { user } = useAuth();
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (pwd.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (pwd !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(pwd);
      setDone("Password updated.");
      setPwd("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold">Profile</h2>
      <div className="mt-4 grid gap-2">
        <Label>Email</Label>
        <Input value={user?.email ?? ""} disabled />
        <p className="text-xs text-muted-foreground">
          Changing your email isn't supported yet. Contact support if needed.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <h3 className="text-sm font-semibold">Change password</h3>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {done && (
          <Alert>
            <AlertDescription>{done}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-2">
          <Label htmlFor="pwd">New password</Label>
          <Input
            id="pwd"
            type="password"
            autoComplete="new-password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={submitting || !pwd}>
          {submitting ? "Updating…" : "Update password"}
        </Button>
      </form>
    </section>
  );
}

function CompanyTab({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getProfile(userId)
      .then((p) => {
        if (!active) return;
        setProfile(p);
        setName(p?.company_name ?? "");
        setAddress(p?.company_address ?? "");
        setLogoUrl(p?.company_logo_url ?? "");
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load profile.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  async function onSave() {
    setError(null);
    setDone(null);
    setSaving(true);
    try {
      const updated = await updateProfile(userId, {
        company_name: name,
        company_address: address,
        company_logo_url: logoUrl,
      });
      setProfile(updated);
      setDone("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-lg border bg-card p-6">
        <Loader2 className="h-4 w-4 animate-spin" />
      </section>
    );
  }

  const dirty =
    (profile?.company_name ?? "") !== name ||
    (profile?.company_address ?? "") !== address ||
    (profile?.company_logo_url ?? "") !== logoUrl;

  return (
    <section className="rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold">Company branding</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Used in your branded PDF exports.
      </p>

      <div className="mt-6 space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {done && (
          <Alert>
            <AlertDescription>{done}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-2">
          <Label htmlFor="company-name">Company name</Label>
          <Input
            id="company-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Elite Civil"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="company-address">Business address</Label>
          <Textarea
            id="company-address"
            rows={3}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, suburb, state, postcode"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="company-logo">Logo URL (optional)</Label>
          <Input
            id="company-logo"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…"
          />
          <p className="text-xs text-muted-foreground">
            Direct image URL (PNG / JPG). In-app logo upload is on the
            roadmap.
          </p>
        </div>

        <Button onClick={onSave} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </section>
  );
}

function BillingTab({ userId }: { userId: string }) {
  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadBillingSnapshot(userId)
      .then((s) => {
        if (active) setSnapshot(s);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load billing.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  async function upgrade(plan: "starter" | "pro") {
    setError(null);
    setActionBusy(true);
    try {
      const { url } = await startStripeCheckout(plan);
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not start checkout. Stripe may not be configured yet.",
      );
      setActionBusy(false);
    }
  }

  async function openPortal() {
    setError(null);
    setActionBusy(true);
    try {
      const { url } = await openStripeBillingPortal();
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not open billing portal.",
      );
      setActionBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-lg border bg-card p-6">
        <Loader2 className="h-4 w-4 animate-spin" />
      </section>
    );
  }

  const sub = snapshot?.subscription;
  const used = sub?.drawings_used_this_period ?? 0;
  const limit = sub?.drawings_limit ?? null;
  const storageUsed = snapshot?.usage.total_bytes ?? 0;
  const storageLimit = sub?.storage_bytes_limit ?? null;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Current plan</h2>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={sub?.plan === "trial" ? "outline" : "default"}>
                {(sub?.plan ?? "trial").toUpperCase()}
              </Badge>
              {sub?.status === "past_due" && (
                <Badge variant="destructive">Past due</Badge>
              )}
            </div>
          </div>
          {sub?.stripe_subscription_id && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={actionBusy}
              onClick={openPortal}
            >
              Manage in Stripe
            </Button>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <UsageBar
            label="Drawings this period"
            used={used}
            limit={limit}
            formatValue={(n) => String(n)}
          />
          <UsageBar
            label="Storage"
            used={storageUsed}
            limit={storageLimit}
            formatValue={(n) => `${(n / 1024 / 1024).toFixed(1)} MB`}
          />
        </div>

        {sub?.current_period_end && (
          <p className="mt-4 text-xs text-muted-foreground">
            Current billing period ends{" "}
            {new Date(sub.current_period_end).toLocaleDateString()}.
          </p>
        )}
      </section>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">Change plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Stripe handles billing. Upgrading opens a secure Stripe Checkout
          page — your card never touches our servers.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            disabled={actionBusy || sub?.plan === "starter"}
            onClick={() => upgrade("starter")}
          >
            {sub?.plan === "starter" ? "Current: Starter" : "Upgrade to Starter (AUD $39/mo)"}
          </Button>
          <Button
            disabled={actionBusy || sub?.plan === "pro"}
            variant="outline"
            onClick={() => upgrade("pro")}
          >
            {sub?.plan === "pro" ? "Current: Pro" : "Upgrade to Pro (AUD $89/mo)"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function UsageBar({
  label,
  used,
  limit,
  formatValue,
}: {
  label: string;
  used: number;
  limit: number | null;
  formatValue: (n: number) => string;
}) {
  const pct =
    limit === null ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {formatValue(used)}{" "}
          {limit === null ? "/ unlimited" : `/ ${formatValue(limit)}`}
        </span>
      </div>
      {limit !== null && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full",
              pct >= 90
                ? "bg-red-500"
                : pct >= 70
                  ? "bg-amber-500"
                  : "bg-foreground",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
