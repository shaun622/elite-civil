import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { timeAgo } from "@/lib/format";
import type { Project } from "@/types/db";

export function ProjectCard({ project }: { project: Project }) {
  const isArchived = project.status === "archived";
  return (
    <Link
      to={`/projects/${project.id}`}
      className="group block rounded-lg outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card className="h-full transition-colors group-hover:border-foreground/20">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold leading-tight tracking-tight">
              {project.name}
            </h3>
            {isArchived && <Badge variant="muted">Archived</Badge>}
            {project.status === "draft" && (
              <Badge variant="outline">Draft</Badge>
            )}
          </div>

          <div className="space-y-0.5 text-sm text-muted-foreground">
            <p className="truncate">{project.client_name ?? "No client"}</p>
            <p className="truncate">
              {project.site_address ?? "No site address"}
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Updated {timeAgo(project.updated_at)}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
