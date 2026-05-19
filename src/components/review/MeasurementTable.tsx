import { forwardRef, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatLength, parseLength } from "@/lib/format";
import type { RlPair, WallSegment, WallSegmentUpdate } from "@/types/db";

type Props = {
  segments: WallSegment[];
  selectedSegmentId: string | null;
  hoveredSegmentId: string | null;
  savingId: string | null;
  locked: boolean;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onSave: (segment: WallSegment, patch: WallSegmentUpdate) => Promise<void>;
  onAdd: (patch: WallSegmentUpdate) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

// dot · label · length · height
const GRID = "grid-cols-[24px_1fr_96px_84px]";

function confidenceTone(c: number): "good" | "amber" | "red" {
  if (c >= 0.85) return "good";
  if (c >= 0.6) return "amber";
  return "red";
}

function ConfidenceDot({ value }: { value: number }) {
  const tone = confidenceTone(value);
  const cls =
    tone === "good"
      ? "bg-emerald-500"
      : tone === "amber"
        ? "bg-amber-500"
        : "bg-red-500";
  return (
    <span
      title={`Confidence ${(value * 100).toFixed(0)}%`}
      className={cn("inline-block h-2 w-2 rounded-full", cls)}
    />
  );
}

/* ---- RL pairs --------------------------------------------------------- */

type RlRow = { top: string; bottom: string };

/** Wall RL pairs -> editable string rows, padded to at least two rows. */
function rlPairsToRows(pairs: RlPair[] | undefined): RlRow[] {
  const rows: RlRow[] = (pairs ?? []).map((p) => ({
    top: String(p.top),
    bottom: String(p.bottom),
  }));
  while (rows.length < 2) rows.push({ top: "", bottom: "" });
  return rows;
}

/** Editable rows -> the complete RL pairs (rows missing a value are dropped). */
function rowsToPairs(rows: RlRow[]): RlPair[] {
  const pairs: RlPair[] = [];
  for (const r of rows) {
    const top = parseFloat(r.top);
    const bottom = parseFloat(r.bottom);
    if (Number.isFinite(top) && Number.isFinite(bottom)) {
      pairs.push({ top, bottom });
    }
  }
  return pairs;
}

/** Average of the per-pair heights, in mm — null when no pair is complete. */
function averageHeightMm(pairs: RlPair[]): number | null {
  if (pairs.length === 0) return null;
  const sum = pairs.reduce((s, p) => s + (p.top - p.bottom), 0);
  return Math.round((sum / pairs.length) * 1000);
}

function pairsEqual(a: RlPair[], b: RlPair[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => p.top === b[i].top && p.bottom === b[i].bottom);
}

export function MeasurementTable({
  segments,
  selectedSegmentId,
  hoveredSegmentId,
  savingId,
  locked,
  onSelect,
  onHover,
  onSave,
  onAdd,
  onDelete,
}: Props) {
  const [adding, setAdding] = useState(false);

  // Refs per row so the selected row can be scrolled into view when the user
  // clicks the corresponding polyline in the viewer.
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  useEffect(() => {
    if (!selectedSegmentId) return;
    const el = rowRefs.current.get(selectedSegmentId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedSegmentId]);

  if (segments.length === 0 && !adding) {
    return (
      <div className="rounded-md border border-dashed bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No retaining wall segments on this page yet.
        </p>
        {!locked && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 gap-2"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-4 w-4" />
            Add wall segment manually
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="px-2 text-[11px] text-muted-foreground">
        Tip: click a wall to edit it — enter Top RL and Bottom RL at each end
        and the height is calculated for you.
      </p>
      <div
        className={cn(
          "grid items-center gap-2 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground",
          GRID,
        )}
      >
        <span></span>
        <span>Label</span>
        <span className="text-right">Length (m)</span>
        <span className="text-right">Height (m)</span>
      </div>

      <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
        {segments.map((seg) => (
          <SegmentRow
            key={seg.id}
            ref={(el) => {
              if (el) rowRefs.current.set(seg.id, el);
              else rowRefs.current.delete(seg.id);
            }}
            segment={seg}
            selected={seg.id === selectedSegmentId}
            hovered={seg.id === hoveredSegmentId}
            saving={savingId === seg.id}
            locked={locked}
            onSelect={() => onSelect(seg.id)}
            onHoverEnter={() => onHover(seg.id)}
            onHoverLeave={() => onHover(null)}
            onSave={(patch) => onSave(seg, patch)}
            onDelete={() => onDelete(seg.id)}
          />
        ))}

        {adding && (
          <NewSegmentRow
            onCancel={() => setAdding(false)}
            onSave={async (patch) => {
              await onAdd(patch);
              setAdding(false);
            }}
          />
        )}
      </div>

      {!locked && !adding && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 w-full gap-2 border border-dashed"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-4 w-4" />
          Add wall segment
        </Button>
      )}
    </div>
  );
}

type SegmentRowProps = {
  segment: WallSegment;
  selected: boolean;
  hovered: boolean;
  saving: boolean;
  locked: boolean;
  onSelect: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onSave: (patch: WallSegmentUpdate) => Promise<void>;
  onDelete: () => Promise<void>;
};

const SegmentRow = forwardRef<HTMLDivElement, SegmentRowProps>(
  function SegmentRow(
    {
      segment,
      selected,
      hovered,
      saving,
      locked,
      onSelect,
      onHoverEnter,
      onHoverLeave,
      onSave,
      onDelete,
    },
    ref,
  ) {
    const [label, setLabel] = useState(segment.label ?? "");
    const [length, setLength] = useState(formatLength(segment.length_mm));
    const [thickness, setThickness] = useState(
      formatLength(segment.thickness_mm),
    );
    const [notes, setNotes] = useState(segment.notes ?? "");
    const [notesOpen, setNotesOpen] = useState(false);

    useEffect(() => {
      setLabel(segment.label ?? "");
      setLength(formatLength(segment.length_mm));
      setThickness(formatLength(segment.thickness_mm));
      setNotes(segment.notes ?? "");
    }, [segment]);

    async function commit(patch: WallSegmentUpdate) {
      await onSave(patch);
    }

    function commitRlPairs(pairs: RlPair[]) {
      if (pairsEqual(pairs, segment.rl_pairs ?? [])) return;
      void commit({ rl_pairs: pairs, height_mm: averageHeightMm(pairs) });
    }

    return (
      <div
        ref={ref}
        onClick={onSelect}
        onMouseEnter={onHoverEnter}
        onMouseLeave={onHoverLeave}
        className={cn(
          "rounded-md border bg-card p-2 transition-colors",
          selected
            ? "border-foreground/40 ring-1 ring-foreground/10"
            : hovered
              ? "border-foreground/20"
              : "border-border",
          segment.user_added && "bg-purple-50/40",
        )}
      >
        <div className={cn("grid items-center gap-2", GRID)}>
          <span className="flex items-center">
            <ConfidenceDot value={segment.confidence} />
          </span>
          <Input
            value={label}
            disabled={locked}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => (segment.label ?? "") !== label && commit({ label })}
            placeholder="(no label)"
            className="h-8"
          />
          <LengthCell
            value={length}
            disabled={locked}
            onChange={setLength}
            onCommit={() => {
              const v = parseLength(length);
              if (v !== segment.length_mm) {
                commit({ length_mm: v });
                setLength(formatLength(v));
              }
            }}
          />
          <div
            className="text-right text-sm tabular-nums text-muted-foreground"
            title="Average of the per-pair RL heights"
          >
            {segment.height_mm != null ? formatLength(segment.height_mm) : "—"}
          </div>
        </div>

        {(selected || saving) && (
          <div className="mt-2 space-y-3 border-t pt-2">
            <RlPairEditor
              value={segment.rl_pairs}
              disabled={locked}
              onChange={commitRlPairs}
            />

            <div className="grid w-36 gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Thickness (m)
              </span>
              <LengthCell
                value={thickness}
                disabled={locked}
                onChange={setThickness}
                onCommit={() => {
                  const v = parseLength(thickness);
                  if (v !== segment.thickness_mm) {
                    commit({ thickness_mm: v });
                    setThickness(formatLength(v));
                  }
                }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs text-muted-foreground">
              {segment.user_added && (
                <Badge variant="secondary">User added</Badge>
              )}
              {!segment.user_added && segment.user_edited && (
                <Badge variant="secondary">Edited</Badge>
              )}
              {saving && (
                <span className="inline-flex items-center gap-1 text-[11px]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving…
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setNotesOpen((v) => !v);
                }}
                className="ml-auto text-[11px] underline-offset-2 hover:underline"
              >
                {notesOpen
                  ? "Hide notes"
                  : segment.notes
                    ? "Notes"
                    : "Add notes"}
              </button>
              {!locked && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      confirm(
                        `Delete segment "${segment.label ?? "(unlabeled)"}"?`,
                      )
                    ) {
                      void onDelete();
                    }
                  }}
                  title="Delete segment"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {notesOpen && (
              <Textarea
                rows={2}
                value={notes}
                disabled={locked}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() =>
                  (segment.notes ?? "") !== notes && commit({ notes })
                }
                placeholder="Notes about this segment"
                className="text-xs"
              />
            )}
          </div>
        )}
      </div>
    );
  },
);

/** Editor for a wall's RL pairs — two rows by default (the wall's two ends),
 *  with the option to add more where the slope changes mid-wall. Each pair
 *  shows its own height; the average becomes the wall's height. */
function RlPairEditor({
  value,
  disabled,
  onChange,
}: {
  value: RlPair[] | undefined;
  disabled?: boolean;
  onChange: (pairs: RlPair[]) => void;
}) {
  // Initialised once per mount — the editor mounts fresh each time a wall is
  // selected, so it must not reset on its own saves (that clobbers typing).
  const [rows, setRows] = useState<RlRow[]>(() => rlPairsToRows(value));

  function update(i: number, key: "top" | "bottom", v: string) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { top: "", bottom: "" }]);
  }
  function removeRow(i: number) {
    const next = rows.filter((_, j) => j !== i);
    setRows(next);
    onChange(rowsToPairs(next));
  }

  const pairs = rowsToPairs(rows);
  const avg = averageHeightMm(pairs);

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_1fr_56px_22px] gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>Top RL</span>
        <span>Bottom RL</span>
        <span className="text-right">Height</span>
        <span />
      </div>
      {rows.map((r, i) => {
        const t = parseFloat(r.top);
        const b = parseFloat(r.bottom);
        const heightMm =
          Number.isFinite(t) && Number.isFinite(b)
            ? Math.round((t - b) * 1000)
            : null;
        return (
          <div
            key={i}
            className="grid grid-cols-[1fr_1fr_56px_22px] items-center gap-1.5"
          >
            <Input
              inputMode="decimal"
              value={r.top}
              disabled={disabled}
              onChange={(e) => update(i, "top", e.target.value)}
              onBlur={() => onChange(rowsToPairs(rows))}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder="e.g. 66.70"
              className="h-8 text-right tabular-nums"
            />
            <Input
              inputMode="decimal"
              value={r.bottom}
              disabled={disabled}
              onChange={(e) => update(i, "bottom", e.target.value)}
              onBlur={() => onChange(rowsToPairs(rows))}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder="e.g. 65.40"
              className="h-8 text-right tabular-nums"
            />
            <span className="text-right text-xs tabular-nums">
              {heightMm != null ? formatLength(heightMm) : "—"}
            </span>
            {rows.length > 2 && !disabled ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeRow(i);
                }}
                title="Remove this RL pair"
                className="flex h-8 w-full items-center justify-center text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span />
            )}
          </div>
        );
      })}
      {!disabled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            addRow();
          }}
          className="text-[11px] text-primary underline-offset-2 hover:underline"
        >
          + Add RL pair
        </button>
      )}
      <p className="pt-0.5 text-[11px] text-muted-foreground">
        Average height{" "}
        <span className="font-medium text-foreground">
          {avg != null ? formatLength(avg) : "enter both RLs"}
        </span>
      </p>
    </div>
  );
}

function NewSegmentRow({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (patch: WallSegmentUpdate) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [length, setLength] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await onSave({
        label: label.trim() || null,
        length_mm: parseLength(length),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-md border border-dashed border-purple-300 bg-purple-50/40 p-2">
      <div className="grid grid-cols-[24px_1fr_96px] items-center gap-2">
        <span className="flex items-center">
          <span className="inline-block h-2 w-2 rounded-full bg-purple-500" />
        </span>
        <Input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. Wall D)"
          className="h-8"
        />
        <LengthCell value={length} onChange={setLength} onCommit={() => {}} />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={submitting}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={submitting || !label.trim()}
          onClick={submit}
        >
          {submitting ? "Adding…" : "Add"}
        </Button>
      </div>
    </div>
  );
}

function LengthCell({
  value,
  disabled,
  onChange,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <Input
      inputMode="decimal"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="h-8 text-right tabular-nums"
      placeholder="—"
      title="Enter in metres (e.g. 1.5). Append mm to enter millimetres (e.g. 200 mm)."
    />
  );
}
