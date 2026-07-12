import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ChevronDown, ChevronRight, PackageSearch, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
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
import {
  excludeMatKey,
  materialLineExclusionKey,
} from "@/lib/engine/exclusions";
import { cn } from "@/lib/utils";
import type { MaterialCategory, MaterialOrderLine } from "@/lib/engine/types";

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
  onToggle,
  disabled = false,
}: {
  lines: MaterialOrderLine[];
  showHeader?: boolean;
  /** When set, a leading tick box per line toggles it in / out of the order. */
  onToggle?: (line: MaterialOrderLine) => void;
  /** Category is switched off: line tick boxes are shown but disabled. */
  disabled?: boolean;
}) {
  return (
    <Table>
      {showHeader && (
        <TableHeader>
          <TableRow>
            {onToggle && <TableHead className="w-8 print:hidden" />}
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
          <TableRow key={i} className={cn(l.excluded && "opacity-50 print:hidden")}>
            {onToggle && (
              <TableCell className="print:hidden">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-foreground"
                  checked={!l.excluded}
                  disabled={disabled}
                  title={
                    disabled
                      ? "Turned off by its category"
                      : "Include this item in the order and costings"
                  }
                  onChange={() => onToggle(l)}
                />
              </TableCell>
            )}
            <TableCell>{l.description}</TableCell>
            <TableCell className="w-24 text-right tabular-nums">
              {formatQty(l.qty, l.unit)}
            </TableCell>
            <TableCell className="w-16 text-muted-foreground">{l.unit}</TableCell>
            <TableCell className="w-28 text-right tabular-nums text-muted-foreground">
              {formatCurrency(l.unitPrice)}
            </TableCell>
            <TableCell
              className={cn(
                "w-32 text-right font-medium tabular-nums",
                l.excluded && "text-muted-foreground line-through",
              )}
            >
              {formatCurrency(l.excluded ? l.qty * l.unitPrice : l.total)}
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
  const { project, loading: projectLoading, update } = useProject(id);
  const { walls, loading: wallsLoading } = useProjectWalls(project?.id);
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
  const overrides = project.cost_overrides ?? {};

  function setExclude(key: string, on: boolean) {
    const next = { ...overrides };
    if (on) next[key] = 1;
    else delete next[key];
    void update({ cost_overrides: next });
  }
  const toggleLineExclusion = (line: MaterialOrderLine) =>
    setExclude(materialLineExclusionKey(line), !line.excluded);

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
      <PageHeader
        eyebrow="Order"
        icon={PackageSearch}
        as="h2"
        title="Materials Order"
        subtitle="Consolidated procurement list, auto-calculated from take-off. Untick items the client supplies. Category toggles also remove the item from costs and the quotation; individual steel rows and wedges affect this order only."
        actions={
          <>
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
          </>
        }
      />

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
            const matCat = cat as MaterialCategory;
            const catOff = !!overrides[excludeMatKey(matCat)];
            return (
              <Card key={cat} className="overflow-hidden">
                <div className="flex w-full items-center gap-2 border-l-2 border-l-sky-500 bg-sky-50/50 px-4 py-3 print:border-l-0 print:bg-transparent">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-foreground print:hidden"
                    checked={!catOff}
                    title="Include this category in the order and costings"
                    onChange={(e) =>
                      setExclude(excludeMatKey(matCat), !e.target.checked)
                    }
                  />
                  <button
                    type="button"
                    onClick={() => toggleCat(cat)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    {open ? (
                      <ChevronDown className="h-4 w-4 text-sky-600" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-sky-600" />
                    )}
                    <span
                      className={cn(
                        "text-sm font-semibold uppercase tracking-wide",
                        catOff && "text-muted-foreground line-through",
                      )}
                    >
                      {cat}
                    </span>
                    <span className="ml-auto text-sm font-semibold tabular-nums">
                      {formatCurrency(subtotal)}
                    </span>
                  </button>
                </div>

                {open &&
                  (cat === "Steel" ? (
                    <SteelBody
                      lines={lines}
                      openLots={openLots}
                      toggleLot={toggleLot}
                      onToggle={toggleLineExclusion}
                      disabled={catOff}
                    />
                  ) : (
                    <div className="border-t">
                      <LinesTable
                        lines={lines}
                        onToggle={toggleLineExclusion}
                        disabled={catOff}
                      />
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
  onToggle,
  disabled,
}: {
  lines: MaterialOrderLine[];
  openLots: Set<string>;
  toggleLot: (k: string) => void;
  onToggle: (line: MaterialOrderLine) => void;
  disabled: boolean;
}) {
  const totals = aggregateByType(lines);
  const byLot = groupLinesByLot(lines);

  return (
    <div className="border-t">
      {/* Order totals — the purchase quantities per post type, all lots. */}
      <div className="border-b bg-muted/20 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Order totals (all lots)
        </p>
        <p className="mb-2 text-[11px] text-muted-foreground">
          What to order: every post summed by size &amp; length across all lots.
        </p>
        <LinesTable lines={totals} onToggle={onToggle} disabled={disabled} />
      </div>

      {/* Per-lot breakdown — collapsible, for staging deliveries by location. */}
      <div className="space-y-2 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          By lot (for delivery)
        </p>
        <p className="-mt-1 text-[11px] text-muted-foreground">
          The same posts as the order totals above, split by location. Don’t add
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
