import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Loader2, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DraftInput, DraftTextarea } from "@/components/ui/draft-input";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/hooks/useProjects";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/hooks/useAuth";
import {
  addProjectMember,
  getProjectAccess,
  listOrgMembers,
  removeProjectMember,
  setProjectVisibility,
  type OrgMember,
  type ProjectVisibility,
} from "@/lib/api/organization";
import { cn } from "@/lib/utils";

/**
 * Per-project Settings — edits the project's metadata (name, client,
 * quote number, T&Cs description). Rates, prices, engineering params
 * live on `/projects/:id/pricing` (Pricing & Performance) since they
 * have their own dedicated editor.
 */
export function ProjectSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { project, loading, update, remove } = useProject(id);
  const { canManageMembers } = useOrg();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function onDelete() {
    if (!project) return;
    if (
      !confirm(
        `Delete "${project.name}"? This permanently removes the project and all its drawings and walls. This can't be undone.`,
      )
    ) {
      return;
    }
    setDeleteError(null);
    setDeleting(true);
    try {
      await remove();
      // Full reload so the sidebar's project list refetches too.
      window.location.assign("/dashboard");
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete the project.",
      );
      setDeleting(false);
    }
  }

  if (!id) return <Navigate to="/dashboard" replace />;
  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading project…</p>
      </div>
    );
  }
  if (!project) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Project Settings
        </h2>
        <p className="text-muted-foreground">
          Manage project details and metadata.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project details</CardTitle>
          <CardDescription>
            Basic project information used in the quotation and fee proposal.
            Pricing, rates, and engineering parameters live in Pricing &amp;
            Performance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LabeledField label="Project name">
            <DraftInput
              value={project.name}
              onCommit={(v) => void update({ name: v })}
            />
          </LabeledField>
          <LabeledField label="Quote number">
            <DraftInput
              placeholder="e.g. Q1428"
              value={project.quote_number ?? ""}
              onCommit={(v) => void update({ quote_number: v || null })}
            />
          </LabeledField>

          <Separator />

          <LabeledField label="Client">
            <DraftInput
              placeholder="e.g. Winslow"
              value={project.client_name ?? ""}
              onCommit={(v) => void update({ client_name: v || null })}
            />
          </LabeledField>
          <LabeledField label="Contact name">
            <DraftInput
              placeholder="e.g. Bala Krishnan"
              value={project.contact_name ?? ""}
              onCommit={(v) => void update({ contact_name: v || null })}
            />
          </LabeledField>
          <LabeledField label="Contact email">
            <DraftInput
              type="email"
              placeholder="e.g. contact@example.com"
              value={project.contact_email ?? ""}
              onCommit={(v) => void update({ contact_email: v || null })}
            />
          </LabeledField>
          <LabeledField label="Site address">
            <DraftInput
              placeholder="e.g. Lot 12 Riverbend Drive"
              value={project.site_address ?? ""}
              onCommit={(v) => void update({ site_address: v || null })}
            />
          </LabeledField>

          <Separator />

          <LabeledField label="Project description (T&Cs preamble)">
            <DraftTextarea
              className="min-h-[80px]"
              value={project.description ?? ""}
              onCommit={(v) => void update({ description: v || null })}
            />
          </LabeledField>
          <LabeledField label="Notes">
            <DraftTextarea
              className="min-h-[60px]"
              placeholder="Internal notes (not shown to clients)"
              value={project.notes ?? ""}
              onCommit={(v) => void update({ notes: v || null })}
            />
          </LabeledField>
        </CardContent>
      </Card>

      {canManageMembers && id && <AccessCard projectId={id} />}

      {canManageMembers && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              Danger zone
            </CardTitle>
            <CardDescription>
              Deleting a project permanently removes it and all of its drawings
              and walls for the whole company. This can't be undone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {deleteError && (
              <Alert variant="destructive">
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            )}
            <Button
              type="button"
              variant="destructive"
              className="gap-2"
              disabled={deleting}
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? "Deleting…" : "Delete project"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AccessCard({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [visibility, setVisibility] = useState<ProjectVisibility>("org");
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [access, orgMembers] = await Promise.all([
        getProjectAccess(projectId),
        listOrgMembers(),
      ]);
      setVisibility(access.visibility);
      setMemberIds(new Set(access.memberIds));
      setMembers(orgMembers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load access.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function changeVisibility(next: ProjectVisibility) {
    if (next === visibility) return;
    setBusy(true);
    setError(null);
    try {
      await setProjectVisibility(projectId, next);
      await load(); // trigger auto-adds the creator when restricting
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change access.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleMember(userId: string, on: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (on) await addProjectMember(projectId, userId, user!.id);
      else await removeProjectMember(projectId, userId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update member.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Access</CardTitle>
        <CardDescription>
          Who in your company can see this project.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <div className="inline-flex rounded-md border p-0.5">
              {(
                [
                  ["org", "Whole company"],
                  ["restricted", "Restricted"],
                ] as [ProjectVisibility, string][]
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  disabled={busy}
                  onClick={() => changeVisibility(val)}
                  className={cn(
                    "rounded px-3 py-1.5 text-sm transition-colors",
                    visibility === val
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {visibility === "org" ? (
              <p className="text-sm text-muted-foreground">
                Everyone in the company can open this project.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Owners and admins always have access. Tick the editors and
                  viewers who can see this project.
                </p>
                <ul className="divide-y rounded-md border">
                  {members.map((m) => {
                    const always = m.role === "owner" || m.role === "admin";
                    const on = always || memberIds.has(m.user_id);
                    return (
                      <li
                        key={m.user_id}
                        className="flex items-center gap-3 px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={always || busy}
                          onChange={(e) =>
                            toggleMember(m.user_id, e.target.checked)
                          }
                          className="h-4 w-4 accent-foreground"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {m.email ?? m.user_id}
                        </span>
                        {always ? (
                          <span className="text-xs text-muted-foreground">
                            always
                          </span>
                        ) : (
                          <Badge variant="outline">{m.role}</Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LabeledField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
