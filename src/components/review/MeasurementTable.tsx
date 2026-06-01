import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  FolderPlus,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatLength, parseLength } from "@/lib/format";
import { roundHeightUp } from "@/lib/engine/calculations";
import { groupByLot } from "@/lib/wallGroups";
import type { RlPair, WallSegment, WallSegmentUpdate } from "@/types/db";

type ReorderUpdate = { id: string; sortOrder: number; lot?: string | null };

type Props = {
  segments: WallSegment[];
  selectedSegmentId: string | null;
  hoveredSegmentId: string | null;
  savingId: string | null;
  locked: boolean;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onSave: (segment: WallSegment, patch: WallSegmentUpdate) => Promise<void>;
  onAdd: () => Promise<void>;
  onReorder: (updates: ReorderUpdate[]) => void;
  drawingWall?: boolean;
  onDelete: (id: string) => Promise<void>;
};

/** A flat, drag-orderable list item: either a lot group header (a fixed
 *  anchor) or a draggable wall row. The header's position in the flat list
 *  is what defines which group a wall belongs to after a drag. */
type FlatItem =
  | { kind: "header"; id: string; lot: string | null }
  | { kind: "wall"; id: string; segment: WallSegment };

// dot · label · length · height · confirm
const GRID = "grid-cols-[24px_1fr_96px_84px_24px]";

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
  onReorder,
  drawingWall,
  onDelete,
}: Props) {
  // Refs per row so the selected row can be scrolled into view when the user
  // clicks the corresponding polyline in the viewer.
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  useEffect(() => {
    if (!selectedSegmentId) return;
    const el = rowRefs.current.get(selectedSegmentId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedSegmentId]);

  // Empty lot groups the user has created but not yet dragged any walls
  // into. They live only in local state — a group "exists" in the DB only
  // once a wall carries its lot — so they vanish on reload if left empty.
  const [pendingGroups, setPendingGroups] = useState<string[]>([]);

  // A small drag distance before a drag starts, so a click on the grip
  // that doesn't move doesn't count as a drag (and clicks on the row's
  // controls keep working).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const groups = useMemo(
    () => groupByLot(segments, (s) => s.lot),
    [segments],
  );

  // Build the flat [header, ...walls] list that drives both rendering and
  // drag math. Append any pending (still-empty) groups at the end.
  const flatItems = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = [];
    const realLots = new Set<string>();
    for (const g of groups) {
      if (g.lot) realLots.add(g.lot);
      items.push({ kind: "header", id: `header:${g.key}`, lot: g.lot });
      for (const w of g.walls) items.push({ kind: "wall", id: w.id, segment: w });
    }
    for (const lot of pendingGroups) {
      if (realLots.has(lot)) continue; // a wall already adopted this lot
      items.push({ kind: "header", id: `header:${lot}`, lot });
    }
    return items;
  }, [groups, pendingGroups]);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = flatItems.findIndex((i) => i.id === active.id);
    const newIndex = flatItems.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const moved = arrayMove(flatItems, oldIndex, newIndex);

    // Re-derive every wall's lot (from the nearest preceding header) and a
    // fresh sort_order from its position. Only walls that actually changed
    // are sent to the server.
    const updates: ReorderUpdate[] = [];
    let currentLot: string | null = null;
    let order = 0;
    for (const item of moved) {
      if (item.kind === "header") {
        currentLot = item.lot;
        continue;
      }
      order += 10;
      const seg = item.segment;
      const prevLot = seg.lot && seg.lot.trim() ? seg.lot.trim() : null;
      const lotChanged = prevLot !== currentLot;
      const orderChanged = seg.sort_order !== order;
      if (lotChanged || orderChanged) {
        updates.push({
          id: seg.id,
          sortOrder: order,
          ...(lotChanged ? { lot: currentLot } : {}),
        });
      }
    }
    if (updates.length > 0) onReorder(updates);
  }

  function renameGroup(group: (typeof groups)[number], nextLot: string | null) {
    const updates: ReorderUpdate[] = group.walls.map((w) => ({
      id: w.id,
      sortOrder: w.sort_order ?? 0,
      lot: nextLot,
    }));
    if (updates.length > 0) onReorder(updates);
  }

  function addGroup() {
    const name = window.prompt("New group / lot name (e.g. Lot 7):")?.trim();
    if (!name) return;
    setPendingGroups((prev) => (prev.includes(name) ? prev : [...prev, name]));
  }

  if (segments.length === 0) {
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
            onClick={() => void onAdd()}
          >
            <Plus className="h-4 w-4" />
            {drawingWall ? "Cancel adding wall" : "Add a wall (N)"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-2">
        <p className="text-[11px] text-muted-foreground">
          Drag the grip to reorder, or across a group header to move a wall to
          that lot. Click a wall to edit its RLs.
        </p>
        {!locked && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1.5 text-xs"
            onClick={addGroup}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            New group
          </Button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={flatItems.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="max-h-[52vh] space-y-1.5 overflow-y-auto pr-1">
            {flatItems.map((item) =>
              item.kind === "header" ? (
                <GroupHeaderRow
                  key={item.id}
                  group={groups.find((g) => g.lot === item.lot) ?? null}
                  lot={item.lot}
                  locked={locked}
                  onRename={(next) => {
                    const g = groups.find((gr) => gr.lot === item.lot);
                    if (g) renameGroup(g, next);
                    else if (item.lot) {
                      // Rename a still-empty pending group.
                      setPendingGroups((prev) =>
                        prev.map((p) => (p === item.lot ? (next ?? p) : p)),
                      );
                    }
                  }}
                />
              ) : (
                <SortableWall
                  key={item.id}
                  id={item.id}
                  disabled={locked}
                  registerRef={(el) => {
                    if (el) rowRefs.current.set(item.id, el);
                    else rowRefs.current.delete(item.id);
                  }}
                >
                  <SegmentRow
                    segment={item.segment}
                    selected={item.segment.id === selectedSegmentId}
                    hovered={item.segment.id === hoveredSegmentId}
                    saving={savingId === item.segment.id}
                    locked={locked}
                    onSelect={() =>
                      onSelect(
                        item.segment.id === selectedSegmentId
                          ? null
                          : item.segment.id,
                      )
                    }
                    onHoverEnter={() => onHover(item.segment.id)}
                    onHoverLeave={() => onHover(null)}
                    onSave={(patch) => onSave(item.segment, patch)}
                    onDelete={() => onDelete(item.segment.id)}
                  />
                </SortableWall>
              ),
            )}
          </div>
        </SortableContext>
      </DndContext>

      {!locked && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 w-full gap-2 border border-dashed"
          onClick={() => void onAdd()}
        >
          <Plus className="h-4 w-4" />
          {drawingWall ? "Cancel adding wall" : "Add a wall (N)"}
        </Button>
      )}
    </div>
  );
}

/** Drag-handle wrapper around a wall row. Only the grip starts a drag, so
 *  the row's inputs / buttons stay interactive. */
function SortableWall({
  id,
  disabled,
  registerRef,
  children,
}: {
  id: string;
  disabled?: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        registerRef(node);
      }}
      style={style}
      className="flex items-start gap-1"
    >
      {!disabled && (
        <button
          type="button"
          className="mt-2 flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/40 hover:bg-muted hover:text-foreground active:cursor-grabbing"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** A lot group header: editable name + a per-group subtotal. Acts as a
 *  fixed anchor in the drag list — dropping a wall under it moves the wall
 *  into that lot. */
function GroupHeaderRow({
  group,
  lot,
  locked,
  onRename,
}: {
  group: { walls: WallSegment[] } | null;
  lot: string | null;
  locked: boolean;
  onRename: (next: string | null) => void;
}) {
  const [name, setName] = useState(lot ?? "");
  useEffect(() => setName(lot ?? ""), [lot]);

  const walls = group?.walls ?? [];
  const lengthM = walls.reduce((s, w) => s + (w.length_mm ?? 0) / 1000, 0);
  const areaM2 = walls.reduce((s, w) => {
    if (w.height_mm == null) return s;
    return s + ((w.length_mm ?? 0) / 1000) * roundHeightUp(w.height_mm / 1000);
  }, 0);

  return (
    <div className="sticky top-0 z-[1] -mx-1 flex items-center gap-2 rounded-md border bg-muted/80 px-2 py-1.5 backdrop-blur">
      {locked ? (
        <span className="text-sm font-semibold">
          {lot ?? "Ungrouped"}
        </span>
      ) : (
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const t = name.trim();
            if ((lot ?? "") !== t) onRename(t ? t : null);
          }}
          placeholder="Ungrouped"
          className="h-7 w-44 text-sm font-semibold"
        />
      )}
      <span className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground">
        {walls.length} {walls.length === 1 ? "wall" : "walls"}
        {walls.length > 0 &&
          ` · ${lengthM.toFixed(1)} LM · ${areaM2.toFixed(1)} m²`}
      </span>
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

    // The live RL-pair average (the reference), and the editable "used
    // height" field — defaults to the manual override if set, else the
    // average. Typing a different value makes it a manual override.
    const avgMm = averageHeightMm(segment.rl_pairs ?? []);
    const [heightField, setHeightField] = useState(
      segment.height_override_mm != null
        ? formatLength(segment.height_override_mm)
        : avgMm != null
          ? formatLength(avgMm)
          : "",
    );

    useEffect(() => {
      setLabel(segment.label ?? "");
      setLength(formatLength(segment.length_mm));
      setThickness(formatLength(segment.thickness_mm));
      setNotes(segment.notes ?? "");
      const a = averageHeightMm(segment.rl_pairs ?? []);
      setHeightField(
        segment.height_override_mm != null
          ? formatLength(segment.height_override_mm)
          : a != null
            ? formatLength(a)
            : "",
      );
    }, [segment]);

    async function commit(patch: WallSegmentUpdate) {
      await onSave(patch);
    }

    function commitRlPairs(pairs: RlPair[]) {
      if (pairsEqual(pairs, segment.rl_pairs ?? [])) return;
      const avg = averageHeightMm(pairs);
      // An active manual override wins; otherwise the effective height
      // tracks the RL average.
      const effective = segment.height_override_mm ?? avg;
      void commit({ rl_pairs: pairs, height_mm: effective });
    }

    /** Commit the editable height field as a manual override — unless it
     *  matches the RL average (then we stay average-tracking) or is blank
     *  (then we revert to the average). */
    function commitHeightField() {
      const raw = heightField.trim();
      const avg = averageHeightMm(segment.rl_pairs ?? []);
      if (raw === "") {
        if (segment.height_override_mm != null) {
          void commit({ height_override_mm: null, height_mm: avg });
        }
        return;
      }
      const mm = parseLength(raw);
      if (mm == null || mm <= 0) return;
      if (mm === segment.height_override_mm) return; // unchanged
      if (mm === avg && segment.height_override_mm == null) return; // == avg
      void commit({ height_override_mm: mm, height_mm: mm });
    }

    function clearHeightOverride() {
      const avg = averageHeightMm(segment.rl_pairs ?? []);
      setHeightField(avg != null ? formatLength(avg) : "");
      if (segment.height_override_mm != null) {
        void commit({ height_override_mm: null, height_mm: avg });
      }
    }

    return (
      <div
        ref={ref}
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
        <div
          className={cn(
            "grid cursor-pointer items-center gap-2",
            GRID,
          )}
          onClick={(e) => {
            // When already selected, clicks on the row's chrome collapse it,
            // but clicks on an input / button (label, confirm icon) keep
            // the row open so the user can keep editing.
            if (selected) {
              const tag = (e.target as HTMLElement).tagName;
              if (tag === "INPUT" || tag === "BUTTON" || tag === "TEXTAREA") {
                return;
              }
            }
            onSelect();
          }}
        >
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
            className={cn(
              "text-right text-sm tabular-nums",
              segment.height_override_mm != null
                ? "font-medium text-foreground"
                : segment.height_mm != null && !segment.confirmed
                  ? "rounded border border-purple-300 bg-purple-50/70 px-1.5 py-0.5 text-purple-800"
                  : "text-muted-foreground",
            )}
            title={
              segment.height_override_mm != null
                ? `Manual height${avgMm != null ? ` — RL average ${formatLength(avgMm)} m` : ""}`
                : segment.height_mm != null && !segment.confirmed
                  ? "Auto-derived from RLs — confirm the wall once you've verified"
                  : "Average of the per-pair RL heights"
            }
          >
            {segment.height_mm != null ? formatLength(segment.height_mm) : "—"}
            {segment.height_override_mm != null && (
              <span
                className="ml-0.5 align-super text-[9px] text-muted-foreground"
                title="Manual override"
              >
                M
              </span>
            )}
          </div>
          {!locked ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void commit({ confirmed: !segment.confirmed });
              }}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
                segment.confirmed
                  ? "bg-emerald-500 text-white hover:bg-emerald-600"
                  : "border border-muted-foreground/30 text-muted-foreground/30 hover:border-emerald-500 hover:text-emerald-600",
              )}
              title={
                segment.confirmed
                  ? "Un-confirm wall"
                  : "Confirm wall — RLs verified"
              }
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          ) : segment.confirmed ? (
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white"
              title="Confirmed"
            >
              <Check className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span />
          )}
        </div>

        {(selected || saving) && (
          <div className="mt-2 space-y-3 border-t pt-2">
            <RlPairEditor
              value={segment.rl_pairs}
              disabled={locked}
              onChange={commitRlPairs}
            />

            {/* Editable wall height. Defaults to the RL average; typing a
                different figure (e.g. rounding 1.123 → 1.2) makes it a manual
                override that the rest of the app uses, while the real average
                stays visible as a reference. */}
            <div className="grid gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Height used (m)
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  inputMode="decimal"
                  value={heightField}
                  disabled={locked}
                  onChange={(e) => setHeightField(e.target.value)}
                  onBlur={commitHeightField}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      (e.target as HTMLInputElement).blur();
                  }}
                  placeholder={avgMm != null ? formatLength(avgMm) : "height"}
                  className="h-8 w-24 text-right tabular-nums"
                />
                <span className="text-[11px] text-muted-foreground">
                  {segment.height_override_mm != null ? (
                    <>
                      manual override · RL avg{" "}
                      <span className="font-medium text-foreground">
                        {avgMm != null ? formatLength(avgMm) : "—"}
                      </span>{" "}
                      m
                      {!locked && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearHeightOverride();
                          }}
                          className="ml-1.5 underline underline-offset-2 hover:text-foreground"
                        >
                          use average
                        </button>
                      )}
                    </>
                  ) : avgMm != null ? (
                    <>tracking RL average — type to override</>
                  ) : (
                    <>no RLs yet — enter a height, or add RL pairs above</>
                  )}
                </span>
              </div>
            </div>

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
              {segment.user_added && !locked ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50 hover:text-purple-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    void commit({ user_added: false });
                  }}
                  title="Save wall — turns it from purple (in-progress) to blue"
                >
                  <Check className="h-3.5 w-3.5" />
                  Save wall
                </Button>
              ) : segment.user_added ? (
                <Badge variant="secondary">User added</Badge>
              ) : segment.user_edited && !segment.confirmed ? (
                <Badge variant="secondary">Edited</Badge>
              ) : null}

              {segment.confirmed ? (
                <Badge
                  variant="secondary"
                  className="gap-1 border-emerald-200 bg-emerald-100 text-emerald-800"
                >
                  <Check className="h-3 w-3" />
                  Confirmed
                  {!locked && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void commit({ confirmed: false });
                      }}
                      title="Un-confirm this wall"
                      className="ml-0.5 rounded hover:bg-emerald-200/60"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ) : !locked ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    void commit({ confirmed: true });
                  }}
                  title="Mark this wall as confirmed — RLs verified"
                >
                  <Check className="h-3.5 w-3.5" />
                  Confirm
                </Button>
              ) : null}
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
