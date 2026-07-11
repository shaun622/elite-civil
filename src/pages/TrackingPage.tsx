import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ClipboardCheck, Plus, Printer, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DraftInput } from "@/components/ui/draft-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProject } from "@/hooks/useProjects";
import { useProjectWalls } from "@/hooks/useProjectWalls";
import { calculateBundle } from "@/lib/engine/adapter";
import type { TrackingEntry, TrackingPhase } from "@/types/db";
import type { WallCalculated } from "@/lib/engine/types";

const PHASES: TrackingPhase[] = [
  "Drilling",
  "Posting",
  "Wall Building",
  "Backfill & Gravel",
];

const PHASE_LABELS: Record<TrackingPhase, { qtyLabel: string; qtyUnit: string }> =
  {
    Drilling: { qtyLabel: "Holes drilled", qtyUnit: "holes" },
    Posting: { qtyLabel: "Posts installed", qtyUnit: "posts" },
    "Wall Building": { qtyLabel: "Wall built", qtyUnit: "m²" },
    "Backfill & Gravel": { qtyLabel: "Backfill done", qtyUnit: "m²" },
  };

function getEstimated(
  phase: TrackingPhase,
  calc: WallCalculated[],
): { qty: number; hours: number } {
  switch (phase) {
    case "Drilling":
      return {
        qty: calc.reduce((s, w) => s + w.numberOfHoles, 0),
        hours: calc.reduce((s, w) => s + w.drillTimeHrs, 0),
      };
    case "Posting":
      return {
        qty: calc.reduce((s, w) => s + w.numberOfHoles, 0),
        hours: calc.reduce((s, w) => s + w.drillTimeHrs, 0),
      };
    case "Wall Building":
      return {
        qty: calc.reduce((s, w) => s + w.m2, 0),
        hours: calc.reduce((s, w) => s + w.timeToBuildHrs, 0),
      };
    case "Backfill & Gravel":
      return {
        qty: calc.reduce((s, w) => s + w.m2, 0),
        hours: calc.reduce((s, w) => s + w.timeToBuildHrs, 0),
      };
  }
}

function emptyEntry(phase: TrackingPhase): TrackingEntry {
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    phase,
    crew: "",
    machine: "",
    hours: 0,
    quantity: 0,
    notes: "",
  };
}

/**
 * Tracking — monthly progress log per phase (Drilling, Posting, Wall
 * Building, Backfill & Gravel). Each tab shows estimated vs actual
 * totals plus an editable log table. Entries persist into
 * `projects.tracking_entries` as a JSONB array.
 */
export function TrackingPage() {
  const { id } = useParams<{ id: string }>();
  const { project, loading: projectLoading, update } = useProject(id);
  const { walls, loading: wallsLoading } = useProjectWalls(id);
  const [activePhase, setActivePhase] = useState<TrackingPhase>("Drilling");
  const [draft, setDraft] = useState<TrackingEntry>(emptyEntry("Drilling"));

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
  const calculated = bundle.calculatedWalls;
  const entries: TrackingEntry[] = project.tracking_entries ?? [];

  function patchEntries(next: TrackingEntry[]) {
    void update({ tracking_entries: next });
  }

  function addEntry() {
    if (draft.hours <= 0 && draft.quantity <= 0 && !draft.crew.trim()) return;
    patchEntries([
      ...entries,
      { ...draft, id: crypto.randomUUID(), phase: activePhase },
    ]);
    setDraft(emptyEntry(activePhase));
  }

  function updateEntry(entryId: string, patch: Partial<TrackingEntry>) {
    patchEntries(
      entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
    );
  }

  function removeEntry(entryId: string) {
    patchEntries(entries.filter((e) => e.id !== entryId));
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Operations"
        icon={ClipboardCheck}
        as="h2"
        title="Tracking"
        subtitle="Monthly labour & progress log. Enter actuals during office meetings."
        actions={
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print for site
          </Button>
        }
      />

      <Tabs
        value={activePhase}
        onValueChange={(v) => {
          setActivePhase(v as TrackingPhase);
          setDraft(emptyEntry(v as TrackingPhase));
        }}
      >
        <TabsList>
          {PHASES.map((p) => (
            <TabsTrigger key={p} value={p}>
              {p}
            </TabsTrigger>
          ))}
        </TabsList>

        {PHASES.map((phase) => {
          const phaseEntries = entries.filter((e) => e.phase === phase);
          const actualHours = phaseEntries.reduce((s, e) => s + e.hours, 0);
          const actualQty = phaseEntries.reduce((s, e) => s + e.quantity, 0);
          const est = getEstimated(phase, calculated);
          const pct = est.qty > 0 ? (actualQty / est.qty) * 100 : 0;
          const labels = PHASE_LABELS[phase];

          return (
            <TabsContent key={phase} value={phase} className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>{labels.qtyLabel}</CardDescription>
                    <CardTitle className="text-xl">
                      {actualQty.toFixed(0)} / {est.qty.toFixed(0)}{" "}
                      {labels.qtyUnit}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-muted-foreground">
                      {pct.toFixed(0)}% complete
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Hours</CardDescription>
                    <CardTitle className="text-xl">
                      {actualHours.toFixed(1)} / {est.hours.toFixed(1)} hrs
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-muted-foreground">
                      {actualHours > est.hours
                        ? `${(actualHours - est.hours).toFixed(1)} hrs over estimate`
                        : `${(est.hours - actualHours).toFixed(1)} hrs remaining`}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Entries</CardDescription>
                    <CardTitle className="text-xl">
                      {phaseEntries.length}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-muted-foreground">
                      log entries this phase
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* New entry form */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Add log entry</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
                    <DraftField label="Date">
                      <Input
                        type="date"
                        value={draft.date}
                        onChange={(e) =>
                          setDraft({ ...draft, date: e.target.value })
                        }
                      />
                    </DraftField>
                    <DraftField label="Crew">
                      <Input
                        placeholder="names"
                        value={draft.crew}
                        onChange={(e) =>
                          setDraft({ ...draft, crew: e.target.value })
                        }
                      />
                    </DraftField>
                    <DraftField label="Machine">
                      <Input
                        placeholder="8ton KPR"
                        value={draft.machine}
                        onChange={(e) =>
                          setDraft({ ...draft, machine: e.target.value })
                        }
                      />
                    </DraftField>
                    <DraftField label="Hours">
                      <Input
                        type="number"
                        step="0.5"
                        placeholder="0"
                        value={draft.hours || ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            hours: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </DraftField>
                    <DraftField label={labels.qtyLabel}>
                      <Input
                        type="number"
                        placeholder="0"
                        value={draft.quantity || ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            quantity: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </DraftField>
                    <DraftField label="Notes">
                      <Input
                        placeholder="(optional)"
                        value={draft.notes}
                        onChange={(e) =>
                          setDraft({ ...draft, notes: e.target.value })
                        }
                      />
                    </DraftField>
                    <div className="flex items-end">
                      <Button onClick={addEntry} className="w-full">
                        <Plus className="mr-1 h-4 w-4" />
                        Add
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {phaseEntries.length > 0 ? (
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Crew</TableHead>
                            <TableHead>Machine</TableHead>
                            <TableHead className="text-right">Hours</TableHead>
                            <TableHead className="text-right">
                              {labels.qtyLabel}
                            </TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {phaseEntries
                            .slice()
                            .sort((a, b) => a.date.localeCompare(b.date))
                            .map((e) => (
                              <TableRow key={e.id}>
                                <TableCell>
                                  <DraftInput
                                    type="date"
                                    className="h-7 w-36 text-xs"
                                    value={e.date}
                                    onCommit={(v) =>
                                      updateEntry(e.id, { date: v })
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <DraftInput
                                    className="h-7 w-32 text-xs"
                                    value={e.crew}
                                    onCommit={(v) =>
                                      updateEntry(e.id, { crew: v })
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <DraftInput
                                    className="h-7 w-28 text-xs"
                                    value={e.machine}
                                    onCommit={(v) =>
                                      updateEntry(e.id, { machine: v })
                                    }
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  <DraftInput
                                    type="number"
                                    step="0.5"
                                    className="h-7 w-20 text-right text-xs"
                                    value={String(e.hours)}
                                    onCommit={(v) =>
                                      updateEntry(e.id, {
                                        hours: parseFloat(v) || 0,
                                      })
                                    }
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  <DraftInput
                                    type="number"
                                    className="h-7 w-20 text-right text-xs"
                                    value={String(e.quantity)}
                                    onCommit={(v) =>
                                      updateEntry(e.id, {
                                        quantity: parseFloat(v) || 0,
                                      })
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <DraftInput
                                    className="h-7 text-xs"
                                    value={e.notes}
                                    onCommit={(v) =>
                                      updateEntry(e.id, { notes: v })
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => removeEntry(e.id)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          <TableRow className="bg-muted/50 font-medium">
                            <TableCell colSpan={3}>Totals</TableCell>
                            <TableCell className="text-right">
                              {actualHours.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-right">
                              {actualQty.toFixed(0)}
                            </TableCell>
                            <TableCell colSpan={2}>
                              <Badge variant="outline">
                                {pct.toFixed(0)}% of estimate
                              </Badge>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    No entries logged for {phase} yet.
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function DraftField({
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
