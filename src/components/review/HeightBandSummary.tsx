import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatLength } from "@/lib/format";
import type { WallSegment } from "@/types/db";

type Props = {
  segments: WallSegment[];
  projectId: string;
};

/** Default band edges (m) — the typical job split: 0–1.6, 1.6–3.0, 3.0+. */
const DEFAULT_EDGES = [1.6, 3.0];

function storageKey(projectId: string): string {
  return `takeoffmate.heightBands.${projectId}`;
}

/** Positive, de-duplicated, ascending band edges. */
function normalizeEdges(values: number[]): number[] {
  const clean = values.filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(clean)].sort((a, b) => a - b);
}

/** Last-used band edges for this project, falling back to the defaults. */
function loadEdges(projectId: string): number[] {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (raw != null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return normalizeEdges(
          parsed.filter((n): n is number => typeof n === "number"),
        );
      }
    }
  } catch {
    // ignore — fall back to the defaults
  }
  return [...DEFAULT_EDGES];
}

/** Index of the band a height (m) falls in: [0,e0), [e0,e1), … , [eLast,∞). */
function bandIndex(heightM: number, edges: number[]): number {
  for (let i = 0; i < edges.length; i++) {
    if (heightM < edges[i]) return i;
  }
  return edges.length;
}

function bandLabel(i: number, edges: number[]): string {
  if (edges.length === 0) return "All heights";
  const lo = i === 0 ? 0 : edges[i - 1];
  if (i >= edges.length) return `${lo} m +`;
  return `${lo} – ${edges[i]} m`;
}

const COLS = "grid grid-cols-[1fr_44px_78px_70px] gap-2";

/**
 * Quantity summary for the review screen — wall length + face area totalled
 * per height band, so a per-m² rate can later be attached to each band.
 * Band edges are adjustable and remembered per project (no dollars yet).
 */
export function HeightBandSummary({ segments, projectId }: Props) {
  const [edgeDrafts, setEdgeDrafts] = useState<string[]>(() =>
    loadEdges(projectId).map((n) => String(n)),
  );

  // The clean, sorted edges that actually drive the banding.
  const edges = useMemo(
    () => normalizeEdges(edgeDrafts.map((s) => parseFloat(s))),
    [edgeDrafts],
  );

  const { bands, noHeight, totals } = useMemo(() => {
    const bands = Array.from({ length: edges.length + 1 }, (_, i) => ({
      label: bandLabel(i, edges),
      count: 0,
      lengthMm: 0,
      areaM2: 0,
    }));
    const noHeight = { count: 0, lengthMm: 0 };

    for (const seg of segments) {
      const lengthMm = seg.length_mm ?? 0;
      if (seg.height_mm == null) {
        noHeight.count += 1;
        noHeight.lengthMm += lengthMm;
        continue;
      }
      const heightM = seg.height_mm / 1000;
      const band = bands[bandIndex(heightM, edges)];
      band.count += 1;
      band.lengthMm += lengthMm;
      band.areaM2 += (lengthMm / 1000) * heightM;
    }

    const totals = {
      count: bands.reduce((s, b) => s + b.count, 0) + noHeight.count,
      lengthMm: bands.reduce((s, b) => s + b.lengthMm, 0) + noHeight.lengthMm,
      areaM2: bands.reduce((s, b) => s + b.areaM2, 0),
    };
    return { bands, noHeight, totals };
  }, [segments, edges]);

  function setEdges(drafts: string[]) {
    setEdgeDrafts(drafts);
    try {
      localStorage.setItem(
        storageKey(projectId),
        JSON.stringify(normalizeEdges(drafts.map((s) => parseFloat(s)))),
      );
    } catch {
      // ignore — bands just won't be remembered next visit
    }
  }

  if (segments.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-3">
      <h3 className="text-sm font-semibold">Summary by height band</h3>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Area = wall length × height (the wall face). A per-m² rate will later
        apply to each band's area.
      </p>

      {/* Adjustable band edges */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Band edges (m)
        </span>
        {edgeDrafts.map((draft, i) => (
          <div key={i} className="flex items-center">
            <Input
              inputMode="decimal"
              value={draft}
              onChange={(e) =>
                setEdges(
                  edgeDrafts.map((d, j) => (j === i ? e.target.value : d)),
                )
              }
              placeholder="m"
              className="h-7 w-14 text-right tabular-nums"
            />
            <button
              type="button"
              onClick={() => setEdges(edgeDrafts.filter((_, j) => j !== i))}
              title="Remove this band edge"
              className="ml-0.5 text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setEdgeDrafts((d) => [...d, ""])}
          className="inline-flex items-center gap-0.5 text-[11px] text-primary underline-offset-2 hover:underline"
        >
          <Plus className="h-3 w-3" />
          Add edge
        </button>
      </div>

      {/* Per-band totals */}
      <div className="mt-3">
        <div
          className={`${COLS} px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground`}
        >
          <span>Band</span>
          <span className="text-right">Walls</span>
          <span className="text-right">Length</span>
          <span className="text-right">Area m²</span>
        </div>

        {bands.map((b, i) => (
          <div
            key={i}
            className={`${COLS} rounded px-2 py-1 text-sm tabular-nums ${
              i % 2 === 1 ? "bg-muted/40" : ""
            }`}
          >
            <span className="font-medium">{b.label}</span>
            <span className="text-right text-muted-foreground">{b.count}</span>
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
            className={`${COLS} rounded bg-amber-50 px-2 py-1 text-sm tabular-nums text-amber-900`}
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
          className={`${COLS} mt-1 border-t px-2 pt-1.5 text-sm font-semibold tabular-nums`}
        >
          <span>Total</span>
          <span className="text-right">{totals.count}</span>
          <span className="text-right">{formatLength(totals.lengthMm)}</span>
          <span className="text-right">{totals.areaM2.toFixed(1)}</span>
        </div>
      </div>

      {noHeight.count > 0 && (
        <p className="mt-2 text-[11px] text-amber-700">
          {noHeight.count === 1
            ? "1 wall has no height yet"
            : `${noHeight.count} walls have no height yet`}{" "}
          — enter its Top/Bottom RLs to include it in the area total.
        </p>
      )}
    </div>
  );
}
