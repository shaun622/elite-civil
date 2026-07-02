import { Fragment, type ReactElement } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import type { MaterialOrderLine } from "@/lib/engine/types";

const CATEGORY_ORDER = [
  "Concrete",
  "Steel",
  "Fence Brackets",
  "Sleepers",
  "Geofabric",
  "Ag Line",
  "Gravel",
] as const;

const aud = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
});

function formatCurrency(n: number): string {
  return aud.format(n);
}

function formatQty(n: number, unit: string): string {
  if (unit === "m3" || unit === "LM") return n.toFixed(2);
  return n.toFixed(0);
}

function LineRow({ line }: { line: MaterialOrderLine }): ReactElement {
  return (
    <TableRow>
      <TableCell>{line.description}</TableCell>
      <TableCell className="text-right tabular-nums">
        {formatQty(line.qty, line.unit)}
      </TableCell>
      <TableCell className="text-muted-foreground">{line.unit}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {formatCurrency(line.unitPrice)}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {formatCurrency(line.total)}
      </TableCell>
    </TableRow>
  );
}

/** Render a category's rows — sub-grouped by lot when the lines carry a lot
 *  (steel posts), so procurement can bundle deliveries per location. */
function renderCategoryBody(
  cat: string,
  lines: MaterialOrderLine[],
): ReactElement[] {
  if (!lines.some((l) => l.lot)) {
    return lines.map((l, i) => <LineRow key={`${cat}-${i}`} line={l} />);
  }
  const byLot = new Map<string, MaterialOrderLine[]>();
  for (const l of lines) {
    const key = l.lot ?? "";
    const bucket = byLot.get(key) ?? [];
    bucket.push(l);
    byLot.set(key, bucket);
  }
  const rows: ReactElement[] = [];
  let i = 0;
  for (const [lot, lotLines] of byLot) {
    rows.push(
      <TableRow key={`${cat}-lot-${lot}`} className="hover:bg-transparent">
        <TableCell
          colSpan={5}
          className="py-1 pl-6 text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          {lot ? `Lot ${lot}` : "No lot assigned"}
        </TableCell>
      </TableRow>,
    );
    for (const l of lotLines) {
      rows.push(<LineRow key={`${cat}-${i++}`} line={l} />);
    }
  }
  return rows;
}

/**
 * Materials Order — one consolidated procurement table, grouped into
 * category sections with subtotals and a grand total. Quantities come
 * from the engine's calculator; prices use the project's materialPrices.
 */
export function MaterialsOrderPage() {
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

  const order = calculateBundle(walls, project).materialsOrder;

  const byCategory = new Map<string, MaterialOrderLine[]>();
  for (const line of order.lines) {
    const bucket = byCategory.get(line.category) ?? [];
    bucket.push(line);
    byCategory.set(line.category, bucket);
  }
  const cats = CATEGORY_ORDER.filter((c) => byCategory.has(c));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Materials Order
          </h2>
          <p className="text-muted-foreground">
            Consolidated procurement list for {project.name}. Quantities are
            auto-calculated from take-off.
          </p>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      {order.lines.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No materials yet. Add walls in the Take Off page.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-24 text-right">Qty</TableHead>
                  <TableHead className="w-16">Unit</TableHead>
                  <TableHead className="w-28 text-right">Unit price</TableHead>
                  <TableHead className="w-32 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cats.map((cat) => {
                  const lines = byCategory.get(cat) ?? [];
                  const subtotal = lines.reduce((s, l) => s + l.total, 0);
                  return (
                    <Fragment key={cat}>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableCell
                          colSpan={4}
                          className="py-1.5 text-xs font-semibold uppercase tracking-wide"
                        >
                          {cat}
                        </TableCell>
                        <TableCell className="py-1.5 text-right text-xs font-semibold tabular-nums">
                          {formatCurrency(subtotal)}
                        </TableCell>
                      </TableRow>
                      {renderCategoryBody(cat, lines)}
                    </Fragment>
                  );
                })}
                <TableRow className="border-t-2 bg-muted/30 font-semibold hover:bg-muted/30">
                  <TableCell colSpan={4} className="py-2">
                    Grand total
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ex GST, at cost (no markup)
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-right text-base tabular-nums">
                    {formatCurrency(order.grandTotal)}
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
