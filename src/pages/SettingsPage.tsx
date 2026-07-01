import { useEffect, useState, type FormEvent } from "react";
import { Building, CreditCard, Loader2, User, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";
import { changePassword } from "@/lib/api/profile";
import {
  cancelInvite,
  canManageMembers,
  inviteMember,
  listOrgMembers,
  listPendingInvites,
  removeMember,
  updateMemberRole,
  updateOrgBranding,
  type OrgInvite,
  type OrgMember,
  type OrgRole,
} from "@/lib/api/organization";
import {
  loadBillingSnapshot,
  openStripeBillingPortal,
  startStripeCheckout,
  type BillingSnapshot,
} from "@/lib/api/subscriptions";
import { cn } from "@/lib/utils";

type Tab = "profile" | "company" | "team" | "billing";

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
              active={tab === "team"}
              onClick={() => setTab("team")}
              icon={<Users className="h-4 w-4" />}
              label="Team"
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
            {tab === "company" && <CompanyTab />}
            {tab === "team" && <TeamTab />}
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

function CompanyTab() {
  const { org, role, loading, refresh } = useOrg();
  const editable = canManageMembers(role); // owner / admin
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    setName(org?.company_name ?? "");
    setAddress(org?.company_address ?? "");
    setLogoUrl(org?.company_logo_url ?? "");
  }, [org]);

  if (loading) {
    return (
      <section className="rounded-lg border bg-card p-6">
        <Loader2 className="h-4 w-4 animate-spin" />
      </section>
    );
  }
  if (!org) {
    return (
      <section className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        No company found for your account.
      </section>
    );
  }

  async function onSave() {
    if (!org) return;
    setError(null);
    setDone(null);
    setSaving(true);
    try {
      await updateOrgBranding(org.id, {
        company_name: name,
        company_address: address,
        company_logo_url: logoUrl,
      });
      await refresh();
      setDone("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    (org.company_name ?? "") !== name ||
    (org.company_address ?? "") !== address ||
    (org.company_logo_url ?? "") !== logoUrl;

  return (
    <section className="rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold">Company profile</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Shared by your whole team — used on branded PDF exports.
        {!editable && " Only an owner or admin can edit it."}
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
            disabled={!editable}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. BE Landscape Construction"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="company-address">Business address</Label>
          <Textarea
            id="company-address"
            rows={3}
            value={address}
            disabled={!editable}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, suburb, state, postcode"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="company-logo">Logo URL (optional)</Label>
          <Input
            id="company-logo"
            value={logoUrl}
            disabled={!editable}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…"
          />
          <p className="text-xs text-muted-foreground">
            Direct image URL (PNG / JPG). In-app logo upload is on the roadmap.
          </p>
        </div>

        {editable && (
          <Button onClick={onSave} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
    </section>
  );
}

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};
const ROLE_HELP: Record<OrgRole, string> = {
  owner: "Full access + billing",
  admin: "Manage team + edit everything (not billing)",
  editor: "Create & edit takeoffs",
  viewer: "Read-only",
};

function TeamTab() {
  const { user } = useAuth();
  const { org, role, loading: orgLoading } = useOrg();
  const manage = canManageMembers(role);

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] =
    useState<Exclude<OrgRole, "owner">>("editor");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [m, inv] = await Promise.all([
        listOrgMembers(),
        manage ? listPendingInvites() : Promise.resolve([] as OrgInvite[]),
      ]);
      setMembers(m);
      setInvites(inv);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the team.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!orgLoading) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLoading, manage]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!org || !user) return;
    const email = inviteEmail.trim();
    if (!email) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await inviteMember(org.id, user.id, email, inviteRole);
      setInviteEmail("");
      setNotice(
        `Invited ${email} as ${ROLE_LABEL[inviteRole]}. They join when they sign in with that email.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send invite.");
    } finally {
      setBusy(false);
    }
  }

  async function onRoleChange(userId: string, next: OrgRole) {
    setBusy(true);
    setError(null);
    try {
      await updateMemberRole(userId, next);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change role.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(userId: string, email: string | null) {
    if (!confirm(`Remove ${email ?? "this member"} from the company?`)) return;
    setBusy(true);
    setError(null);
    try {
      await removeMember(userId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove member.");
    } finally {
      setBusy(false);
    }
  }

  async function onCancelInvite(id: string) {
    setBusy(true);
    setError(null);
    try {
      await cancelInvite(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel invite.");
    } finally {
      setBusy(false);
    }
  }

  if (orgLoading || loading) {
    return (
      <section className="rounded-lg border bg-card p-6">
        <Loader2 className="h-4 w-4 animate-spin" />
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">Team members</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone in {org?.company_name || org?.name || "your company"}.
          {manage
            ? " You can change roles and remove people."
            : " Only an owner or admin can change these."}
        </p>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <ul className="mt-5 divide-y">
          {members.map((m) => {
            const isSelf = m.user_id === user?.id;
            const isOwner = m.role === "owner";
            // Owner/admin may change anyone except the Owner; they can't demote
            // the owner (also enforced by RLS) and can't promote to owner.
            const canChange = manage && !isOwner;
            return (
              <li
                key={m.user_id}
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.email ?? m.user_id}
                    {isSelf && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (you)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_HELP[m.role]}
                  </p>
                </div>

                {canChange ? (
                  <select
                    value={m.role}
                    disabled={busy}
                    onChange={(e) =>
                      onRoleChange(m.user_id, e.target.value as OrgRole)
                    }
                    className="h-8 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                ) : (
                  <Badge variant={isOwner ? "default" : "outline"}>
                    {ROLE_LABEL[m.role]}
                  </Badge>
                )}

                {canChange && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRemove(m.user_id, m.email)}
                    title="Remove from company"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {manage && (
        <section className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold">Invite a teammate</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            They get access when they sign in with this email. (Automatic invite
            emails are coming — for now, tell them to sign up with this address.)
          </p>

          {notice && (
            <Alert className="mt-4">
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={onInvite} className="mt-4 flex flex-wrap items-end gap-2">
            <div className="grid min-w-[220px] flex-1 gap-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@company.com"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as Exclude<OrgRole, "owner">)
                }
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <Button type="submit" disabled={busy || !inviteEmail.trim()}>
              Invite
            </Button>
          </form>

          {invites.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold">Pending invites</h3>
              <ul className="mt-2 divide-y">
                {invites.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center gap-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">{inv.email}</span>
                    <Badge variant="outline">{ROLE_LABEL[inv.role]}</Badge>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onCancelInvite(inv.id)}
                      title="Cancel invite"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
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
