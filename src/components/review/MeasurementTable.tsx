import {
  forwardRef,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronRight,
  FolderPlus,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { DragOverlay } from "@dnd-kit/core";
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
  /** Start drawing a new wall; the given lot is the group it joins. */
  onAdd: (lot: string | null) => void;
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
// chevron+dot · label · length · avg-RL · height · confirm
const GRID = "grid-cols-[40px_1fr_92px_76px_84px_28px]";

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

  // The item currently being dragged — drives the DragOverlay so a whole
  // lot (header + its walls) is shown moving as a block, not just the
  // header on its own.
  const [activeId, setActiveId] = useState<string | null>(null);

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

  // While a lot header is being dragged, the ids of that lot's walls, so
  // they dim in place alongside the lifted overlay.
  const activeGroupWallIds = useMemo(() => {
    if (!activeId) return new Set<string>();
    const g = groups.find((gr) => `header:${gr.key}` === activeId);
    return new Set((g?.walls ?? []).map((w) => w.id));
  }, [activeId, groups]);

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
    const activeItem = flatItems.find((i) => i.id === active.id);
    if (!activeItem) return;

    if (activeItem.kind === "header") {
      handleGroupDragEnd(String(active.id), String(over.id));
      return;
    }

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

  /**
   * Dragging a group header moves the WHOLE lot (header + its walls) as a
   * block. We reorder at the group level — not the flat-item level — so a
   * group can never land mid-way through another group and steal its
   * trailing walls. Lots are unchanged; only sort_order is rewritten so
   * the new group order sticks.
   */
  function handleGroupDragEnd(activeHeaderId: string, overId: string) {
    // Rebuild the ordered groups (header id + its wall ids) from flatItems.
    type G = { headerId: string; wallIds: string[] };
    const order: G[] = [];
    let cur: G | null = null;
    for (const it of flatItems) {
      if (it.kind === "header") {
        cur = { headerId: it.id, wallIds: [] };
        order.push(cur);
      } else if (cur) {
        cur.wallIds.push(it.id);
      }
    }
    const fromIdx = order.findIndex((g) => g.headerId === activeHeaderId);
    // The drop target maps to whichever group it belongs to (a header is
    // its own group; a wall belongs to the group whose block contains it).
    const toIdx =
      order.findIndex((g) => g.headerId === overId) !== -1
        ? order.findIndex((g) => g.headerId === overId)
        : order.findIndex((g) => g.wallIds.includes(overId));
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

    const reordered = arrayMove(order, fromIdx, toIdx);
    const updates: ReorderUpdate[] = [];
    let n = 0;
    for (const g of reordered) {
      for (const id of g.wallIds) {
        n += 10;
        const seg = segments.find((s) => s.id === id);
        if (seg && seg.sort_order !== n) updates.push({ id, sortOrder: n });
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

  /** Delete a group: an empty group just drops its (pending) entry; a group
   *  with walls confirms and deletes those walls too. */
  async function deleteGroup(lot: string | null, walls: WallSegment[]) {
    if (walls.length === 0) {
      if (lot) setPendingGroups((prev) => prev.filter((p) => p !== lot));
      return;
    }
    if (
      !window.confirm(
        `Delete group "${lot ?? "Ungrouped"}" and its ${walls.length} wall${
          walls.length === 1 ? "" : "s"
        }? This can't be undone.`,
      )
    ) {
      return;
    }
    for (const w of walls) {
      await onDelete(w.id);
    }
    if (lot) setPendingGroups((prev) => prev.filter((p) => p !== lot));
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
            onClick={() => onAdd(null)}
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
      <div className="px-2">
        <p className="text-[11px] text-muted-foreground">
          Drag the grip to reorder, or across a group header to move a wall to
          that lot. Click a wall to edit its RLs. Add walls under a group, or a
          new group at the bottom.
        </p>
      </div>

      {/* Column headers — a leading spacer matches the row grip + card
          padding so the labels line up over the row cells. */}
      <div className="flex items-stretch gap-1">
        <span className="w-5 shrink-0" />
        <div
          className={cn(
            "grid flex-1 items-center gap-2 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground",
            GRID,
          )}
        >
          <span />
          <span>Label</span>
          <span className="text-right">Length (m)</span>
          <span className="text-right">Avg RL (m)</span>
          <span className="text-right">Height (m)</span>
          <span />
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={(e) => {
          setActiveId(null);
          handleDragEnd(e);
        }}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext
          items={flatItems.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1.5 pr-1">
            {flatItems.map((item, i) => {
              // The last item of a group is either the final row overall or the
              // row just before the next group header — that's where this
              // group's "Add a wall" button goes.
              const lastOfGroup =
                i === flatItems.length - 1 ||
                flatItems[i + 1].kind === "header";
              const groupLot =
                item.kind === "wall" ? (item.segment.lot ?? null) : item.lot;
              return (
                <Fragment key={item.id}>
                  {item.kind === "header" ? (
                    <GroupHeaderRow
                      id={item.id}
                      group={groups.find((g) => g.lot === item.lot) ?? null}
                      lot={item.lot}
                      locked={locked}
                      onDelete={() =>
                        void deleteGroup(
                          item.lot,
                          groups.find((g) => g.lot === item.lot)?.walls ?? [],
                        )
                      }
                      onRename={(next) => {
                        const g = groups.find((gr) => gr.lot === item.lot);
                        if (g) renameGroup(g, next);
                        else if (item.lot) {
                          // Rename a still-empty pending group.
                          setPendingGroups((prev) =>
                            prev.map((p) =>
                              p === item.lot ? (next ?? p) : p,
                            ),
                          );
                        }
                      }}
                    />
                  ) : (
                    <SortableWall
                      id={item.id}
                      disabled={locked}
                      dimmed={activeGroupWallIds.has(item.id)}
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
                  )}

                  {!locked && !drawingWall && lastOfGroup && (
                    <button
                      type="button"
                      onClick={() => onAdd(groupLot)}
                      className="ml-7 flex items-center justify-center gap-2 rounded-md border border-dashed border-emerald-300 bg-emerald-50/40 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800"
                    >
                      <Plus className="h-4 w-4" />
                      Add a wall{groupLot ? ` to ${groupLot}` : ""}
                    </button>
                  )}
                </Fragment>
              );
            })}
          </div>
        </SortableContext>

        {/* While dragging a lot header, show the whole group (header +
            its walls) following the cursor, so it reads as one block
            moving rather than a lone header. */}
        <DragOverlay>
          {(() => {
            if (!activeId) return null;
            const active = flatItems.find((i) => i.id === activeId);
            if (!active) return null;
            if (active.kind === "wall") {
              return (
                <div className="rounded-md border bg-card px-3 py-2 text-sm shadow-lg">
                  {active.segment.label ?? "(no label)"}
                </div>
              );
            }
            const g = groups.find((gr) => gr.lot === active.lot);
            const ws = g?.walls ?? [];
            return (
              <div className="overflow-hidden rounded-md border bg-card shadow-lg">
                <div className="bg-muted/85 px-3 py-1.5 text-sm font-semibold">
                  {active.lot ?? "Ungrouped"}
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                    {ws.length} {ws.length === 1 ? "wall" : "walls"}
                  </span>
                </div>
                {ws.slice(0, 6).map((w) => (
                  <div
                    key={w.id}
                    className="border-t px-3 py-1.5 text-xs text-muted-foreground"
                  >
                    {w.label ?? "(no label)"}
                  </div>
                ))}
                {ws.length > 6 && (
                  <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
                    + {ws.length - 6} more
                  </div>
                )}
              </div>
            );
          })()}
        </DragOverlay>
      </DndContext>

      {!locked &&
        (drawingWall ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 w-full gap-2 border border-dashed"
            onClick={() => onAdd(null)}
          >
            <Plus className="h-4 w-4" />
            Cancel adding wall
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 w-full gap-2 border border-dashed"
            onClick={addGroup}
          >
            <FolderPlus className="h-4 w-4" />
            Add a new group
          </Button>
        ))}
    </div>
  );
}

/** Drag-handle wrapper around a wall row. Only the grip starts a drag, so
 *  the row's inputs / buttons stay interactive. */
function SortableWall({
  id,
  disabled,
  dimmed,
  registerRef,
  children,
}: {
  id: string;
  disabled?: boolean;
  /** Dim because the lot this wall belongs to is being dragged as a block. */
  dimmed?: boolean;
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
    opacity: isDragging || dimmed ? 0.4 : 1,
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

/** A lot group header: a drag handle (drags the whole group), an editable
 *  name, and a per-group subtotal. Also a drop target — dropping a wall
 *  onto it moves the wall into that lot. */
function GroupHeaderRow({
  id,
  group,
  lot,
  locked,
  onRename,
  onDelete,
}: {
  id: string;
  group: { walls: WallSegment[] } | null;
  lot: string | null;
  locked: boolean;
  onRename: (next: string | null) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(lot ?? "");
  useEffect(() => setName(lot ?? ""), [lot]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: locked });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 11 : 2,
  };

  const walls = group?.walls ?? [];
  const lengthM = walls.reduce((s, w) => s + (w.length_mm ?? 0) / 1000, 0);

  // Two length-weighted averages over the group:
  //   • avgRlM   — from each wall's raw RL average (the un-edited figure)
  //   • avgUsedM — from each wall's effective height (manual override or
  //                RL avg) — i.e. what the m² is actually calculated from.
  // The area shown is the effective-height area (matches the rows above).
  let area = 0; // sum length × effective height (= the m² we display)
  let usedLen = 0; // length of walls that have an effective height
  let rlArea = 0; // sum length × RL-avg height
  let rlLen = 0; // length of walls that have RLs
  for (const w of walls) {
    const lenM = (w.length_mm ?? 0) / 1000;
    if (w.height_mm != null) {
      area += lenM * (w.height_mm / 1000);
      usedLen += lenM;
    }
    const rlAvg = averageHeightMm(w.rl_pairs ?? []);
    if (rlAvg != null) {
      rlArea += lenM * (rlAvg / 1000);
      rlLen += lenM;
    }
  }
  const areaM2 = area;
  const avgRlM = rlLen > 0 ? rlArea / rlLen : null;
  const avgUsedM = usedLen > 0 ? area / usedLen : null;
  // Only call out the adjusted average when it actually differs from the
  // raw RL average (i.e. someone has manually edited a height).
  const avgDiffers =
    avgRlM != null && avgUsedM != null && Math.abs(avgRlM - avgUsedM) >= 0.005;
  const avgLabel =
    avgRlM == null && avgUsedM != null
      ? `${avgUsedM.toFixed(2)} m avg`
      : avgRlM != null && avgDiffers && avgUsedM != null
        ? `${avgRlM.toFixed(2)} m avg RL (${avgUsedM.toFixed(2)} m adjusted)`
        : avgRlM != null
          ? `${avgRlM.toFixed(2)} m avg RL`
          : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="-mx-1 flex items-center gap-1.5 rounded-md border bg-muted px-2 py-1.5"
    >
      {!locked && (
        <button
          type="button"
          className="flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/50 hover:bg-muted-foreground/10 hover:text-foreground active:cursor-grabbing"
          aria-label="Drag to reorder this lot"
          title="Drag to move the whole lot"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      {locked ? (
        <span className="text-sm font-semibold">{lot ?? "Ungrouped"}</span>
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
        {avgLabel && (
          <span
            title={
              avgDiffers
                ? "Length-weighted average height — raw RL average, then the adjusted average actually used in the m² after manual edits"
                : "Length-weighted average wall height for this lot"
            }
          >
            {" · "}
            {avgLabel}
          </span>
        )}
      </span>
      {!locked && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete this group"
          className="shrink-0 rounded p-1 text-muted-foreground/60 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
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

    // Face area for this wall — length × the height actually used (manual
    // override if set, else the RL average). Shows once a height exists; the
    // priced (engineering, rounded-up) m² lives in the Take Off table.
    const heightUsedMm = segment.height_override_mm ?? avgMm;
    const areaM2 =
      heightUsedMm != null && segment.length_mm != null
        ? (segment.length_mm / 1000) * (heightUsedMm / 1000)
        : null;

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
            ? "border-2 border-emerald-500 ring-2 ring-emerald-500/25"
            : hovered
              ? "border-foreground/20"
              : "border-border",
          segment.user_added && !segment.confirmed && "bg-purple-50/40",
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
          <span className="flex items-center gap-1">
            {/* Expand cue — points right when collapsed, down when open.
                A plain icon so a click bubbles to the row's toggle. */}
            <ChevronRight
              aria-hidden
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform",
                selected && "rotate-90",
              )}
            />
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
          {/* Average height from the RL pairs — the reference. Reads the
              same whether or not a manual height override is set. */}
          <div
            className="text-right text-sm tabular-nums text-muted-foreground"
            title="Average of the per-pair RL heights (reference)"
          >
            {avgMm != null ? formatLength(avgMm) : "—"}
          </div>
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
                "flex h-6 w-6 items-center justify-center justify-self-end rounded-full transition-colors",
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
              className="flex h-6 w-6 items-center justify-center justify-self-end rounded-full bg-emerald-500 text-white"
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

            {/* Wall area — length × the height used. A quiet read-only line
                so each wall's m² is visible right after its RLs are set. */}
            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Area
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {areaM2 != null ? `${areaM2.toFixed(2)} m²` : "—"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs text-muted-foreground">
              {segment.user_added ? (
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
  const [rows, setRows] = useState<RlRow[]>(() => rlPairsToRows(value));

  // Track the pairs this editor last saved, so we can tell our OWN saves
  // (don't re-sync — that would drop a half-typed row) from EXTERNAL changes
  // like the Grab-RLs tool (do re-sync, so the new pair shows immediately).
  const lastEmitted = useRef<RlPair[] | null>(null);
  useEffect(() => {
    const incoming = value ?? [];
    if (lastEmitted.current && pairsEqual(incoming, lastEmitted.current)) {
      return;
    }
    lastEmitted.current = null;
    setRows(rlPairsToRows(value));
  }, [value]);

  function emit(pairs: RlPair[]) {
    lastEmitted.current = pairs;
    onChange(pairs);
  }

  function update(i: number, key: "top" | "bottom", v: string) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { top: "", bottom: "" }]);
  }
  function removeRow(i: number) {
    const next = rows.filter((_, j) => j !== i);
    setRows(next);
    emit(rowsToPairs(next));
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
              onBlur={() => emit(rowsToPairs(rows))}
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
              onBlur={() => emit(rowsToPairs(rows))}
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
