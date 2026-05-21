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
import { useProject } from "@/hooks/useProjects";
import { POST_SIZE_OPTIONS, defaultConfig } from "@/lib/engine/defaults";
import type { CrewType, ProjectConfig } from "@/types/db";

/**
 * Pricing & Performance — full project-config editor. Mirrors the BE
 * Landscapes layout (Labour, Materials, Engineering, Performance,
 * Admin). Writes go straight to `projects.config` via useProject.update,
 * so the dashboard / cost / quote pages all update instantly.
 */
export function PricingPerfPage() {
  const { id } = useParams<{ id: string }>();
  const { project, loading, update } = useProject(id);

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

  const config: ProjectConfig = project.config ?? defaultConfig;

  // Mutates one nested field then persists. structuredClone keeps the
  // engine-compute path (which reads `project.config` as immutable) from
  // accidentally sharing memory with React state.
  function setConfig(next: ProjectConfig) {
    void update({ config: next });
  }

  function setField<K extends keyof ProjectConfig>(
    section: K,
    field: string,
    value: number | string,
  ) {
    const next = structuredClone(config);
    // Section is a known nested object — cast through unknown to satisfy TS.
    (next[section] as unknown as Record<string, unknown>)[field] = value;
    setConfig(next);
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Pricing &amp; Performance
        </h2>
        <p className="text-muted-foreground">
          Configure rates, material prices, and engineering parameters for
          this project. Changes save automatically.
        </p>
      </div>

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
              <CardDescription>Daily rates for equipment</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {config.machineRates.map((m, i) => (
                  <div key={m.name} className="flex items-center gap-3">
                    <label className="w-24 truncate text-sm text-muted-foreground">
                      {m.name}
                    </label>
                    <DollarInput
                      value={m.rate}
                      onChange={(v) => {
                        const next = structuredClone(config);
                        next.machineRates[i].rate = v;
                        setConfig(next);
                      }}
                    />
                    <span className="text-xs text-muted-foreground">
                      /{m.unit}
                    </span>
                  </div>
                ))}
              </div>
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
                  <div key={`${range.postSize}-${i}`} className="flex items-center gap-3">
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
                  label="Height + factor"
                  unit="m buried"
                  step="0.1"
                  value={config.engineering.heightPlusFactor}
                  onChange={(v) =>
                    setField("engineering", "heightPlusFactor", v)
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
                  <div key={`${range.postSize}-${i}`} className="flex items-center gap-2">
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
                    <Input
                      type="number"
                      step="0.1"
                      className="h-8 w-16 text-xs"
                      value={range.heightMin}
                      onChange={(e) => {
                        const next = structuredClone(config);
                        next.engineering.postSizeRanges[i].heightMin =
                          parseFloat(e.target.value) || 0;
                        setConfig(next);
                      }}
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="number"
                      step="0.1"
                      className="h-8 w-16 text-xs"
                      value={range.heightMax}
                      onChange={(e) => {
                        const next = structuredClone(config);
                        next.engineering.postSizeRanges[i].heightMax =
                          parseFloat(e.target.value) || 0;
                        setConfig(next);
                      }}
                    />
                    <span className="text-xs text-muted-foreground">m</span>
                  </div>
                ))}
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
                Price multipliers by wall height range.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {config.extraOverBands.map((band, i) => (
                <div key={band.label} className="flex items-center gap-3">
                  <label className="w-32 text-sm text-muted-foreground">
                    {band.label}
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 w-20 text-sm"
                    value={band.multiplier}
                    onChange={(e) => {
                      const next = structuredClone(config);
                      next.extraOverBands[i].multiplier =
                        parseFloat(e.target.value) || 0;
                      setConfig(next);
                    }}
                  />
                  <span className="text-xs text-muted-foreground">
                    ({(band.multiplier * 100).toFixed(0)}% extra)
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
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
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="w-40 text-sm text-muted-foreground">{label}</label>
      <Input
        type="number"
        step={step}
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
