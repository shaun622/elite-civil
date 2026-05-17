import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Archive, ArrowLeft, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EditProjectDialog } from "@/components/projects/EditProjectDialog";
import { useProject } from "@/hooks/useProjects";
import { timeAgo } from "@/lib/format";

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { project, loading, error, update, archive, restore, remove } =
    useProject(id);

  const [actionError, setActionError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  if (!id) return <Navigate to="/dashboard" replace />;

  async function runAction(fn: () => Promise<unknown>) {
    setActionError(null);
    setActing(true);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActing(false);
    }
  }

  async function onDelete() {
    if (!confirm("Delete this project permanently? This cannot be undone.")) {
      return;
    }
    setActionError(null);
    setActing(true);
    try {
      await remove();
      navigate("/dashboard");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed.");
      setActing(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <Header />

      <main className="container py-8">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>

        {loading && (
          <div className="mt-6 h-40 animate-pulse rounded-lg border bg-card" />
        )}

        {!loading && error && (
          <Alert variant="destructive" className="mt-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading && project && (
          <>
            <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {project.name}
                  </h1>
                  {project.status === "archived" && (
                    <Badge variant="muted">Archived</Badge>
                  )}
                  {project.status === "draft" && (
                    <Badge variant="outline">Draft</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {project.client_name ?? "No client"} ·{" "}
                  {project.site_address ?? "No site address"} · Updated{" "}
                  {timeAgo(project.updated_at)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <EditProjectDialog
                  project={project}
                  onSave={update}
                  trigger={
                    <Button variant="outline" size="sm" className="gap-2">
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                  }
                />
                {project.status === "archived" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={acting}
                    onClick={() => runAction(restore)}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restore
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={acting}
                    onClick={() => runAction(archive)}
                  >
                    <Archive className="h-4 w-4" />
                    Archive
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-destructive hover:text-destructive"
                  disabled={acting}
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>

            {actionError && (
              <Alert variant="destructive" className="mt-6">
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            )}

            {project.notes && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-base">Notes</CardTitle>
                </CardHeader>
                <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {project.notes}
                </CardContent>
              </Card>
            )}

            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">Drawings</CardTitle>
                <CardDescription>
                  Upload + AI extraction ship in the next step of the build.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
                  PDF upload area lands in Step 3.
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
