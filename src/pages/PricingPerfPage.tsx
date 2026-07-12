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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  excludeLineKey,
  excludeMatKey,
  excludeMatLineKey,
} from "@/lib/engine/exclusions";
import type { MaterialCategory } from "@/lib/engine/types";
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

/** Give legacy tier bands an explicit `tier` tag derived from the label, so a
 *  later rename can't break tier pricing. Returns true if anything changed. */
function tagLegacyTiers(cfg: ProjectConfig): boolean {
  let changed = false;
  for (const b of cfg.extraOverBands) {
    if (b.tier != null) continue;
    if (/upper/i.test(b.label)) {
      b.tier = "upper";
      changed = true;
    } else if (/lower/i.test(b.label)) {
      b.tier = "lower";
      changed = true;
    }
  }
  return changed;
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
    if (!project) return;
    const cloned = structuredClone(project.config ?? defaultConfig);
    const changed = tagLegacyTiers(cloned);
    setDraft(cloned);
    // Persist the backfilled tier tags once, only when a saved config already
    // exists (don't mint one for null-config projects).
    if (changed && project.config) void update({ config: cloned });
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

  // Include/exclude toggles write to cost_overrides (not config), so they
  // bypass the config draft/debounce and take effect immediately.
  const costOverrides = project.cost_overrides ?? {};
  const included = (key: string) => !costOverrides[key];
  const matIncluded = (cat: MaterialCategory) => included(excludeMatKey(cat));
  function setKeysExcluded(keys: string[], exclude: boolean) {
    const next = { ...costOverrides };
    for (const key of keys) {
      if (exclude) next[key] = 1;
      else delete next[key];
    }
    void update({ cost_overrides: next });
  }
  const setExcluded = (key: string, exclude: boolean) =>
    setKeysExcluded([key], exclude);
  const setMatIncluded = (cat: MaterialCategory, include: boolean) =>
    setExcluded(excludeMatKey(cat), !include);

  // Rename support: display-name overrides live in config.fieldLabels, keyed by
  // stable dotted ids. Editing writes to the config draft (instant + debounced);
  // clearing the text reverts to the default.
  function setFieldLabel(key: string, value: string) {
    const next = structuredClone(config);
    const labels = { ...(next.fieldLabels ?? {}) };
    const v = value.trim();
    if (v) labels[key] = v;
    else delete labels[key];
    next.fieldLabels = labels;
    setConfig(next);
  }
  const labelEdit = (key: string, fallback: string): LabelEdit => ({
    value: config.fieldLabels?.[key] ?? "",
    fallback,
    onCommit: (v) => setFieldLabel(key, v),
  });

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
                <EditableCardTitle
                  edit={labelEdit("card.employeeRates", "Employee Rates")}
                />
                <CardDescription>
                  Per hour. Switches apply when this crew type is selected. Each
                  rate feeds a fixed engine calculation, so new rows can't be
                  added here.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(
                  [
                    ["employeeBuild", "Build", excludeLineKey("build-labour-hrs")],
                    ["employeePost", "Post", excludeLineKey("post-labour-hrs")],
                    ["employeeBackfill", "Backfill", excludeLineKey("backfill-labour-hrs")],
                    ["employeeDrill", "Drill", excludeLineKey("drill-labour-hrs")],
                  ] as const
                ).map(([key, label, exKey]) => (
                  <PriceField
                    key={key}
                    label={label}
                    unit="/hr"
                    value={config.labourRates[key]}
                    onChange={(v) => setField("labourRates", key, v)}
                    labelEdit={labelEdit(`labourRates.${key}`, label)}
                    included={included(exKey)}
                    onIncludedChange={(v) => setExcluded(exKey, !v)}
                    dimmed={!included(exKey)}
                  />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <EditableCardTitle
                  edit={labelEdit("card.subbieRates", "Subbie Rates")}
                />
                <CardDescription>
                  Per m². Switches apply when this crew type is selected. Each
                  rate feeds a fixed engine calculation, so new rows can't be
                  added here.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(
                  [
                    ["subbieBuild", "Build", excludeLineKey("build-subbie-labour")],
                    ["subbiePost", "Post", null],
                    ["subbieBackfill", "Backfill", excludeLineKey("backfill-subbie-labour")],
                    ["subbieDrill", "Drill", excludeLineKey("drill-subbie-labour")],
                    ["subbieMachine", "Machine", excludeLineKey("drill-subbie-machine")],
                  ] as const
                ).map(([key, label, exKey]) => (
                  <PriceField
                    key={key}
                    label={label}
                    unit="/m²"
                    value={config.labourRates[key]}
                    onChange={(v) => setField("labourRates", key, v)}
                    labelEdit={labelEdit(`labourRates.${key}`, label)}
                    included={exKey ? included(exKey) : undefined}
                    onIncludedChange={
                      exKey ? (v) => setExcluded(exKey, !v) : undefined
                    }
                    dimmed={exKey ? !included(exKey) : false}
                  />
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <EditableCardTitle
                edit={labelEdit("card.machineRates", "Machine Rates")}
              />
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
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <EditableCardTitle
                      edit={labelEdit("card.sleepers", "Sleepers & Supports")}
                    />
                  </div>
                  <IncludeToggle
                    checked={matIncluded("Sleepers")}
                    onChange={(v) => setMatIncluded("Sleepers", v)}
                  />
                </div>
                <CardDescription>
                  Unticked items are left out of the cost breakdown, materials
                  order and quotation.
                </CardDescription>
              </CardHeader>
              <CardContent
                className={cn(
                  "space-y-3 transition-opacity",
                  !matIncluded("Sleepers") && "opacity-50",
                )}
              >
                {(
                  [
                    ["superSleeper", "Super Sleeper", "ea", excludeLineKey("build-super-sleepers")],
                    ["superSupport", "Super Support", "ea", excludeLineKey("build-super-supports")],
                    ["wedges", "Wedges", "ea", excludeMatLineKey("Sleepers", "Wedges")],
                    ["concreteSleeper", "Concrete Sleeper", "ea", excludeLineKey("build-concrete-sleepers")],
                  ] as const
                ).map(([key, label, unit, exKey]) => {
                  const master = matIncluded("Sleepers");
                  const own = !included(exKey);
                  return (
                    <PriceField
                      key={key}
                      label={label}
                      unit={`/${unit}`}
                      step="0.01"
                      value={config.materialPrices[key]}
                      onChange={(v) => setField("materialPrices", key, v)}
                      labelEdit={labelEdit(`materialPrices.${key}`, label)}
                      included={master && !own}
                      toggleDisabled={!master}
                      onIncludedChange={(v) => setExcluded(exKey, !v)}
                      dimmed={own}
                      toggleTitle={
                        key === "wedges"
                          ? "Affects the materials order only"
                          : undefined
                      }
                    />
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <EditableCardTitle
                  edit={labelEdit("card.concreteGravel", "Concrete & Gravel")}
                />
                <CardDescription>
                  Unticked items are left out of the cost breakdown, materials
                  order and quotation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(
                  [
                    ["concreteRate", "Concrete", "m³", "Concrete"],
                    ["gravelRate", "Gravel", "m³", "Gravel"],
                  ] as const
                ).map(([key, label, unit, cat]) => {
                  const inc = matIncluded(cat);
                  return (
                    <PriceField
                      key={key}
                      label={label}
                      unit={`/${unit}`}
                      value={config.materialPrices[key]}
                      onChange={(v) => setField("materialPrices", key, v)}
                      labelEdit={labelEdit(`materialPrices.${key}`, label)}
                      included={inc}
                      onIncludedChange={(v) => setMatIncluded(cat, v)}
                      dimmed={!inc}
                    />
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <EditableCardTitle
                      edit={labelEdit("card.steel", "Steel & Posting Labour")}
                    />
                  </div>
                  <IncludeToggle
                    label="Include steel in costings"
                    checked={matIncluded("Steel")}
                    onChange={(v) => setMatIncluded("Steel", v)}
                  />
                </div>
                <CardDescription>
                  Steel cost ($/LM) and posting labour ($/m²) per post size.
                  Unticking removes the steel material from the costs, order and
                  quotation; posting labour stays.
                </CardDescription>
              </CardHeader>
              <CardContent
                className={cn(
                  "space-y-3 transition-opacity",
                  !matIncluded("Steel") && "opacity-50",
                )}
              >
                {config.engineering.postSizeRanges.map((range, i) => {
                  const master = matIncluded("Steel");
                  const exKey = excludeLineKey(`post-steel-${range.postSize}`);
                  const own = !included(exKey);
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center gap-3 transition-opacity",
                        own && "opacity-50",
                      )}
                    >
                      <Switch
                        size="sm"
                        checked={master && !own}
                        disabled={!master}
                        title="Include this steel size in the costs and quotation"
                        onCheckedChange={(v) => setExcluded(exKey, !v)}
                      />
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
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <EditableCardTitle
                      edit={labelEdit("card.fenceBrackets", "Fence Brackets")}
                    />
                  </div>
                  <IncludeToggle
                    checked={matIncluded("Fence Brackets")}
                    onChange={(v) => setMatIncluded("Fence Brackets", v)}
                  />
                </div>
                <CardDescription>
                  Unticked items are left out of the cost breakdown, materials
                  order and quotation.
                </CardDescription>
              </CardHeader>
              <CardContent
                className={cn(
                  "space-y-3 transition-opacity",
                  !matIncluded("Fence Brackets") && "opacity-50",
                )}
              >
                <PriceField
                  label="Bracket"
                  unit="/ea"
                  value={config.materialPrices.fenceBracket}
                  onChange={(v) => setField("materialPrices", "fenceBracket", v)}
                  labelEdit={labelEdit("materialPrices.fenceBracket", "Bracket")}
                  included={
                    matIncluded("Fence Brackets") &&
                    included(excludeLineKey("other-brackets-material"))
                  }
                  toggleDisabled={!matIncluded("Fence Brackets")}
                  onIncludedChange={(v) =>
                    setExcluded(excludeLineKey("other-brackets-material"), !v)
                  }
                  dimmed={!included(excludeLineKey("other-brackets-material"))}
                />
                <PriceField
                  label="Install labour"
                  unit="/ea"
                  value={config.materialPrices.fenceBracketLabour}
                  labelEdit={labelEdit(
                    "materialPrices.fenceBracketLabour",
                    "Install labour",
                  )}
                  included={
                    matIncluded("Fence Brackets") &&
                    included(excludeLineKey("other-brackets-labour"))
                  }
                  toggleDisabled={!matIncluded("Fence Brackets")}
                  onIncludedChange={(v) =>
                    setExcluded(excludeLineKey("other-brackets-labour"), !v)
                  }
                  dimmed={!included(excludeLineKey("other-brackets-labour"))}
                  onChange={(v) =>
                    setField("materialPrices", "fenceBracketLabour", v)
                  }
                />
              </CardContent>
            </Card>

            <Card className="sm:col-span-2">
              <CardHeader>
                <EditableCardTitle
                  edit={labelEdit("card.backfill", "Backfill Materials")}
                />
                <CardDescription>
                  Geofabric rolls and ag-line per roll. Unticked items are left
                  out of the cost breakdown, materials order and quotation.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["geo1mX50m", "Geofab 0.9m × 50m", "Geofabric", excludeLineKey("backfill-geo1m")],
                    ["geo2mX50m", "Geofab 2m × 50m", "Geofabric", excludeLineKey("backfill-geo2m")],
                    ["agLine100mmX100m", "Ag Line 100mm × 100m", "Ag Line", excludeLineKey("backfill-agline")],
                  ] as const
                ).map(([key, label, group, exKey]) => {
                  const master = matIncluded(group);
                  const own = !included(exKey);
                  return (
                    <PriceField
                      key={key}
                      label={label}
                      unit="/roll"
                      step="0.01"
                      labelWidth="w-44"
                      value={config.materialPrices[key]}
                      onChange={(v) => setField("materialPrices", key, v)}
                      labelEdit={labelEdit(`materialPrices.${key}`, label)}
                      included={master && !own}
                      toggleDisabled={!master}
                      toggleTitle={
                        !master
                          ? "Turned off on the Materials Order page"
                          : undefined
                      }
                      onIncludedChange={(v) => setExcluded(exKey, !v)}
                      dimmed={!master || own}
                    />
                  );
                })}
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
              <div className="flex items-center gap-2 text-sm">
                <Switch
                  size="sm"
                  checked={config.engineering.embedmentRoundUp ?? true}
                  onCheckedChange={(v) =>
                    setField("engineering", "embedmentRoundUp", v)
                  }
                  aria-label="Round heights up for embedment"
                  title="Round each wall height up to a whole sleeper for the m² pricing basis"
                />
                <span>Round heights up for embedment</span>
              </div>
              <NumberField
                label="Round-up increment"
                unit="m"
                step="0.05"
                value={config.engineering.embedmentIncrementM ?? 0.2}
                onChange={(v) =>
                  setField("engineering", "embedmentIncrementM", v)
                }
                disabled={!(config.engineering.embedmentRoundUp ?? true)}
                labelEdit={labelEdit(
                  "engineering.embedmentIncrement",
                  "Round-up increment",
                )}
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <EditableCardTitle
                  edit={labelEdit("card.holePier", "Hole & Pier Design")}
                />
                <CardDescription>Adjust for soil conditions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <NumberField
                  label="Hole size"
                  unit="mm"
                  value={config.engineering.holeSize}
                  onChange={(v) => setField("engineering", "holeSize", v)}
                  labelEdit={labelEdit("engineering.holeSize", "Hole size")}
                />
                <NumberField
                  label="In-ground embedment ratio"
                  unit=": 1 (1 = 1:1)"
                  step="0.1"
                  value={config.engineering.postEmbedmentRatio ?? 1}
                  onChange={(v) =>
                    setField("engineering", "postEmbedmentRatio", v)
                  }
                  labelEdit={labelEdit(
                    "engineering.postEmbedmentRatio",
                    "In-ground embedment ratio",
                  )}
                />
                <NumberField
                  label="Hole depth over embedment"
                  unit="m"
                  step="0.1"
                  value={config.engineering.holeDepthOverEmbedmentM ?? 0.2}
                  onChange={(v) =>
                    setField("engineering", "holeDepthOverEmbedmentM", v)
                  }
                  labelEdit={labelEdit(
                    "engineering.holeDepthOverEmbedment",
                    "Hole depth over embedment",
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <EditableCardTitle
                  edit={labelEdit("card.postRanges", "Post Size Ranges")}
                />
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
                <EditableCardTitle
                  edit={labelEdit("card.sleeperRules", "Sleeper Length Rules")}
                />
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
                  labelEdit={labelEdit(
                    "engineering.defaultSleeperLength",
                    "Default bay size",
                  )}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* =========================== Performance ============================ */}
        <TabsContent value="performance" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <EditableCardTitle
                edit={labelEdit("card.production", "Production Rates")}
              />
              <CardDescription>
                Time estimates for scheduling and costing. These inputs drive the
                calculations, so they can be renamed but not switched off.
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
                  labelEdit={labelEdit(`performance.${key}`, label)}
                />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* =============================== Admin ============================== */}
        <TabsContent value="admin" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <EditableCardTitle
                edit={labelEdit("card.adminOverheads", "Admin & Overheads")}
              />
            </CardHeader>
            <CardContent className="space-y-3">
              <PriceField
                label="Engineering (Form 15)"
                labelWidth="w-40"
                value={config.admin.engineering}
                onChange={(v) => setField("admin", "engineering", v)}
                labelEdit={labelEdit(
                  "admin.engineering",
                  "Engineering (Form 15)",
                )}
                included={included(excludeLineKey("eng-form15"))}
                onIncludedChange={(v) =>
                  setExcluded(excludeLineKey("eng-form15"), !v)
                }
                dimmed={!included(excludeLineKey("eng-form15"))}
              />
              <PriceField
                label="Form 12 (per lot)"
                labelWidth="w-40"
                value={config.admin.formPerLot}
                onChange={(v) => setField("admin", "formPerLot", v)}
                labelEdit={labelEdit("admin.formPerLot", "Form 12 (per lot)")}
                included={included(excludeLineKey("eng-form12"))}
                onIncludedChange={(v) =>
                  setExcluded(excludeLineKey("eng-form12"), !v)
                }
                dimmed={!included(excludeLineKey("eng-form12"))}
              />
              {(() => {
                const mobeKeys = [
                  excludeLineKey("other-establishment"),
                  excludeLineKey("other-deestablishment"),
                ];
                const mobeIncluded = mobeKeys.every(included);
                return (
                  <PriceField
                    label="Mobe & Demobe"
                    labelWidth="w-40"
                    value={config.admin.mobeAndDemobe}
                    onChange={(v) => setField("admin", "mobeAndDemobe", v)}
                    labelEdit={labelEdit("admin.mobeAndDemobe", "Mobe & Demobe")}
                    included={mobeIncluded}
                    onIncludedChange={(v) => setKeysExcluded(mobeKeys, !v)}
                    dimmed={!mobeIncluded}
                    toggleTitle="Includes establishment and de-establishment"
                  />
                );
              })()}
              <div className="flex items-center gap-3">
                <EditableLabel
                  edit={labelEdit("admin.markup", "Markup")}
                  className="w-40"
                />
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
                <EditableLabel
                  edit={labelEdit("admin.margin", "Margin")}
                  className="w-40"
                />
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
              <EditableCardTitle
                edit={labelEdit("card.extraOverBands", "Extra Over Bands")}
              />
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
                <span className="w-24">Tier</span>
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
                  {band.tier ? (
                    <Badge
                      variant="brand"
                      className="w-24 justify-center capitalize"
                    >
                      {band.tier} tier
                    </Badge>
                  ) : (
                    <Select
                      value="single"
                      onValueChange={(v) => {
                        if (!v) return;
                        const next = structuredClone(config);
                        if (v === "single") delete next.extraOverBands[i].tier;
                        else
                          next.extraOverBands[i].tier = v as "upper" | "lower";
                        setConfig(next);
                      }}
                    >
                      <SelectTrigger className="h-8 w-24 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Single</SelectItem>
                        <SelectItem value="upper">Upper</SelectItem>
                        <SelectItem value="lower">Lower</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
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
                Tier bands price the upper and lower walls of a two tier build.
                The tier tag keeps that working no matter what the band is named.
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

type LabelEdit = { value: string; fallback: string; onCommit: (v: string) => void };

/** A quiet inline text field for renaming an otherwise-fixed label. Shows the
 *  default as placeholder until renamed; clearing reverts to the default. */
function EditableLabel({
  edit,
  className,
}: {
  edit: LabelEdit;
  className?: string;
}) {
  return (
    <DraftInput
      value={edit.value}
      placeholder={edit.fallback}
      onCommit={edit.onCommit}
      className={cn(
        "-ml-1 h-7 border-transparent bg-transparent px-1 text-sm text-muted-foreground hover:border-input focus:border-input",
        className,
      )}
    />
  );
}

/** An editable card title (same fieldLabels map, "card.*" keys). */
function EditableCardTitle({ edit }: { edit: LabelEdit }) {
  return (
    <DraftInput
      value={edit.value}
      placeholder={edit.fallback}
      onCommit={edit.onCommit}
      className="-ml-1 h-8 w-full border-transparent bg-transparent px-1 text-base font-semibold hover:border-input focus:border-input"
    />
  );
}

/** A labelled include/exclude switch for the Materials feature toggles. */
function IncludeToggle({
  checked,
  onChange,
  label = "Include in costings",
}: {
  checked: boolean;
  onChange: (include: boolean) => void;
  label?: string;
}) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-xs font-normal text-muted-foreground">
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
      {label}
    </span>
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
  included,
  onIncludedChange,
  toggleDisabled,
  toggleTitle,
  dimmed,
  labelEdit,
}: {
  label: string;
  unit?: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
  labelWidth?: string;
  /** When set, a leading switch includes / excludes this line from costings. */
  included?: boolean;
  onIncludedChange?: (include: boolean) => void;
  toggleDisabled?: boolean;
  toggleTitle?: string;
  dimmed?: boolean;
  /** When set, the label becomes an inline rename field. */
  labelEdit?: LabelEdit;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 transition-opacity",
        dimmed && "opacity-50",
      )}
    >
      {onIncludedChange && (
        <Switch
          size="sm"
          checked={!!included}
          disabled={toggleDisabled}
          onCheckedChange={onIncludedChange}
          title={
            toggleTitle ??
            (toggleDisabled
              ? "Turned off by the card toggle"
              : "Include this line in the costs and quotation")
          }
        />
      )}
      {labelEdit ? (
        <EditableLabel edit={labelEdit} className={labelWidth} />
      ) : (
        <label className={`${labelWidth} text-sm text-muted-foreground`}>
          {label}
        </label>
      )}
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
  labelEdit,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
  disabled?: boolean;
  labelEdit?: LabelEdit;
}) {
  return (
    <div className="flex items-center gap-3">
      {labelEdit ? (
        <EditableLabel edit={labelEdit} className="w-40" />
      ) : (
        <label className="w-40 text-sm text-muted-foreground">{label}</label>
      )}
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
