import { Fragment } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Calculator, Printer, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { DraftInput } from "@/components/ui/draft-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProject } from "@/hooks/useProjects";
import { useProjectWalls } from "@/hooks/useProjectWalls";
import { calculateBundle } from "@/lib/engine/adapter";
import type { CostDetailLine } from "@/lib/engine/types";

const CATEGORY_ORDER = [
  "Drilling",
  "Posting",
  "Wall Building",
  "Backfill & Gravel",
  "Engineering",
  "Other",
] as const;

const aud = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
});

function formatCurrency(n: number): string {
  return aud.format(n);
}

function formatQty(n: number): string {
  if (Math.abs(n) < 10) return n.toFixed(2);
  if (Math.abs(n) < 100) return n.toFixed(1);
  return n.toFixed(0);
}

/**
 * Cost Breakdown — one consolidated table, grouped into category
 * sections with subtotals and a grand total. Each line shows the
 * engine's estimated quantity plus an editable override; overrides
 * persist into projects.cost_overrides.
 */
export function CostBreakdownPage() {
  const { id } = useParams<{ id: string }>();
  const { project, loading: projectLoading, update } = useProject(id);
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
  const detail = bundle.costBreakdownDetail;
  const overrides = project.cost_overrides ?? {};
  const hasOverrides = Object.keys(overrides).length > 0;

  const byCategory = new Map<string, CostDetailLine[]>();
  for (const line of detail.lines) {
    const bucket = byCategory.get(line.category) ?? [];
    bucket.push(line);
    byCategory.set(line.category, bucket);
  }
  const cats = CATEGORY_ORDER.filter((c) => byCategory.has(c));

  function setOverride(lineId: string, value: number | undefined) {
    const next = { ...overrides };
    if (value === undefined) delete next[lineId];
    else next[lineId] = value;
    void update({ cost_overrides: next });
  }

  function clearOverrides() {
    void update({ cost_overrides: {} });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        eyebrow="Estimate"
        icon={Calculator}
        as="h2"
        title="Cost Breakdown"
        subtitle="Auto-calculated from take-off. Override any quantity to reflect actual job needs."
        actions={
          <>
            {hasOverrides && (
              <Button variant="outline" onClick={clearOverrides}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset overrides
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </>
        }
      />

      {detail.lines.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No cost lines yet. Add walls in the Take Off page.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-24 text-right">Est. qty</TableHead>
                  <TableHead className="w-28 text-right">Override</TableHead>
                  <TableHead className="w-16">Unit</TableHead>
                  <TableHead className="w-28 text-right">Rate</TableHead>
                  <TableHead className="w-32 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cats.map((cat) => {
                  const lines = byCategory.get(cat) ?? [];
                  const subtotal = detail.categoryTotals[cat] ?? 0;
                  return (
                    <Fragment key={cat}>
                      <TableRow className="bg-sky-50/70 hover:bg-sky-50/70 print:bg-transparent">
                        <TableCell
                          colSpan={5}
                          className="py-1.5 text-xs font-semibold uppercase tracking-wide"
                        >
                          {cat}
                        </TableCell>
                        <TableCell className="py-1.5 text-right text-xs font-semibold tabular-nums">
                          {formatCurrency(subtotal)}
                        </TableCell>
                      </TableRow>
                      {lines.map((l) => {
                        const isOverridden = l.qtyOverride !== undefined;
                        return (
                          <TableRow key={l.id}>
                            <TableCell>{l.description}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {formatQty(l.qtyEstimated)}
                            </TableCell>
                            <TableCell className="text-right">
                              <DraftInput
                                type="number"
                                step="0.1"
                                className={`ml-auto h-7 w-24 text-right text-xs ${
                                  isOverridden ? "border-primary" : ""
                                }`}
                                placeholder={formatQty(l.qtyEstimated)}
                                value={
                                  l.qtyOverride !== undefined
                                    ? String(l.qtyOverride)
                                    : ""
                                }
                                onCommit={(v) => {
                                  if (v.trim() === "") {
                                    setOverride(l.id, undefined);
                                  } else {
                                    const n = parseFloat(v);
                                    setOverride(
                                      l.id,
                                      Number.isNaN(n) ? undefined : n,
                                    );
                                  }
                                }}
                              />
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {l.unit}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {formatCurrency(l.rate)}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {formatCurrency(l.total)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  );
                })}
                <TableRow className="border-t-2 bg-muted/30 font-semibold hover:bg-muted/30">
                  <TableCell colSpan={5} className="py-2">
                    Total cost
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ex GST, before markup / margin
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-right text-base tabular-nums">
                    {formatCurrency(detail.grandTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
