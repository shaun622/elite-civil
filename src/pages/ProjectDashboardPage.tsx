import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useProject } from "@/hooks/useProjects";
import { useProjectWalls } from "@/hooks/useProjectWalls";
import { calculateBundle } from "@/lib/engine/adapter";
import { embedmentOpts } from "@/lib/engine/calculations";
import { computeHeightBands, resolveBandEdges } from "@/lib/engine/heightBands";
import { expandSegmentsByPricingBands } from "@/lib/engine/wallSections";
import { formatLength } from "@/lib/format";
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

      {/* Wall heights breakdown — walls, length and face area per configurable
          band (same bands as the Measure/Review "Summary by height band"). */}
      {hasWalls &&
        (() => {
          const round = embedmentOpts(config);
          const { bands, noHeight, totals } = computeHeightBands(
            expandSegmentsByPricingBands(walls, config),
            resolveBandEdges(config),
            round,
          );
          const cols = "grid grid-cols-[1fr_64px_116px_88px] gap-2";
          return (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Wall heights breakdown
                </CardTitle>
                <CardDescription>
                  Walls, length and face area per height band —{" "}
                  {round.enabled
                    ? `heights rounded up to ${round.incrementM} m (pricing basis)`
                    : "actual measured heights"}
                  . Adjust the bands on any Measure / Review page.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className={`${cols} px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground`}
                >
                  <span>Band</span>
                  <span className="text-right">Walls</span>
                  <span className="text-right">Length</span>
                  <span className="text-right">Area m²</span>
                </div>
                {bands.map((b, i) => (
                  <div
                    key={i}
                    className={`${cols} rounded px-2 py-1 text-sm tabular-nums ${
                      i % 2 === 1 ? "bg-muted/40" : ""
                    }`}
                  >
                    <span className="font-medium">{b.label}</span>
                    <span className="text-right text-muted-foreground">
                      {b.count}
                    </span>
                    <span className="text-right">
                      {b.count > 0 ? formatLength(b.lengthMm) : "—"}
                    </span>
                    <span className="text-right">
                      {b.count > 0 ? b.areaM2.toFixed(1) : "—"}
                    </span>
                  </div>
                ))}
                {noHeight.count > 0 && (
                  <div
                    className={`${cols} rounded bg-amber-50 px-2 py-1 text-sm tabular-nums text-amber-900`}
                  >
                    <span className="font-medium">Height not set</span>
                    <span className="text-right">{noHeight.count}</span>
                    <span className="text-right">
                      {formatLength(noHeight.lengthMm)}
                    </span>
                    <span className="text-right">—</span>
                  </div>
                )}
                <div
                  className={`${cols} mt-1 border-t px-2 pt-1.5 text-sm font-semibold tabular-nums`}
                >
                  <span>Total</span>
                  <span className="text-right">{totals.count}</span>
                  <span className="text-right">
                    {formatLength(totals.lengthMm)}
                  </span>
                  <span className="text-right">{totals.areaM2.toFixed(1)}</span>
                </div>
              </CardContent>
            </Card>
          );
        })()}

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
