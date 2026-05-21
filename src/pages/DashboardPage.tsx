import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";
import { useProjects } from "@/hooks/useProjects";

export function DashboardPage() {
  const { projects, loading, error } = useProjects();
  const hasProjects = (projects?.length ?? 0) > 0;

  return (
    <main className="container py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Group drawings and takeoffs by client or site.
            </p>
          </div>

          <NewProjectDialog
            trigger={
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New project
              </Button>
            }
          />
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-lg border bg-card"
              />
            ))}
          </div>
        )}

        {!loading && !hasProjects && (
          <div className="rounded-lg border border-dashed bg-card p-12 text-center">
            <h2 className="text-lg font-semibold">No projects yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Create your first project to start uploading drawings and
              extracting measurements.
            </p>
            <div className="mt-6">
              <NewProjectDialog
                trigger={
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    New project
                  </Button>
                }
              />
            </div>
          </div>
        )}

        {!loading && hasProjects && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects!.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
    </main>
  );
}
