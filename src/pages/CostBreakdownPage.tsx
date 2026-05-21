import { Navigate, useParams } from "react-router-dom";
import { Printer, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
 * Cost Breakdown — every category × line from the engine, with the
 * estimator's calculated quantity plus an editable override. Persists
 * overrides into `projects.cost_overrides` so all downstream pages
 * (Quotation, Dashboard cost totals) pick them up.
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
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Cost Breakdown
          </h2>
          <p className="text-muted-foreground">
            Auto-calculated from take-off. Override any quantity to reflect
            actual job needs.
          </p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

      {detail.lines.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No cost lines yet. Add walls in the Take Off page.
          </CardContent>
        </Card>
      ) : (
        <>
          {CATEGORY_ORDER.filter((cat) => byCategory.has(cat)).map((cat) => {
            const lines = byCategory.get(cat) ?? [];
            const subtotal = detail.categoryTotals[cat] ?? 0;
            return (
              <Card key={cat}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{cat}</span>
                    <Badge variant="secondary">{formatCurrency(subtotal)}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">
                          Estimated qty
                        </TableHead>
                        <TableHead className="w-32 text-right">
                          Override
                        </TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((l) => {
                        const isOverridden = l.qtyOverride !== undefined;
                        return (
                          <TableRow key={l.id}>
                            <TableCell>{l.description}</TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {formatQty(l.qtyEstimated)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                step="0.1"
                                className={`h-7 w-24 text-right text-xs ${
                                  isOverridden ? "border-primary" : ""
                                }`}
                                placeholder={formatQty(l.qtyEstimated)}
                                value={l.qtyOverride ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === "") {
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
                            <TableCell className="text-xs text-muted-foreground">
                              {l.unit}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {formatCurrency(l.rate)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(l.total)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>Total Cost</span>
                <span className="text-lg">
                  {formatCurrency(detail.grandTotal)}
                </span>
              </CardTitle>
              <CardDescription>
                All costs ex GST, before markup / margin. Markup &amp; margin
                are set in Pricing &amp; Performance.
              </CardDescription>
            </CardHeader>
          </Card>
        </>
      )}
    </div>
  );
}
