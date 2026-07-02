import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ChevronDown, ChevronRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

/** Sum lines of the same description (e.g. same post size + length) into one
 *  "type total" row — the actual purchase quantity across every lot. */
function aggregateByType(lines: MaterialOrderLine[]): MaterialOrderLine[] {
  const m = new Map<string, MaterialOrderLine>();
  for (const l of lines) {
    const e = m.get(l.description);
    if (e) {
      e.qty += l.qty;
      e.total += l.total;
    } else {
      m.set(l.description, { ...l, lot: undefined });
    }
  }
  return [...m.values()];
}

function groupLinesByLot(
  lines: MaterialOrderLine[],
): Map<string, MaterialOrderLine[]> {
  const m = new Map<string, MaterialOrderLine[]>();
  for (const l of lines) {
    const key = l.lot ?? "";
    const bucket = m.get(key) ?? [];
    bucket.push(l);
    m.set(key, bucket);
  }
  return m;
}

function LinesTable({
  lines,
  showHeader = true,
}: {
  lines: MaterialOrderLine[];
  showHeader?: boolean;
}) {
  return (
    <Table>
      {showHeader && (
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead className="w-24 text-right">Qty</TableHead>
            <TableHead className="w-16">Unit</TableHead>
            <TableHead className="w-28 text-right">Unit price</TableHead>
            <TableHead className="w-32 text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
      )}
      <TableBody>
        {lines.map((l, i) => (
          <TableRow key={i}>
            <TableCell>{l.description}</TableCell>
            <TableCell className="w-24 text-right tabular-nums">
              {formatQty(l.qty, l.unit)}
            </TableCell>
            <TableCell className="w-16 text-muted-foreground">{l.unit}</TableCell>
            <TableCell className="w-28 text-right tabular-nums text-muted-foreground">
              {formatCurrency(l.unitPrice)}
            </TableCell>
            <TableCell className="w-32 text-right font-medium tabular-nums">
              {formatCurrency(l.total)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Materials Order — collapsible category sections with subtotals. Steel is
 * split into an always-visible "Order totals (all lots)" table (the purchase
 * quantities per post type) plus collapsible per-lot boxes for staging
 * deliveries by location.
 */
export function MaterialsOrderPage() {
  const { id } = useParams<{ id: string }>();
  const { project, loading: projectLoading } = useProject(id);
  const { walls, loading: wallsLoading } = useProjectWalls(id);
  const [openCats, setOpenCats] = useState<Set<string>>(
    () => new Set<string>(CATEGORY_ORDER),
  );
  const [openLots, setOpenLots] = useState<Set<string>>(() => new Set<string>());

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
  const steelLotKeys = [
    ...groupLinesByLot(byCategory.get("Steel") ?? []).keys(),
  ];

  const toggleCat = (c: string) =>
    setOpenCats((s) => {
      const n = new Set(s);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });
  const toggleLot = (k: string) =>
    setOpenLots((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  const expandAll = () => {
    setOpenCats(new Set(cats));
    setOpenLots(new Set(steelLotKeys));
  };
  const collapseAll = () => setOpenLots(new Set());

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
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
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={expandAll}>
            Expand all
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAll}>
            Collapse all
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {order.lines.length === 0 ? (
        <Card className="py-12 text-center text-muted-foreground">
          No materials yet. Add walls in the Take Off page.
        </Card>
      ) : (
        <>
          {cats.map((cat) => {
            const lines = byCategory.get(cat) ?? [];
            const subtotal = lines.reduce((s, l) => s + l.total, 0);
            const open = openCats.has(cat);
            return (
              <Card key={cat} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleCat(cat)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-semibold uppercase tracking-wide">
                    {cat}
                  </span>
                  <span className="ml-auto text-sm font-semibold tabular-nums">
                    {formatCurrency(subtotal)}
                  </span>
                </button>

                {open &&
                  (cat === "Steel" ? (
                    <SteelBody
                      lines={lines}
                      openLots={openLots}
                      toggleLot={toggleLot}
                    />
                  ) : (
                    <div className="border-t">
                      <LinesTable lines={lines} />
                    </div>
                  ))}
              </Card>
            );
          })}

          <Card className="flex items-center justify-between px-4 py-3">
            <span className="font-semibold">
              Grand total
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ex GST, at cost (no markup)
              </span>
            </span>
            <span className="text-base font-semibold tabular-nums">
              {formatCurrency(order.grandTotal)}
            </span>
          </Card>
        </>
      )}
    </div>
  );
}

function SteelBody({
  lines,
  openLots,
  toggleLot,
}: {
  lines: MaterialOrderLine[];
  openLots: Set<string>;
  toggleLot: (k: string) => void;
}) {
  const totals = aggregateByType(lines);
  const byLot = groupLinesByLot(lines);

  return (
    <div className="border-t">
      {/* Order totals — the purchase quantities per post type, all lots. */}
      <div className="border-b bg-muted/20 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Order totals — all lots
        </p>
        <p className="mb-2 text-[11px] text-muted-foreground">
          What to order — every post summed by size &amp; length across all lots.
        </p>
        <LinesTable lines={totals} />
      </div>

      {/* Per-lot breakdown — collapsible, for staging deliveries by location. */}
      <div className="space-y-2 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          By lot (for delivery)
        </p>
        <p className="-mt-1 text-[11px] text-muted-foreground">
          The same posts as the order totals above, split by location — don’t add
          these on top.
        </p>
        {[...byLot.entries()].map(([lot, lotLines]) => {
          const posts = lotLines.reduce((s, l) => s + l.qty, 0);
          const subtotal = lotLines.reduce((s, l) => s + l.total, 0);
          const lotOpen = openLots.has(lot);
          return (
            <div key={lot} className="rounded-md border">
              <button
                type="button"
                onClick={() => toggleLot(lot)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50"
              >
                {lotOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {lot ? `Lot ${lot}` : "No lot assigned"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {posts} posts
                </span>
                <span className="ml-auto text-sm font-medium tabular-nums">
                  {formatCurrency(subtotal)}
                </span>
              </button>
              {lotOpen && (
                <div className="border-t">
                  <LinesTable lines={lotLines} showHeader={false} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
