import { Navigate, useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

/**
 * Materials Order — flat procurement list grouped by category.
 * Quantities come straight from the engine's calculator; prices use
 * the project's `materialPrices` config.
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

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
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
        <>
          {CATEGORY_ORDER.filter((cat) => byCategory.has(cat)).map((cat) => {
            const lines = byCategory.get(cat) ?? [];
            const subtotal = lines.reduce((s, l) => s + l.total, 0);
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
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Unit price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((l, i) => (
                        <TableRow key={`${l.description}-${i}`}>
                          <TableCell>{l.description}</TableCell>
                          <TableCell className="text-right">
                            {formatQty(l.qty, l.unit)}
                          </TableCell>
                          <TableCell>{l.unit}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(l.unitPrice)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(l.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>Grand total</span>
                <span className="text-lg">
                  {formatCurrency(order.grandTotal)}
                </span>
              </CardTitle>
              <CardDescription>
                Total material cost (ex GST, at cost price — no markup).
              </CardDescription>
            </CardHeader>
          </Card>
        </>
      )}
    </div>
  );
}
