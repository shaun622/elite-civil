import { Navigate, useParams } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useProject } from "@/hooks/useProjects";

/**
 * Per-project Settings — edits the project's metadata (name, client,
 * quote number, T&Cs description). Rates, prices, engineering params
 * live on `/projects/:id/pricing` (Pricing & Performance) since they
 * have their own dedicated editor.
 */
export function ProjectSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { project, loading, update } = useProject(id);

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
            <Input
              value={project.name}
              onChange={(e) => void update({ name: e.target.value })}
            />
          </LabeledField>
          <LabeledField label="Quote number">
            <Input
              placeholder="e.g. Q1428"
              value={project.quote_number ?? ""}
              onChange={(e) =>
                void update({
                  quote_number: e.target.value || null,
                })
              }
            />
          </LabeledField>

          <Separator />

          <LabeledField label="Client">
            <Input
              placeholder="e.g. Winslow"
              value={project.client_name ?? ""}
              onChange={(e) =>
                void update({
                  client_name: e.target.value || null,
                })
              }
            />
          </LabeledField>
          <LabeledField label="Contact name">
            <Input
              placeholder="e.g. Bala Krishnan"
              value={project.contact_name ?? ""}
              onChange={(e) =>
                void update({
                  contact_name: e.target.value || null,
                })
              }
            />
          </LabeledField>
          <LabeledField label="Contact email">
            <Input
              type="email"
              placeholder="e.g. contact@example.com"
              value={project.contact_email ?? ""}
              onChange={(e) =>
                void update({
                  contact_email: e.target.value || null,
                })
              }
            />
          </LabeledField>
          <LabeledField label="Site address">
            <Input
              placeholder="e.g. Lot 12 Riverbend Drive"
              value={project.site_address ?? ""}
              onChange={(e) =>
                void update({
                  site_address: e.target.value || null,
                })
              }
            />
          </LabeledField>

          <Separator />

          <LabeledField label="Project description (T&Cs preamble)">
            <Textarea
              className="min-h-[80px]"
              value={project.description ?? ""}
              onChange={(e) =>
                void update({
                  description: e.target.value || null,
                })
              }
            />
          </LabeledField>
          <LabeledField label="Notes">
            <Textarea
              className="min-h-[60px]"
              placeholder="Internal notes (not shown to clients)"
              value={project.notes ?? ""}
              onChange={(e) =>
                void update({
                  notes: e.target.value || null,
                })
              }
            />
          </LabeledField>
        </CardContent>
      </Card>
    </div>
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
