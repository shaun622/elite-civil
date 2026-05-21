import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useProject } from "@/hooks/useProjects";
import { useProjectWalls } from "@/hooks/useProjectWalls";
import { calculateBundle } from "@/lib/engine/adapter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, Layers, Plus, Ruler, TrendingUp } from "lucide-react";

const aud = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatCurrency(value: number): string {
  return aud.format(value);
}

/**
 * Per-project Dashboard — summary cards (Total m², Cost Total, Quote
 * Total, Projected Profit) plus per-stage breakdowns. Mirrors BE
 * Landscapes' dashboard, with walls + config sourced from Supabase.
 */
export function ProjectDashboardPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { project, loading: projectLoading } = useProject(id);
  const { walls, loading: wallsLoading } = useProjectWalls(id);

  if (!id) return <Navigate to="/dashboard" replace />;

  if (projectLoading || wallsLoading) {
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

  const bundle = calculateBundle(walls, project);
  const hasWalls = bundle.entries.length > 0;
  const breakdown = bundle.costBreakdown;
  const config = bundle.config;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{project.name}</h2>
        <p className="text-muted-foreground">
          {project.client_name
            ? `Client: ${project.client_name}`
            : "Project overview and summary"}
          {project.quote_number ? ` · ${project.quote_number}` : ""}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total m²</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {hasWalls ? breakdown.totalM2.toFixed(1) : "0"}
            </div>
            <p className="text-xs text-muted-foreground">
              {walls.length} wall segments &middot; {bundle.uniqueLotCount} lots
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {hasWalls ? formatCurrency(breakdown.costTotal) : "$0"}
            </div>
            <p className="text-xs text-muted-foreground">
              {hasWalls ? formatCurrency(breakdown.costPerM2) : "$0"} /m²
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Quote Total (ex GST)
            </CardTitle>
            <Ruler className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {hasWalls ? formatCurrency(breakdown.totalExGST) : "$0"}
            </div>
            <p className="text-xs text-muted-foreground">
              {hasWalls ? formatCurrency(breakdown.pricePerM2) : "$0"} /m²
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Projected Profit
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {hasWalls ? formatCurrency(breakdown.projectedProfit) : "$0"}
            </div>
            <p className="text-xs text-muted-foreground">inc GST</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-stage breakdown */}
      {hasWalls && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Drilling</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Row label="Labour" value={breakdown.drilling.labour} />
              <Row label="Machine" value={breakdown.drilling.machine} />
              <RowTotal value={breakdown.drilling.total} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Posting</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Row label="Labour" value={breakdown.posting.labour} />
              <Row label="Concrete" value={breakdown.posting.concrete} />
              <Row label="Steel" value={breakdown.posting.steel} />
              <RowTotal value={breakdown.posting.total} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Wall Building</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Row label="Labour" value={breakdown.wallBuilding.labour} />
              <Row
                label="Concrete Sleepers"
                value={breakdown.wallBuilding.concreteSleepers}
              />
              <Row
                label="Super Sleepers"
                value={breakdown.wallBuilding.superSleepers}
              />
              <RowTotal value={breakdown.wallBuilding.total} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Backfill &amp; Gravel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Row label="Geofab" value={breakdown.backfill.geofab} />
              <Row label="Ag Line" value={breakdown.backfill.agLine} />
              <Row label="Gravel" value={breakdown.backfill.gravel} />
              <Row
                label="Labour & Machine"
                value={breakdown.backfill.labourAndMachine}
              />
              <RowTotal value={breakdown.backfill.total} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Engineering</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Row label="Form 15" value={breakdown.engineering.form15} />
              <Row label="Form 12" value={breakdown.engineering.form12} />
              <RowTotal value={breakdown.engineering.total} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Markup &amp; Margin</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Row
                label={`Markup (${(config.admin.markup * 100).toFixed(0)}%)`}
                value={breakdown.markup}
              />
              <Row
                label={`Margin (${(config.admin.margin * 100).toFixed(0)}%)`}
                value={breakdown.marginAmount}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {!hasWalls && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
            <Ruler className="h-12 w-12 text-muted-foreground/50" />
            <div className="space-y-1 text-center">
              <CardTitle>No wall data yet</CardTitle>
              <CardDescription>
                Add wall measurements in the Take Off tab to see cost
                calculations.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => navigate(`/projects/${id}/takeoff`)}>
                <Plus className="mr-2 h-4 w-4" />
                Go to Take Off
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(`/projects/${id}/drawings`)}
              >
                Measure from PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{formatCurrency(value)}</span>
    </div>
  );
}

function RowTotal({ value }: { value: number }) {
  return (
    <div className="flex justify-between border-t pt-1 font-medium">
      <span>Total</span>
      <span>{formatCurrency(value)}</span>
    </div>
  );
}
