import { useState } from "react";
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
import { roundHeightUp } from "@/lib/engine/calculations";
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

  const totalLM = rows.reduce((s, r) => s + r.calc.lengthLM, 0);
  const totalM2 = rows.reduce((s, r) => s + r.calc.m2, 0);
  const over4m = rows.filter((r) => r.calc.height > 4);

  function commitDraft() {
    if (draft.lengthLM <= 0 || draft.height <= 0) return;
    const heightRounded = roundHeightUp(draft.height);
    void addWall({
      lot: draft.lot.trim() || null,
      wall_type: draft.wall_type,
      wall_design: draft.wall_design,
      position: draft.position,
      length_mm: Math.round(draft.lengthLM * 1000),
      height_mm: Math.round(heightRounded * 1000),
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
            Enter measurements from the civil plans. Lengths are linear
            metres; heights round up to the nearest 0.2 m increment.
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
                step="0.2"
                placeholder="0"
                value={draft.height || ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    height: parseFloat(e.target.value) || 0,
                  })
                }
                onBlur={(e) => {
                  const v = parseFloat(e.target.value);
                  if (v > 0)
                    setDraft({ ...draft, height: roundHeightUp(v) });
                }}
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
          <Badge variant="secondary">{totalM2.toFixed(1)} m² total</Badge>
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
                    <TableHead className="text-right">LM</TableHead>
                    <TableHead className="text-right">Height</TableHead>
                    <TableHead className="text-right">m²</TableHead>
                    <TableHead className="text-right">Concrete</TableHead>
                    <TableHead className="text-right">Gravel</TableHead>
                    <TableHead className="text-right">Holes</TableHead>
                    <TableHead className="text-right">Post</TableHead>
                    <TableHead className="text-right">Bay</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ calc, segment }) => (
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
                        <Input
                          type="number"
                          className="h-7 w-16 text-right text-xs"
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
                        <Input
                          key={`h-${segment.id}-${calc.height}`}
                          type="number"
                          step="0.2"
                          className="h-7 w-16 text-right text-xs"
                          defaultValue={calc.height}
                          onBlur={(e) => {
                            const raw = parseFloat(e.target.value);
                            if (!Number.isFinite(raw) || raw <= 0) return;
                            const rounded = roundHeightUp(raw);
                            if (rounded !== calc.height) {
                              updateWall(segment.id, {
                                height_mm: Math.round(rounded * 1000),
                              });
                            }
                          }}
                        />
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
