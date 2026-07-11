import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, FileUp, FolderKanban, PlayCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";
import { ProjectsTable } from "@/components/projects/ProjectsTable";
import { VirtualTour } from "@/components/onboarding/VirtualTour";
import { useProjects } from "@/hooks/useProjects";
import { useProjectValues } from "@/hooks/useProjectValues";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/hooks/useAuth";

const TOUR_SEEN_KEY = "takeoffmate.tourSeen";

export function DashboardPage() {
  const { projects, loading, error } = useProjects();
  const { values, loading: valuesLoading } = useProjectValues(projects);
  const { org } = useOrg();
  const { user } = useAuth();
  const [tourOpen, setTourOpen] = useState(false);

  const hasProjects = (projects?.length ?? 0) > 0;
  const heading = org?.company_name || org?.name || "Your projects";

  // Show the tour once per browser for a fresh user.
  useEffect(() => {
    if (localStorage.getItem(TOUR_SEEN_KEY) !== "1") {
      setTourOpen(true);
      try {
        localStorage.setItem(TOUR_SEEN_KEY, "1");
      } catch {
        /* ignore */
      }
    }
  }, []);

  return (
    <main className="container space-y-6 py-8">
      <PageHeader
        eyebrow="Workspace"
        icon={FolderKanban}
        title={heading}
        subtitle={`Welcome back${user?.email ? `, ${user.email}` : ""}.`}
      />

      {/* CTA */}
      <Card className="bg-brand-gradient overflow-hidden border-0 text-white shadow-md">
        <CardContent className="relative flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
          {/* soft glow accents */}
          <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-sky-200/20 blur-3xl" />
          <div className="relative flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-inset ring-white/25">
              <FileUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold">Ready to get your takeoff done?</h2>
              <p className="text-sm text-sky-100">
                Upload drawings and price your retaining walls.
              </p>
            </div>
          </div>
          <div className="relative flex shrink-0 gap-2">
            <NewProjectDialog
              trigger={
                <Button
                  variant="secondary"
                  className="gap-2 bg-white text-blue-700 shadow-sm hover:bg-sky-50"
                >
                  <Plus className="h-4 w-4" />
                  Create project
                </Button>
              }
            />
            <Button
              variant="outline"
              className="gap-2 border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
              onClick={() => setTourOpen(true)}
            >
              How it works
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setTourOpen(true)}
        >
          <PlayCircle className="h-4 w-4" />
          Take virtual tour
        </Button>
        <Button variant="outline" size="sm" className="gap-2" asChild>
          <Link to="/help">
            <BookOpen className="h-4 w-4" />
            Documentation
          </Link>
        </Button>
      </div>

      {/* Projects */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Your projects
            </h2>
            <p className="text-sm text-muted-foreground">
              Manage your takeoff projects.
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
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && (
          <div className="h-64 animate-pulse rounded-lg border bg-card" />
        )}

        {!loading && !hasProjects && (
          <div className="rounded-lg border border-dashed bg-card p-12 text-center">
            <h3 className="text-lg font-semibold">No projects yet</h3>
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
          <ProjectsTable
            projects={projects!}
            values={values}
            valuesLoading={valuesLoading}
          />
        )}
      </div>

      <VirtualTour open={tourOpen} onOpenChange={setTourOpen} />
    </main>
  );
}
