import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WallSegment, WallSegmentUpdate } from "@/types/db";

type Props = {
  segments: WallSegment[];
  selectedSegmentId: string | null;
  savingId: string | null;
  locked: boolean;
  onSelect: (id: string | null) => void;
  onSave: (segment: WallSegment, patch: WallSegmentUpdate) => Promise<void>;
  onAdd: (patch: WallSegmentUpdate) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

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

export function MeasurementTable({
  segments,
  selectedSegmentId,
  savingId,
  locked,
  onSelect,
  onSave,
  onAdd,
  onDelete,
}: Props) {
  const [adding, setAdding] = useState(false);

  if (segments.length === 0 && !adding) {
    return (
      <div className="rounded-md border border-dashed bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Claude didn't find any retaining wall segments on this page.
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
      <div className="grid grid-cols-[24px_1fr_90px_90px_90px_28px] items-center gap-2 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span></span>
        <span>Label</span>
        <span className="text-right">Length (mm)</span>
        <span className="text-right">Height (mm)</span>
        <span className="text-right">Thick (mm)</span>
        <span></span>
      </div>

      {segments.map((seg) => (
        <SegmentRow
          key={seg.id}
          segment={seg}
          selected={seg.id === selectedSegmentId}
          saving={savingId === seg.id}
          locked={locked}
          onSelect={() => onSelect(seg.id)}
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

function SegmentRow({
  segment,
  selected,
  saving,
  locked,
  onSelect,
  onSave,
  onDelete,
}: {
  segment: WallSegment;
  selected: boolean;
  saving: boolean;
  locked: boolean;
  onSelect: () => void;
  onSave: (patch: WallSegmentUpdate) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [label, setLabel] = useState(segment.label ?? "");
  const [length, setLength] = useState(formatNum(segment.length_mm));
  const [height, setHeight] = useState(formatNum(segment.height_mm));
  const [thickness, setThickness] = useState(formatNum(segment.thickness_mm));
  const [notes, setNotes] = useState(segment.notes ?? "");
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    setLabel(segment.label ?? "");
    setLength(formatNum(segment.length_mm));
    setHeight(formatNum(segment.height_mm));
    setThickness(formatNum(segment.thickness_mm));
    setNotes(segment.notes ?? "");
  }, [segment]);

  async function commit(patch: WallSegmentUpdate) {
    await onSave(patch);
  }

  return (
    <div
      onClick={onSelect}
      className={cn(
        "rounded-md border bg-card p-2 transition-colors",
        selected
          ? "border-foreground/40 ring-1 ring-foreground/10"
          : "border-border",
        segment.user_added && "bg-purple-50/40",
      )}
    >
      <div className="grid grid-cols-[24px_1fr_90px_90px_90px_28px] items-center gap-2">
        <span className="flex items-center">
          <ConfidenceDot value={segment.confidence} />
        </span>
        <Input
          value={label}
          disabled={locked}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() =>
            (segment.label ?? "") !== label && commit({ label })
          }
          placeholder="(no label)"
          className="h-8"
        />
        <NumberCell
          value={length}
          disabled={locked}
          onChange={setLength}
          onCommit={() => {
            const v = parseNum(length);
            if (v !== segment.length_mm) commit({ length_mm: v });
          }}
        />
        <NumberCell
          value={height}
          disabled={locked}
          onChange={setHeight}
          onCommit={() => {
            const v = parseNum(height);
            if (v !== segment.height_mm) commit({ height_mm: v });
          }}
        />
        <NumberCell
          value={thickness}
          disabled={locked}
          onChange={setThickness}
          onCommit={() => {
            const v = parseNum(thickness);
            if (v !== segment.thickness_mm) commit({ thickness_mm: v });
          }}
        />
        <div className="flex justify-end">
          {!locked && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete segment "${segment.label ?? "(unlabeled)"}?"`)) {
                  void onDelete();
                }
              }}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1 text-xs text-muted-foreground">
        {segment.user_added && <Badge variant="secondary">User added</Badge>}
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
          {notesOpen ? "Hide notes" : segment.notes ? "Notes" : "Add notes"}
        </button>
      </div>

      {notesOpen && (
        <div className="mt-2 px-1">
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
        </div>
      )}
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
  const [height, setHeight] = useState("");
  const [thickness, setThickness] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await onSave({
        label: label.trim() || null,
        length_mm: parseNum(length),
        height_mm: parseNum(height),
        thickness_mm: parseNum(thickness),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-md border border-dashed border-purple-300 bg-purple-50/40 p-2">
      <div className="grid grid-cols-[24px_1fr_90px_90px_90px_28px] items-center gap-2">
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
        <NumberCell value={length} onChange={setLength} onCommit={() => {}} />
        <NumberCell value={height} onChange={setHeight} onCommit={() => {}} />
        <NumberCell
          value={thickness}
          onChange={setThickness}
          onCommit={() => {}}
        />
        <span />
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

function NumberCell({
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
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="h-8 text-right tabular-nums"
      placeholder="—"
    />
  );
}

function formatNum(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function parseNum(v: string): number | null {
  const trimmed = v.trim();
  if (trimmed.length === 0) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}
