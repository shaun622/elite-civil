import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatLength } from "@/lib/format";
import { embedmentOpts } from "@/lib/engine/calculations";
import {
  computeHeightBands,
  normalizeBandEdges,
  resolveBandEdges,
  sameEdges,
} from "@/lib/engine/heightBands";
import { defaultConfig } from "@/lib/engine/defaults";
import { useProject } from "@/hooks/useProjects";
import type { ProjectConfig, WallSegment } from "@/types/db";

type Props = {
  segments: WallSegment[];
  projectId: string;
};

const COLS = "grid grid-cols-[1fr_44px_78px_70px] gap-2";

/**
 * Quantity summary for the review screen — wall length + face area totalled
 * per height band. Band edges and the embedment round-up (on/off + step) are
 * saved on the project config, so they're shared with the whole team and drive
 * the matching breakdown on the project Dashboard.
 */
export function HeightBandSummary({ segments, projectId }: Props) {
  const { project, update } = useProject(projectId);
  const config: ProjectConfig = project?.config ?? defaultConfig;

  // Live embedment round-up settings (drive the area figures).
  const roundOpts = useMemo(() => embedmentOpts(config), [config]);

  // Local drafts for the edge inputs; committed to the config on blur so we
  // don't write to the DB on every keystroke. Seeded once the project loads.
  const seededRef = useRef(false);
  const [edgeDrafts, setEdgeDrafts] = useState<string[]>(() =>
    resolveBandEdges(config).map((n) => String(n)),
  );
  const [incrementDraft, setIncrementDraft] = useState<string>(() =>
    String(roundOpts.incrementM),
  );

  useEffect(() => {
    if (seededRef.current || !project) return;
    seededRef.current = true;
    const cfg = project.config ?? defaultConfig;
    setEdgeDrafts(resolveBandEdges(cfg).map((n) => String(n)));
    setIncrementDraft(String(embedmentOpts(cfg).incrementM));
  }, [project]);

  // The clean, sorted edges that actually drive the banding (live, from drafts).
  const edges = useMemo(
    () => normalizeBandEdges(edgeDrafts.map((s) => parseFloat(s))),
    [edgeDrafts],
  );

  const { bands, noHeight, totals } = useMemo(
    () => computeHeightBands(segments, edges, roundOpts),
    [segments, edges, roundOpts],
  );

  async function saveConfig(next: ProjectConfig) {
    try {
      await update({ config: next });
    } catch {
      // ignore — the value simply won't persist; UI already reflects the draft
    }
  }

  function commitEdges(list: string[]) {
    const normalized = normalizeBandEdges(list.map((s) => parseFloat(s)));
    // Re-seed the inputs in clean, sorted order so the ranges read correctly.
    setEdgeDrafts(normalized.map((n) => String(n)));
    if (sameEdges(resolveBandEdges(config), normalized)) return;
    void saveConfig({ ...config, heightBandEdges: normalized });
  }

  function setRounding(enabled: boolean) {
    if (enabled === roundOpts.enabled) return;
    void saveConfig({
      ...config,
      engineering: { ...config.engineering, embedmentRoundUp: enabled },
    });
  }

  function commitIncrement() {
    const v = parseFloat(incrementDraft);
    const inc = Number.isFinite(v) && v > 0 ? v : 0.2;
    if (inc === roundOpts.incrementM) return;
    void saveConfig({
      ...config,
      engineering: { ...config.engineering, embedmentIncrementM: inc },
    });
  }

  if (segments.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Summary by height band</h3>

        {/* Rounding toggle + step — writes to the project config. */}
        <button
          type="button"
          onClick={() => setRounding(!roundOpts.enabled)}
          title="Toggle embedment round-up (also in Pricing & Performance → Engineering)"
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
            roundOpts.enabled
              ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
              : "bg-muted text-muted-foreground hover:bg-muted/70"
          }`}
        >
          {roundOpts.enabled ? "Rounding ON" : "Rounding OFF · actual heights"}
        </button>
        {roundOpts.enabled && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span>↑ nearest</span>
            <Input
              inputMode="decimal"
              value={incrementDraft}
              onChange={(e) => setIncrementDraft(e.target.value)}
              onBlur={commitIncrement}
              className="h-6 w-12 text-right text-[11px] tabular-nums"
            />
            <span>m</span>
          </div>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {roundOpts.enabled ? (
          <>
            Area = wall length × height, with heights rounded up to the nearest{" "}
            {roundOpts.incrementM} m for post embedment — the pricing basis.
            Matches Take Off's “Eng m²” (the lot headers above show the
            un-rounded area).
          </>
        ) : (
          <>
            Area = wall length × the actual measured height (embedment round-up
            is off). Matches Take Off's “Eng m²”.
          </>
        )}
      </p>

      {/* Height ranges — edit the upper limit of each range directly. Saved to
          the project config (shared with the team + the Dashboard). */}
      <div className="mt-3 rounded-md border bg-muted/30 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Height ranges — customise
          </span>
          <button
            type="button"
            onClick={() => setEdgeDrafts((d) => [...d, ""])}
            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
          >
            <Plus className="h-3 w-3" />
            Add range
          </button>
        </div>

        <div className="mt-1.5 space-y-1">
          {edgeDrafts.map((draft, i) => {
            const lo = i === 0 ? 0 : parseFloat(edgeDrafts[i - 1]) || 0;
            return (
              <div key={i} className="flex items-center gap-1.5 text-sm">
                <span className="w-9 text-right tabular-nums text-muted-foreground">
                  {lo}
                </span>
                <span className="text-muted-foreground">–</span>
                <Input
                  inputMode="decimal"
                  value={draft}
                  onChange={(e) =>
                    setEdgeDrafts(
                      edgeDrafts.map((d, j) => (j === i ? e.target.value : d)),
                    )
                  }
                  onBlur={() => commitEdges(edgeDrafts)}
                  placeholder="m"
                  className="h-7 w-16 text-right tabular-nums"
                />
                <span className="text-xs text-muted-foreground">m</span>
                <button
                  type="button"
                  onClick={() =>
                    commitEdges(edgeDrafts.filter((_, j) => j !== i))
                  }
                  title="Remove this range (merge it into the one above)"
                  className="ml-auto text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}

          {edgeDrafts.length > 0 ? (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="w-9 text-right tabular-nums">
                {parseFloat(edgeDrafts[edgeDrafts.length - 1]) || 0}
              </span>
              <span>m and above</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No splits — all walls counted in one range. Add a range to split
              by height.
            </p>
          )}
        </div>

        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Each row is a range — edit its upper limit. e.g. change{" "}
          <span className="font-medium">1.6 – 3</span> to{" "}
          <span className="font-medium">1.6 – 2.2</span> for a 1.6–2.2 m band,
          then “Add range” for the next split.
        </p>
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

      {(() => {
        const total = segments.length;
        const confirmedCount = segments.filter((s) => s.confirmed).length;
        if (confirmedCount === total) {
          return (
            <p className="mt-2 text-[11px] text-emerald-700">
              All {total} {total === 1 ? "wall" : "walls"} confirmed.
            </p>
          );
        }
        const remaining = total - confirmedCount;
        return (
          <p className="mt-2 text-[11px] text-amber-700">
            {remaining} {remaining === 1 ? "wall" : "walls"} not yet confirmed
            — verify each before quoting.
          </p>
        );
      })()}
    </div>
  );
}
