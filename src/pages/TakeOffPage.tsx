import { Fragment, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AlertTriangle, Plus, ScanLine, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { groupByLot } from "@/lib/wallGroups";
import type {
  WallDesign,
  WallPosition,
  WallSegment,
  WallType,
} from "@/types/db";

const WALL_TYPES: WallType[] = ["Single", "Upper", "Lower"];
const WALL_DESIGNS: WallDesign[] = ["Super Sleeper", "Concrete"];
const WALL_POSITIONS: WallPosition[] = ["Left", "Right", "Rear", "Front"];

type NewWallDraft = {
  lot: string;
  wall_type: WallType;
  wall_design: WallDesign;
  position: WallPosition;
  lengthLM: number;
  height: number;
};

function emptyDraft(): NewWallDraft {
  return {
    lot: "",
    wall_type: "Single",
    wall_design: "Super Sleeper",
    position: "Left",
    lengthLM: 0,
    height: 0,
  };
}

/**
 * Take Off — the single place to add and edit wall segments for a
 * project. Walls measured from a PDF land here automatically (via
 * the extract pipeline writing into wall_segments with this
 * project_id); manual entries enter through the form below.
 */
export function TakeOffPage() {
  const { id } = useParams<{ id: string }>();
  const { project, loading: projectLoading } = useProject(id);
  const {
    walls,
    loading: wallsLoading,
    actionError,
    addWall,
    updateWall,
    removeWall,
  } = useProjectWalls(id);
  const [draft, setDraft] = useState<NewWallDraft>(emptyDraft());

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

  const bundle = calculateBundle(walls, project);
  // Pair each WallCalculated back to its DB row so inline edits
  // know which segment to update.
  const rows = bundle.calculatedWalls.map((calc) => ({
    calc,
    segment: walls.find((w) => w.id === calc.id) as WallSegment,
  }));

  // Group rows by lot for display (walls already arrive in the persisted
  // sort_order, so groups land in the same order as on the Review page).
  // Only show group subheaders once at least one wall has a lot — an
  // all-ungrouped job stays a flat list.
  const groupedRows = groupByLot(rows, (r) => r.segment.lot);
  const showGroups =
    groupedRows.length > 1 ||
    (groupedRows.length === 1 && groupedRows[0].lot !== null);

  const totalLM = rows.reduce((s, r) => s + r.calc.lengthLM, 0);
  const totalEngM2 = rows.reduce((s, r) => s + r.calc.m2, 0);
  // Face m² uses the raw measured height (before 0.2 m rounding) — what
  // the wall actually looks like. Engineering m² (calc.m2) uses the
  // rounded height and is what BE prices off.
  const totalFaceM2 = rows.reduce((s, r) => {
    const lengthM = (r.segment.length_mm ?? 0) / 1000;
    const heightM = (r.segment.height_mm ?? 0) / 1000;
    return s + lengthM * heightM;
  }, 0);
  const totalConcrete = rows.reduce((s, r) => s + r.calc.concreteM3, 0);
  const totalGravel = rows.reduce((s, r) => s + r.calc.gravelM3, 0);
  const totalHoles = rows.reduce((s, r) => s + r.calc.numberOfHoles, 0);
  const over4m = rows.filter((r) => r.calc.height > 4);

  function commitDraft() {
    if (draft.lengthLM <= 0 || draft.height <= 0) return;
    // Store the height as entered — the engine rounds it up to 0.2 m for
    // the engineering m² / posts, but the stored figure stays exact.
    const heightMm = Math.round(draft.height * 1000);
    void addWall({
      lot: draft.lot.trim() || null,
      wall_type: draft.wall_type,
      wall_design: draft.wall_design,
      position: draft.position,
      length_mm: Math.round(draft.lengthLM * 1000),
      height_mm: heightMm,
      height_override_mm: heightMm,
    });
    setDraft(emptyDraft());
  }

  function onDraftKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commitDraft();
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Take Off</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.name} · enter measurements, or measure from a PDF.
          </p>
        </div>
        <Button asChild>
          <Link to={`/projects/${id}/drawings`} className="gap-1.5">
            <ScanLine className="h-4 w-4" />
            Measure from PDF
          </Link>
        </Button>
      </div>

      {actionError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 text-sm text-destructive">
            {actionError}
          </CardContent>
        </Card>
      )}

      {/* Add wall form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add wall segment</CardTitle>
          <CardDescription>
            Enter measurements from the civil plans. Lengths and heights are
            stored as entered; the engineering m² rounds height up to the
            nearest 0.2 m for post embedment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
            <Field label="Lot">
              <Input
                placeholder="e.g. 501"
                value={draft.lot}
                onChange={(e) => setDraft({ ...draft, lot: e.target.value })}
                onKeyDown={onDraftKeyDown}
              />
            </Field>
            <Field label="Type">
              <Select
                value={draft.wall_type}
                onValueChange={(v) =>
                  setDraft({ ...draft, wall_type: v as WallType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WALL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Design">
              <Select
                value={draft.wall_design}
                onValueChange={(v) =>
                  setDraft({ ...draft, wall_design: v as WallDesign })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WALL_DESIGNS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Position">
              <Select
                value={draft.position}
                onValueChange={(v) =>
                  setDraft({ ...draft, position: v as WallPosition })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WALL_POSITIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Length (LM)">
              <Input
                type="number"
                placeholder="0"
                value={draft.lengthLM || ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    lengthLM: parseFloat(e.target.value) || 0,
                  })
                }
                onKeyDown={onDraftKeyDown}
              />
            </Field>
            <Field label="Height (m)">
              <Input
                type="number"
                step="0.01"
                placeholder="0"
                value={draft.height || ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    height: parseFloat(e.target.value) || 0,
                  })
                }
                onKeyDown={onDraftKeyDown}
              />
            </Field>
            <div className="flex items-end">
              <Button onClick={commitDraft} className="w-full">
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{rows.length} segments</Badge>
          <Badge variant="secondary">{totalLM.toFixed(0)} LM total</Badge>
          <Badge variant="secondary">{totalEngM2.toFixed(1)} m² total</Badge>
          <Badge variant="secondary">
            {bundle.uniqueLotCount} lot{bundle.uniqueLotCount === 1 ? "" : "s"}
          </Badge>
          {over4m.length > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {over4m.length} wall{over4m.length === 1 ? "" : "s"} over 4 m
            </Badge>
          )}
        </div>
      )}

      {over4m.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="text-sm">
              <p className="font-medium">Walls over 4 m flagged</p>
              <p className="mt-0.5 text-muted-foreground">
                BE doesn't typically install retaining walls over 4 m high —
                this quote will use the largest available post size, but a
                more cost-effective system (block / concrete crib / soldier
                pile) is usually recommended at this height. Consider quoting
                an alternative.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Wall table */}
      {rows.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Lot</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Design</TableHead>
                    <TableHead>Position</TableHead>
                    {/* Right-pad on these two so the header label aligns
                        with the right-aligned text inside the input below
                        (the input has its own px-3 internal padding). */}
                    <TableHead className="pr-5 text-right">LM</TableHead>
                    <TableHead className="pr-5 text-right">Height</TableHead>
                    <TableHead className="text-right" title="Wall face area — length × raw height">
                      Face m²
                    </TableHead>
                    <TableHead className="text-right" title="Length × rounded height — what the engine prices off">
                      Eng m²
                    </TableHead>
                    <TableHead className="text-right">Concrete</TableHead>
                    <TableHead className="text-right">Gravel</TableHead>
                    <TableHead className="text-right">Holes</TableHead>
                    <TableHead className="text-right">Post</TableHead>
                    <TableHead className="text-right">Bay</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedRows.map((group) => {
                    const gLM = group.walls.reduce(
                      (s, r) => s + r.calc.lengthLM,
                      0,
                    );
                    const gFace = group.walls.reduce(
                      (s, r) =>
                        s +
                        ((r.segment.length_mm ?? 0) / 1000) *
                          ((r.segment.height_mm ?? 0) / 1000),
                      0,
                    );
                    const gEng = group.walls.reduce((s, r) => s + r.calc.m2, 0);
                    const gConc = group.walls.reduce(
                      (s, r) => s + r.calc.concreteM3,
                      0,
                    );
                    const gGravel = group.walls.reduce(
                      (s, r) => s + r.calc.gravelM3,
                      0,
                    );
                    const gHoles = group.walls.reduce(
                      (s, r) => s + r.calc.numberOfHoles,
                      0,
                    );
                    return (
                    <Fragment key={group.key}>
                      {showGroups && (
                        <TableRow className="bg-muted/30">
                          <TableCell
                            colSpan={14}
                            className="py-1.5 text-xs font-semibold"
                          >
                            {group.lot ?? "Ungrouped"}
                            <span className="ml-2 font-normal text-muted-foreground">
                              {group.walls.length}{" "}
                              {group.walls.length === 1 ? "wall" : "walls"}
                            </span>
                          </TableCell>
                        </TableRow>
                      )}
                      {group.walls.map(({ calc, segment }) => (
                        <TableRow key={calc.id}>
                      <TableCell>
                        <Input
                          className="h-7 w-16 text-xs"
                          value={calc.lot ?? ""}
                          onChange={(e) =>
                            updateWall(segment.id, {
                              lot: e.target.value,
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={calc.type}
                          onValueChange={(v) =>
                            updateWall(segment.id, {
                              wall_type: v as WallType,
                            })
                          }
                        >
                          <SelectTrigger className="h-7 w-20 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WALL_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={calc.wallDesign}
                          onValueChange={(v) =>
                            updateWall(segment.id, {
                              wall_design: v as WallDesign,
                            })
                          }
                        >
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WALL_DESIGNS.map((d) => (
                              <SelectItem key={d} value={d}>
                                {d}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={calc.position}
                          onValueChange={(v) =>
                            updateWall(segment.id, {
                              position: v as WallPosition,
                            })
                          }
                        >
                          <SelectTrigger className="h-7 w-20 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WALL_POSITIONS.map((p) => (
                              <SelectItem key={p} value={p}>
                                {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        {/* ml-auto pushes the flex Input box to the right
                            edge of the cell — `text-right` on the cell
                            alone doesn't move block-level flex children. */}
                        <Input
                          type="number"
                          className="ml-auto h-7 w-16 text-right text-xs"
                          defaultValue={calc.lengthLM.toFixed(2)}
                          onBlur={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v) && v > 0) {
                              updateWall(segment.id, {
                                length_mm: Math.round(v * 1000),
                              });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {/* The wall's ACTUAL height (matches the Review
                            page). The engineering 0.2 m roundup only affects
                            the Eng m² / Concrete / Holes / Post columns. */}
                        <Input
                          key={`h-${segment.id}-${segment.height_mm ?? ""}`}
                          type="number"
                          step="0.01"
                          className="ml-auto h-7 w-16 text-right text-xs"
                          defaultValue={
                            segment.height_mm != null
                              ? segment.height_mm / 1000
                              : ""
                          }
                          onBlur={(e) => {
                            const raw = parseFloat(e.target.value);
                            if (!Number.isFinite(raw) || raw <= 0) return;
                            const mm = Math.round(raw * 1000);
                            if (mm !== segment.height_mm) {
                              // A Take Off height edit is a manual figure —
                              // store it as entered (no roundup) and record
                              // the override so a later RL edit on Review
                              // doesn't silently overwrite it.
                              updateWall(segment.id, {
                                height_mm: mm,
                                height_override_mm: mm,
                              });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {(
                          ((segment.length_mm ?? 0) / 1000) *
                          ((segment.height_mm ?? 0) / 1000)
                        ).toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {calc.m2.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {calc.concreteM3.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {calc.gravelM3.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {calc.numberOfHoles.toFixed(0)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <Badge variant="outline" className="text-xs">
                          {calc.postSize}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {calc.baySize}m
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete this wall (lot ${calc.lot || "—"})?`,
                              )
                            )
                              void removeWall(segment.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                        </TableRow>
                      ))}
                      {showGroups && (
                        <TableRow className="border-t border-dashed bg-muted/10 text-xs text-muted-foreground hover:bg-muted/10">
                          <TableCell
                            colSpan={4}
                            className="py-1.5 italic"
                          >
                            {group.lot ?? "Ungrouped"} subtotal
                          </TableCell>
                          <TableCell className="pr-5 text-right tabular-nums">
                            {gLM.toFixed(2)}
                          </TableCell>
                          <TableCell />
                          <TableCell className="text-right tabular-nums">
                            {gFace.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {gEng.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {gConc.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {gGravel.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {gHoles.toFixed(0)}
                          </TableCell>
                          <TableCell />
                          <TableCell />
                          <TableCell />
                        </TableRow>
                      )}
                    </Fragment>
                    );
                  })}
                  <TableRow className="bg-muted/40 font-medium">
                    <TableCell colSpan={4} className="text-xs uppercase tracking-wider text-muted-foreground">
                      Total ({rows.length} segment{rows.length === 1 ? "" : "s"})
                    </TableCell>
                    <TableCell className="pr-5 text-right tabular-nums">
                      {totalLM.toFixed(2)}
                    </TableCell>
                    <TableCell className="pr-5 text-right" />
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {totalFaceM2.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totalEngM2.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totalConcrete.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totalGravel.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totalHoles.toFixed(0)}
                    </TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
            <ScanLine className="h-10 w-10 text-muted-foreground/50" />
            <div className="text-center">
              <CardTitle>No walls yet</CardTitle>
              <CardDescription>
                Add a wall above, or measure walls from a PDF drawing.
              </CardDescription>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
