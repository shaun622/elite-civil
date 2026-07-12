import { useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DraftInput } from "@/components/ui/draft-input";
import { PageHeader } from "@/components/layout/PageHeader";
import { DollarSign, Plus, Trash2 } from "lucide-react";
import { useProject } from "@/hooks/useProjects";
import { POST_SIZE_OPTIONS, defaultConfig } from "@/lib/engine/defaults";
import { defaultQuoteLabel } from "@/lib/engine/calculations";
import type { CrewType, PostSizeRange, ProjectConfig } from "@/types/db";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Chain post-size ranges so each row's min equals the previous row's max, and
 *  no row's max drops to or below its own min. Keeps the height ladder gap-free
 *  and overlap-free, so a boundary number is never entered twice. */
function rechainRanges(ranges: PostSizeRange[]): void {
  for (let i = 1; i < ranges.length; i++) {
    ranges[i].heightMin = ranges[i - 1].heightMax;
    if (ranges[i].heightMax <= ranges[i].heightMin) {
      ranges[i].heightMax = r2(ranges[i].heightMin + 0.1);
    }
  }
}

/**
 * Pricing & Performance — full project-config editor. Mirrors the BE
 * Landscapes layout (Labour, Materials, Engineering, Performance,
 * Admin). Writes go straight to `projects.config` via useProject.update,
 * so the dashboard / cost / quote pages all update instantly.
 */
export function PricingPerfPage() {
  const { id } = useParams<{ id: string }>();
  const { project, loading, update } = useProject(id);

  // Local draft so inputs stay responsive. Writing every keystroke straight to
  // the DB (async) reverted the field before the change landed — which
  // scrambled/reversed typed text. We edit the draft synchronously and persist
  // on a short debounce instead.
  const [draft, setDraft] = useState<ProjectConfig | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<ProjectConfig | null>(null);

  useEffect(() => {
    if (project) setDraft(structuredClone(project.config ?? defaultConfig));
    // Re-seed only when the project identity changes, so debounced saves
    // (which refresh `project`) don't clobber in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  // Flush a pending save if the user leaves before the debounce fires.
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        if (pendingRef.current) void update({ config: pendingRef.current });
      }
    },
    [update],
  );

  if (!id) return <Navigate to="/dashboard" replace />;

  if (loading) {
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

  const config: ProjectConfig = draft ?? project.config ?? defaultConfig;

  // Update the draft synchronously (responsive inputs) and persist on a 500 ms
  // debounce so the dashboard / cost / quote pages still follow along.
  function setConfig(next: ProjectConfig) {
    setDraft(next);
    pendingRef.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const cfg = pendingRef.current;
      pendingRef.current = null;
      if (cfg) void update({ config: cfg });
    }, 500);
  }

  function setField<K extends keyof ProjectConfig>(
    section: K,
    field: string,
    value: number | string | boolean,
  ) {
    const next = structuredClone(config);
    // Section is a known nested object — cast through unknown to satisfy TS.
    (next[section] as unknown as Record<string, unknown>)[field] = value;
    setConfig(next);
  }

  // The machine row that actually prices drilling / backfill time: "8ton KPR"
  // if present, else the first row (matches drillingMachineRate in the engine).
  const drivingMachineIndex = Math.max(
    0,
    config.machineRates.findIndex((m) => m.name === "8ton KPR"),
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Estimate"
        icon={DollarSign}
        as="h2"
        title="Pricing & Performance"
        subtitle="Configure rates, material prices, and engineering parameters for this project. Changes save automatically."
      />

      <Tabs defaultValue="labour">
        <TabsList>
          <TabsTrigger value="labour">Labour &amp; Crew</TabsTrigger>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="engineering">Engineering</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="admin">Admin &amp; Margin</TabsTrigger>
        </TabsList>

        {/* ============================== Labour ============================== */}
        <TabsContent value="labour" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Crew Type</CardTitle>
              <CardDescription>
                Employee crew uses hourly rates; subbie crew uses per-m² rates.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={config.crewType}
                onValueChange={(v) =>
                  setConfig({ ...config, crewType: v as CrewType })
                }
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Employee Crew">Employee Crew</SelectItem>
                  <SelectItem value="Subbie Crew">Subbie Crew</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Employee Rates</CardTitle>
                <CardDescription>Per hour</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(
                  [
                    ["employeeBuild", "Build"],
                    ["employeePost", "Post"],
                    ["employeeBackfill", "Backfill"],
                    ["employeeDrill", "Drill"],
                  ] as const
                ).map(([key, label]) => (
                  <PriceField
                    key={key}
                    label={label}
                    unit="/hr"
                    value={config.labourRates[key]}
                    onChange={(v) => setField("labourRates", key, v)}
                  />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Subbie Rates</CardTitle>
                <CardDescription>Per m²</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(
                  [
                    ["subbieBuild", "Build"],
                    ["subbiePost", "Post"],
                    ["subbieBackfill", "Backfill"],
                    ["subbieDrill", "Drill"],
                    ["subbieMachine", "Machine"],
                  ] as const
                ).map(([key, label]) => (
                  <PriceField
                    key={key}
                    label={label}
                    unit="/m²"
                    value={config.labourRates[key]}
                    onChange={(v) => setField("labourRates", key, v)}
                  />
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Machine Rates</CardTitle>
              <CardDescription>
                Daily rates for equipment. Drilling and backfill machine time is
                priced from the row named 8ton KPR, or the first row when no row
                has that name.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {config.machineRates.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="text"
                    className="h-8 flex-1 text-sm"
                    value={m.name}
                    onChange={(e) => {
                      const next = structuredClone(config);
                      next.machineRates[i].name = e.target.value;
                      setConfig(next);
                    }}
                  />
                  <DollarInput
                    value={m.rate}
                    onChange={(v) => {
                      const next = structuredClone(config);
                      next.machineRates[i].rate = v;
                      setConfig(next);
                    }}
                  />
                  <Input
                    type="text"
                    className="h-8 w-16 text-sm"
                    value={m.unit}
                    onChange={(e) => {
                      const next = structuredClone(config);
                      next.machineRates[i].unit = e.target.value;
                      setConfig(next);
                    }}
                  />
                  {drivingMachineIndex === i && (
                    <Badge variant="brand" className="shrink-0">
                      machine pricing
                    </Badge>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    title="Remove row"
                    disabled={config.machineRates.length === 1}
                    onClick={() => {
                      const next = structuredClone(config);
                      next.machineRates.splice(i, 1);
                      setConfig(next);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const next = structuredClone(config);
                  next.machineRates.push({
                    name: "New machine",
                    rate: 0,
                    unit: "Day",
                  });
                  setConfig(next);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add machine
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================ Materials ============================ */}
        <TabsContent value="materials" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Sleepers &amp; Supports
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(
                  [
                    ["superSleeper", "Super Sleeper", "ea"],
                    ["superSupport", "Super Support", "ea"],
                    ["wedges", "Wedges", "ea"],
                    ["concreteSleeper", "Concrete Sleeper", "ea"],
                  ] as const
                ).map(([key, label, unit]) => (
                  <PriceField
                    key={key}
                    label={label}
                    unit={`/${unit}`}
                    step="0.01"
                    value={config.materialPrices[key]}
                    onChange={(v) => setField("materialPrices", key, v)}
                  />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Concrete &amp; Gravel</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(
                  [
                    ["concreteRate", "Concrete", "m³"],
                    ["gravelRate", "Gravel", "m³"],
                  ] as const
                ).map(([key, label, unit]) => (
                  <PriceField
                    key={key}
                    label={label}
                    unit={`/${unit}`}
                    value={config.materialPrices[key]}
                    onChange={(v) => setField("materialPrices", key, v)}
                  />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Steel &amp; Posting Labour
                </CardTitle>
                <CardDescription>
                  Steel cost ($/LM) and posting labour ($/m²) per post size.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {config.engineering.postSizeRanges.map((range, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Badge variant="outline" className="w-20 justify-center">
                      {range.postSize}
                    </Badge>
                    <DollarInput
                      step="0.01"
                      value={range.pricePerMetre}
                      onChange={(v) => {
                        const next = structuredClone(config);
                        next.engineering.postSizeRanges[i].pricePerMetre = v;
                        setConfig(next);
                      }}
                    />
                    <span className="text-xs text-muted-foreground">/m steel</span>
                    <DollarInput
                      step="0.5"
                      value={range.postingLabourPerM2}
                      onChange={(v) => {
                        const next = structuredClone(config);
                        next.engineering.postSizeRanges[i].postingLabourPerM2 = v;
                        setConfig(next);
                      }}
                    />
                    <span className="text-xs text-muted-foreground">/m² labour</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fence Brackets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <PriceField
                  label="Bracket"
                  unit="/ea"
                  value={config.materialPrices.fenceBracket}
                  onChange={(v) => setField("materialPrices", "fenceBracket", v)}
                />
                <PriceField
                  label="Install labour"
                  unit="/ea"
                  value={config.materialPrices.fenceBracketLabour}
                  onChange={(v) =>
                    setField("materialPrices", "fenceBracketLabour", v)
                  }
                />
              </CardContent>
            </Card>

            <Card className="sm:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Backfill Materials</CardTitle>
                <CardDescription>
                  Geofabric rolls and ag-line per roll.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["geo1mX50m", "Geofab 0.9m × 50m", "roll"],
                    ["geo2mX50m", "Geofab 2m × 50m", "roll"],
                    ["geo1mX100m", "Geofab 0.9m × 100m", "roll"],
                    ["geo2mX100m", "Geofab 2m × 100m", "roll"],
                    ["agLine100mmX100m", "Ag Line 100mm × 100m", "roll"],
                  ] as const
                ).map(([key, label, unit]) => (
                  <PriceField
                    key={key}
                    label={label}
                    unit={`/${unit}`}
                    step="0.01"
                    labelWidth="w-44"
                    value={config.materialPrices[key]}
                    onChange={(v) => setField("materialPrices", key, v)}
                  />
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* =========================== Engineering ============================ */}
        <TabsContent value="engineering" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Embedment round-up</CardTitle>
              <CardDescription>
                Round each wall height up to a whole sleeper (200 mm) so the
                extra becomes in-ground embedment. This is the m² pricing basis
                (Take Off's “Eng m²” and the Review height-band summary). Turn
                it off to price on the actual measured height.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.engineering.embedmentRoundUp ?? true}
                  onChange={(e) =>
                    setField("engineering", "embedmentRoundUp", e.target.checked)
                  }
                  className="h-4 w-4 accent-foreground"
                />
                Round heights up for embedment
              </label>
              <NumberField
                label="Round-up increment"
                unit="m"
                step="0.05"
                value={config.engineering.embedmentIncrementM ?? 0.2}
                onChange={(v) =>
                  setField("engineering", "embedmentIncrementM", v)
                }
                disabled={!(config.engineering.embedmentRoundUp ?? true)}
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hole &amp; Pier Design</CardTitle>
                <CardDescription>Adjust for soil conditions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <NumberField
                  label="Hole size"
                  unit="mm"
                  value={config.engineering.holeSize}
                  onChange={(v) => setField("engineering", "holeSize", v)}
                />
                <NumberField
                  label="In-ground embedment ratio"
                  unit=": 1 (1 = 1:1)"
                  step="0.1"
                  value={config.engineering.postEmbedmentRatio ?? 1}
                  onChange={(v) =>
                    setField("engineering", "postEmbedmentRatio", v)
                  }
                />
                <NumberField
                  label="Hole depth over embedment"
                  unit="m"
                  step="0.1"
                  value={config.engineering.holeDepthOverEmbedmentM ?? 0.2}
                  onChange={(v) =>
                    setField("engineering", "holeDepthOverEmbedmentM", v)
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Post Size Ranges</CardTitle>
                <CardDescription>
                  Swap posts per height range for the soil conditions on site.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {config.engineering.postSizeRanges.map((range, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select
                      value={range.postSize}
                      onValueChange={(v) => {
                        if (!v) return;
                        const opt = POST_SIZE_OPTIONS.find(
                          (o) => o.postSize === v,
                        );
                        const next = structuredClone(config);
                        next.engineering.postSizeRanges[i].postSize = v;
                        if (opt) {
                          next.engineering.postSizeRanges[i].pricePerMetre =
                            opt.pricePerMetre;
                          next.engineering.postSizeRanges[i].lengthPerUnit =
                            opt.lengthPerUnit;
                          next.engineering.postSizeRanges[i].pricePerUnit =
                            opt.pricePerUnit;
                          next.engineering.postSizeRanges[
                            i
                          ].postingLabourPerM2 = opt.postingLabourPerM2;
                        }
                        setConfig(next);
                      }}
                    >
                      <SelectTrigger className="h-8 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {POST_SIZE_OPTIONS.map((o) => (
                          <SelectItem key={o.postSize} value={o.postSize}>
                            {o.postSize}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {i === 0 ? (
                      <NumberDraft
                        value={range.heightMin}
                        onCommit={(n) => {
                          const next = structuredClone(config);
                          const rows = next.engineering.postSizeRanges;
                          rows[0].heightMin = r2(
                            Math.min(n, r2(rows[0].heightMax - 0.1)),
                          );
                          rechainRanges(rows);
                          setConfig(next);
                        }}
                      />
                    ) : (
                      <span className="w-16 text-xs text-muted-foreground">
                        over {range.heightMin}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">to</span>
                    <NumberDraft
                      value={range.heightMax}
                      onCommit={(n) => {
                        const next = structuredClone(config);
                        const rows = next.engineering.postSizeRanges;
                        rows[i].heightMax = Math.max(
                          r2(n),
                          r2(rows[i].heightMin + 0.1),
                        );
                        rechainRanges(rows);
                        setConfig(next);
                      }}
                    />
                    <span className="text-xs text-muted-foreground">m</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      title="Remove row"
                      disabled={
                        config.engineering.postSizeRanges.length === 1
                      }
                      onClick={() => {
                        const next = structuredClone(config);
                        const rows = next.engineering.postSizeRanges;
                        const removedMin = rows[i].heightMin;
                        rows.splice(i, 1);
                        if (i === 0 && rows.length) {
                          rows[0].heightMin = removedMin;
                        }
                        rechainRanges(rows);
                        setConfig(next);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    const next = structuredClone(config);
                    const rows = next.engineering.postSizeRanges;
                    const last = rows[rows.length - 1];
                    rows.push({
                      ...structuredClone(last),
                      heightMin: last.heightMax,
                      heightMax: r2(last.heightMax + 1.0),
                    });
                    setConfig(next);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add range
                </Button>
                <p className="text-xs text-muted-foreground">
                  Ranges are chained so heights can never overlap or leave gaps.
                  A wall exactly on a boundary uses the lower range.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sleeper Length Rules</CardTitle>
                <CardDescription>Bay size by wall height</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="w-40 text-sm text-muted-foreground">
                    If height below
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    className="h-8 w-20 text-sm"
                    value={config.engineering.heightBelowThreshold}
                    onChange={(e) =>
                      setField(
                        "engineering",
                        "heightBelowThreshold",
                        parseFloat(e.target.value) || 0,
                      )
                    }
                  />
                  <span className="text-xs text-muted-foreground">m, use</span>
                  <Input
                    type="number"
                    step="0.1"
                    className="h-8 w-20 text-sm"
                    value={config.engineering.sleeperLengthBelow}
                    onChange={(e) =>
                      setField(
                        "engineering",
                        "sleeperLengthBelow",
                        parseFloat(e.target.value) || 0,
                      )
                    }
                  />
                  <span className="text-xs text-muted-foreground">m bay</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="w-40 text-sm text-muted-foreground">
                    If height above
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    className="h-8 w-20 text-sm"
                    value={config.engineering.heightAboveThreshold}
                    onChange={(e) =>
                      setField(
                        "engineering",
                        "heightAboveThreshold",
                        parseFloat(e.target.value) || 0,
                      )
                    }
                  />
                  <span className="text-xs text-muted-foreground">m, use</span>
                  <Input
                    type="number"
                    step="0.1"
                    className="h-8 w-20 text-sm"
                    value={config.engineering.sleeperLengthAbove}
                    onChange={(e) =>
                      setField(
                        "engineering",
                        "sleeperLengthAbove",
                        parseFloat(e.target.value) || 0,
                      )
                    }
                  />
                  <span className="text-xs text-muted-foreground">m bay</span>
                </div>
                <NumberField
                  label="Default bay size"
                  unit="m"
                  step="0.1"
                  value={config.engineering.defaultSleeperLength}
                  onChange={(v) =>
                    setField("engineering", "defaultSleeperLength", v)
                  }
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* =========================== Performance ============================ */}
        <TabsContent value="performance" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Production Rates</CardTitle>
              <CardDescription>
                Time estimates for scheduling and costing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(
                [
                  ["timeToDrill1LM", "Time to drill 1 LM", "minutes"],
                  ["buildCrewM2PerDay", "Build crew m²/day", "m²"],
                  ["workHours", "Work hours/day", "hours"],
                  ["breakTime", "Break time", "minutes"],
                  ["maxPostingPerDay", "Max posting/day", "m²"],
                ] as const
              ).map(([key, label, unit]) => (
                <NumberField
                  key={key}
                  label={label}
                  unit={unit}
                  step="0.1"
                  value={config.performance[key]}
                  onChange={(v) => setField("performance", key, v)}
                />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* =============================== Admin ============================== */}
        <TabsContent value="admin" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Admin &amp; Overheads</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <PriceField
                label="Engineering (Form 15)"
                labelWidth="w-40"
                value={config.admin.engineering}
                onChange={(v) => setField("admin", "engineering", v)}
              />
              <PriceField
                label="Form 12 (per lot)"
                labelWidth="w-40"
                value={config.admin.formPerLot}
                onChange={(v) => setField("admin", "formPerLot", v)}
              />
              <PriceField
                label="Mobe & Demobe"
                labelWidth="w-40"
                value={config.admin.mobeAndDemobe}
                onChange={(v) => setField("admin", "mobeAndDemobe", v)}
              />
              <div className="flex items-center gap-3">
                <label className="w-40 text-sm text-muted-foreground">Markup</label>
                <Input
                  type="number"
                  step="0.01"
                  className="h-8 w-24 text-sm"
                  value={config.admin.markup}
                  onChange={(e) =>
                    setField(
                      "admin",
                      "markup",
                      parseFloat(e.target.value) || 0,
                    )
                  }
                />
                <span className="text-xs text-muted-foreground">
                  ({(config.admin.markup * 100).toFixed(0)}%)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <label className="w-40 text-sm text-muted-foreground">Margin</label>
                <Input
                  type="number"
                  step="0.01"
                  className="h-8 w-24 text-sm"
                  value={config.admin.margin}
                  onChange={(e) =>
                    setField(
                      "admin",
                      "margin",
                      parseFloat(e.target.value) || 0,
                    )
                  }
                />
                <span className="text-xs text-muted-foreground">
                  ({(config.admin.margin * 100).toFixed(0)}%)
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Extra Over Bands</CardTitle>
              <CardDescription>
                Price multipliers by wall height range. The quote label is what
                prints on the Quotation for that band. Leave it blank to use the
                default range text.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="hidden gap-3 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:flex">
                <span className="w-32">Band name</span>
                <span className="flex-1">Quote label (prints on the quote)</span>
                <span className="w-14">Min m</span>
                <span className="w-14">Max m</span>
                <span className="w-16">Multiplier</span>
                <span className="w-8" />
              </div>
              {config.extraOverBands.map((band, i) => (
                <div key={i} className="flex flex-wrap items-center gap-3">
                  <Input
                    type="text"
                    className="h-8 w-32 text-sm"
                    value={band.label}
                    onChange={(e) => {
                      const next = structuredClone(config);
                      next.extraOverBands[i].label = e.target.value;
                      setConfig(next);
                    }}
                  />
                  <Input
                    type="text"
                    className="h-8 min-w-40 flex-1 text-sm"
                    value={band.quoteLabel ?? ""}
                    placeholder={defaultQuoteLabel(band)}
                    onChange={(e) => {
                      const next = structuredClone(config);
                      next.extraOverBands[i].quoteLabel = e.target.value;
                      setConfig(next);
                    }}
                  />
                  <Input
                    type="number"
                    step="0.1"
                    className="h-8 w-14 text-sm"
                    value={band.heightMin}
                    onChange={(e) => {
                      const next = structuredClone(config);
                      next.extraOverBands[i].heightMin =
                        parseFloat(e.target.value) || 0;
                      setConfig(next);
                    }}
                  />
                  <Input
                    type="number"
                    step="0.1"
                    className="h-8 w-14 text-sm"
                    value={band.heightMax}
                    onChange={(e) => {
                      const next = structuredClone(config);
                      next.extraOverBands[i].heightMax =
                        parseFloat(e.target.value) || 0;
                      setConfig(next);
                    }}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 w-16 text-sm"
                    value={band.multiplier}
                    onChange={(e) => {
                      const next = structuredClone(config);
                      next.extraOverBands[i].multiplier =
                        parseFloat(e.target.value) || 0;
                      setConfig(next);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    title="Remove row"
                    disabled={config.extraOverBands.length === 1}
                    onClick={() => {
                      const next = structuredClone(config);
                      next.extraOverBands.splice(i, 1);
                      setConfig(next);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const next = structuredClone(config);
                  next.extraOverBands.push({
                    label: "New band",
                    heightMin: 0,
                    heightMax: 0,
                    multiplier: 0,
                  });
                  setConfig(next);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add band
              </Button>
              <p className="text-xs text-muted-foreground">
                Bands with Upper or Lower in the name price the two tier walls.
                Keep those words in the name or two tier pricing falls back to
                the standard multipliers.
              </p>
              <p className="text-xs text-muted-foreground">
                Single tier walls only appear on the quote when their height
                falls inside one of these bands.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** A commit-on-blur number input for the chained post-size range fields.
 *  Clamping / re-chaining runs on commit, not per keystroke, so it never
 *  fights the user's typing. */
function NumberDraft({
  value,
  onCommit,
  className,
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
}) {
  return (
    <DraftInput
      type="number"
      step="0.1"
      className={className ?? "h-8 w-16 text-xs"}
      value={String(value)}
      onCommit={(s) => onCommit(parseFloat(s) || 0)}
    />
  );
}

function PriceField({
  label,
  unit,
  value,
  onChange,
  step,
  labelWidth = "w-32",
}: {
  label: string;
  unit?: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
  labelWidth?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className={`${labelWidth} text-sm text-muted-foreground`}>
        {label}
      </label>
      <DollarInput value={value} onChange={onChange} step={step} />
      {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
    </div>
  );
}

function NumberField({
  label,
  unit,
  value,
  onChange,
  step,
  disabled,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="w-40 text-sm text-muted-foreground">{label}</label>
      <Input
        type="number"
        step={step}
        disabled={disabled}
        className="h-8 w-24 text-sm"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
      <span className="text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}

function DollarInput({
  value,
  onChange,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: string;
}) {
  return (
    <div className="relative">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        $
      </span>
      <Input
        type="number"
        step={step}
        className="h-8 w-24 pl-5 text-sm"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}
