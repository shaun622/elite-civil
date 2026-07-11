import { Fragment, useState, type ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  ChevronRight,
  FileText,
  Info,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { DraftInput } from "@/components/ui/draft-input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useProject } from "@/hooks/useProjects";
import { useProjectWalls } from "@/hooks/useProjectWalls";
import { calculateBundle } from "@/lib/engine/adapter";
import type { QuotationLineItem, RateBreakdown } from "@/lib/engine/types";
import type {
  ExtraOverItem,
  QuoteCustomLine,
  QuoteOverrides,
} from "@/types/db";

const aud = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
});

function fmt(v: number): string {
  return aud.format(v);
}

const DEFAULT_SCHEDULE_BLURB =
  "Retaining walls complete, including certification (Form 15 + Form 12), drainage outlets, and safety fence.";

/**
 * Quotation — the customer-facing pricing schedule and contract document.
 * Every field is editable as a display-only override: per-line qty / rate /
 * description, add / hide lines, the header, the summary, and all boilerplate.
 * None of it feeds the engine — overrides live in cost_overrides
 * ("quote_rate:" / "quote_qty:") and project.quote_overrides. Print-friendly
 * via window.print() (edit chrome is hidden and inputs render as plain text).
 */
export function QuotationPage() {
  const { id } = useParams<{ id: string }>();
  const { project, loading: projectLoading, update } = useProject(id);
  const { walls, loading: wallsLoading } = useProjectWalls(project?.id);
  const [expandedLine, setExpandedLine] = useState<string | null>(null);

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
  const engineLines = bundle.quotationLines;
  const breakdown = bundle.costBreakdown;
  const qo: QuoteOverrides = project.quote_overrides ?? {};
  const lineOv = qo.lines ?? {};
  const customLines = qo.customLines ?? [];
  const extras = project.extra_over_items ?? [];

  const visibleEngine = engineLines.filter((l) => !lineOv[l.key]?.hidden);
  const hiddenCount = engineLines.length - visibleEngine.length;

  const enginesTotal = visibleEngine.reduce((s, l) => s + l.total, 0);
  const customTotal = customLines.reduce((s, c) => s + c.qty * c.rate, 0);
  const extrasTotal = extras.reduce((s, i) => s + i.qty * i.rate, 0);
  const linesTotal = enginesTotal + customTotal;
  const totalExGST = linesTotal + extrasTotal;

  const summaryDefaults = {
    totalM2: breakdown.totalM2.toFixed(1),
    lots: String(bundle.uniqueLotCount),
    segments: String(
      new Set(bundle.calculatedWalls.map((w) => w.sourceId ?? w.id)).size,
    ),
  };

  // ---- writers -----------------------------------------------------------
  function writeQo(next: QuoteOverrides) {
    void update({ quote_overrides: next });
  }

  function setLineField(
    key: string,
    patch: { description?: string | null; hidden?: boolean },
  ) {
    const lines = { ...(qo.lines ?? {}) };
    const cur = { ...(lines[key] ?? {}) };
    if ("description" in patch) {
      const d = patch.description;
      if (d == null || d.trim() === "") delete cur.description;
      else cur.description = d;
    }
    if ("hidden" in patch) {
      if (patch.hidden) cur.hidden = true;
      else delete cur.hidden;
    }
    if (cur.description === undefined && !cur.hidden) delete lines[key];
    else lines[key] = cur;
    writeQo({ ...qo, lines });
  }

  function restoreAllHidden() {
    const lines = { ...(qo.lines ?? {}) };
    for (const k of Object.keys(lines)) {
      const cur = { ...lines[k] };
      delete cur.hidden;
      if (cur.description === undefined && !cur.hidden) delete lines[k];
      else lines[k] = cur;
    }
    writeQo({ ...qo, lines });
  }

  function setCustomLines(next: QuoteCustomLine[]) {
    writeQo({ ...qo, customLines: next });
  }
  function addCustomLine() {
    setCustomLines([
      ...customLines,
      { id: crypto.randomUUID(), description: "", qty: 1, unit: "m2", rate: 0 },
    ]);
  }
  function patchCustomLine(id2: string, patch: Partial<QuoteCustomLine>) {
    setCustomLines(customLines.map((c) => (c.id === id2 ? { ...c, ...patch } : c)));
  }
  function removeCustomLine(id2: string) {
    setCustomLines(customLines.filter((c) => c.id !== id2));
  }

  function setSummary(field: "totalM2" | "lots" | "segments", value: string | null) {
    const summary = { ...(qo.summary ?? {}) };
    if (value == null || value.trim() === "") delete summary[field];
    else summary[field] = value;
    writeQo({ ...qo, summary });
  }

  function setQoText(
    field: "scheduleDescription" | "designParams" | "terms" | "inclusions" | "exclusions",
    value: string | null,
  ) {
    const next = { ...qo };
    if (value == null || value.trim() === "") delete next[field];
    else next[field] = value;
    writeQo(next);
  }

  function setRateOverride(key: string, value: number | null) {
    setNumericOverride(`quote_rate:${key}`, value);
  }
  function setQtyOverride(key: string, value: number | null) {
    setNumericOverride(`quote_qty:${key}`, value);
  }
  function setNumericOverride(k: string, value: number | null) {
    const next = { ...(project!.cost_overrides ?? {}) } as Record<string, number>;
    if (value == null || !Number.isFinite(value) || value < 0) delete next[k];
    else next[k] = value;
    void update({ cost_overrides: next });
  }

  function updateExtras(next: ExtraOverItem[]) {
    void update({ extra_over_items: next });
  }
  function addExtra() {
    updateExtras([
      ...extras,
      { id: crypto.randomUUID(), description: "", qty: 1, unit: "EA", rate: 0 },
    ]);
  }
  function patchExtra(itemId: string, patch: Partial<ExtraOverItem>) {
    updateExtras(extras.map((x) => (x.id === itemId ? { ...x, ...patch } : x)));
  }
  function removeExtra(itemId: string) {
    updateExtras(extras.filter((x) => x.id !== itemId));
  }

  if (bundle.entries.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          Add wall measurements in Take Off to generate a quotation.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6 p-6">
      <PageHeader
        eyebrow="Quote"
        icon={FileText}
        as="h2"
        title="Quotation"
        subtitle={`Generated pricing for ${project.name}`}
        actions={
          <Button
            variant="outline"
            className="print:hidden"
            onClick={() => window.print()}
          >
            Print / save PDF
          </Button>
        }
      />

      {/* Project header */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <EditField
              label="Project"
              value={project.name}
              onCommit={(v) => void update({ name: v })}
            />
            <EditField
              label="Quote number"
              value={project.quote_number ?? ""}
              placeholder="Not set"
              onCommit={(v) => void update({ quote_number: v || null })}
            />
            <EditField
              label="Client"
              value={project.client_name ?? ""}
              placeholder="Not set"
              onCommit={(v) => void update({ client_name: v || null })}
            />
            <EditField
              label="Contact"
              value={project.contact_name ?? ""}
              placeholder="Not set"
              onCommit={(v) => void update({ contact_name: v || null })}
            />
          </div>
          <Separator className="my-4" />
          <EditableText
            value={project.description ?? ""}
            placeholder="Add a description / preamble…"
            multiline
            onCommit={(v) => void update({ description: v || null })}
            displayClassName="text-sm text-muted-foreground"
          />
        </CardContent>
      </Card>

      {/* Wall summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wall summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6">
            <EditStat
              label="Total m²"
              computed={summaryDefaults.totalM2}
              override={qo.summary?.totalM2}
              onCommit={(v) => setSummary("totalM2", v)}
              onReset={() => setSummary("totalM2", null)}
            />
            <EditStat
              label="Lots"
              computed={summaryDefaults.lots}
              override={qo.summary?.lots}
              onCommit={(v) => setSummary("lots", v)}
              onReset={() => setSummary("lots", null)}
            />
            <EditStat
              label="Segments"
              computed={summaryDefaults.segments}
              override={qo.summary?.segments}
              onCommit={(v) => setSummary("segments", v)}
              onReset={() => setSummary("segments", null)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Pricing schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pricing schedule</CardTitle>
          <CardDescription>
            <EditableText
              value={qo.scheduleDescription ?? DEFAULT_SCHEDULE_BLURB}
              overridden={qo.scheduleDescription != null}
              multiline
              onCommit={(v) =>
                setQoText(
                  "scheduleDescription",
                  v === DEFAULT_SCHEDULE_BLURB ? null : v,
                )
              }
              onReset={() => setQoText("scheduleDescription", null)}
              displayClassName="text-sm text-muted-foreground"
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate (ex GST)</TableHead>
                <TableHead className="text-right">Total (ex GST)</TableHead>
                <TableHead className="w-10 print:hidden"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleEngine.map((line) => {
                const bd = line.rateBreakdown;
                const isOpen = expandedLine === line.key;
                const rateTip = bd
                  ? `${fmt(bd.directCostPerM2)}/m² direct cost × ${(1 + bd.markup).toFixed(2)} markup × ${(1 + bd.margin).toFixed(2)} margin${bd.bandMultiplier ? ` × ${(1 + bd.bandMultiplier).toFixed(2)} band` : ""} = ${fmt(line.rate)}/m²`
                  : undefined;
                const descOv = lineOv[line.key]?.description;
                return (
                  <Fragment key={line.key}>
                    <TableRow>
                      <TableCell className="text-sm">
                        <span className="inline-flex items-center gap-1.5">
                          {bd && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedLine(isOpen ? null : line.key)
                              }
                              title="How is this rate calculated?"
                              className="text-muted-foreground hover:text-foreground print:hidden"
                            >
                              <ChevronRight
                                className={`h-3.5 w-3.5 transition-transform ${
                                  isOpen ? "rotate-90" : ""
                                }`}
                              />
                            </button>
                          )}
                          <EditableText
                            value={descOv ?? line.description}
                            overridden={descOv != null}
                            onCommit={(v) =>
                              setLineField(line.key, {
                                description: v === line.description ? null : v,
                              })
                            }
                            onReset={() =>
                              setLineField(line.key, { description: null })
                            }
                          />
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <EditableQty
                          line={line}
                          onOverride={(v) => setQtyOverride(line.key, v)}
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <EditableRate
                          line={line}
                          rateTip={rateTip}
                          onOverride={(v) => setRateOverride(line.key, v)}
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {fmt(line.total)}
                      </TableCell>
                      <TableCell className="print:hidden">
                        <button
                          type="button"
                          onClick={() =>
                            setLineField(line.key, { hidden: true })
                          }
                          title="Hide this line from the quote"
                          className="text-muted-foreground/60 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                    {bd && isOpen && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30 print:hidden">
                        <TableCell colSpan={5} className="py-2">
                          <RateBreakdownDetail rate={line.rate} bd={bd} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}

              {customLines.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <DraftInput
                      className="h-8 text-sm"
                      placeholder="Custom line description"
                      value={c.description}
                      onCommit={(v) => patchCustomLine(c.id, { description: v })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <DraftInput
                        type="number"
                        step="0.1"
                        className="h-8 w-16 text-right text-sm"
                        value={String(c.qty)}
                        onCommit={(v) =>
                          patchCustomLine(c.id, { qty: parseFloat(v) || 0 })
                        }
                      />
                      <DraftInput
                        className="h-8 w-12 text-sm"
                        placeholder="unit"
                        value={c.unit}
                        onCommit={(v) => patchCustomLine(c.id, { unit: v })}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DraftInput
                      type="number"
                      step="0.01"
                      className="ml-auto h-8 w-28 text-right text-sm"
                      value={String(c.rate)}
                      onCommit={(v) =>
                        patchCustomLine(c.id, { rate: parseFloat(v) || 0 })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {fmt(c.qty * c.rate)}
                  </TableCell>
                  <TableCell className="print:hidden">
                    <button
                      type="button"
                      onClick={() => removeCustomLine(c.id)}
                      title="Delete this line"
                      className="text-muted-foreground/60 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}

              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-right text-sm text-muted-foreground"
                >
                  Subtotal
                </TableCell>
                <TableCell className="text-right text-sm">
                  {fmt(linesTotal)}
                </TableCell>
                <TableCell className="print:hidden"></TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 print:hidden">
            <Button variant="outline" size="sm" onClick={addCustomLine}>
              <Plus className="mr-1 h-4 w-4" />
              Add line
            </Button>
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={restoreAllHidden}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {hiddenCount} hidden line{hiddenCount === 1 ? "" : "s"}: restore
                all
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Extra Over items */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base">Extra Over items</CardTitle>
              <CardDescription>
                Custom line items added during plan review (e.g. site access,
                drainage, tree removal).
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="print:hidden"
              onClick={addExtra}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add line
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {extras.length === 0 ? (
            <div className="px-6 pb-6 text-sm text-muted-foreground">
              No extra over items added.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-20 text-right">Qty</TableHead>
                  <TableHead className="w-20">Unit</TableHead>
                  <TableHead className="w-32 text-right">Rate (ex GST)</TableHead>
                  <TableHead className="w-32 text-right">Total (ex GST)</TableHead>
                  <TableHead className="w-10 print:hidden"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {extras.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <DraftInput
                        className="h-8 text-sm"
                        placeholder="e.g. Tree removal at lot 503"
                        value={item.description}
                        onCommit={(v) =>
                          patchExtra(item.id, { description: v })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <DraftInput
                        type="number"
                        step="0.1"
                        className="h-8 w-16 text-right text-sm"
                        value={String(item.qty)}
                        onCommit={(v) =>
                          patchExtra(item.id, { qty: parseFloat(v) || 0 })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <DraftInput
                        className="h-8 w-16 text-sm"
                        value={item.unit}
                        onCommit={(v) => patchExtra(item.id, { unit: v })}
                      />
                    </TableCell>
                    <TableCell>
                      <DraftInput
                        type="number"
                        step="0.01"
                        className="h-8 w-28 text-right text-sm"
                        value={String(item.rate)}
                        onCommit={(v) =>
                          patchExtra(item.id, { rate: parseFloat(v) || 0 })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {fmt(item.qty * item.rate)}
                    </TableCell>
                    <TableCell className="print:hidden">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeExtra(item.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-right text-sm text-muted-foreground"
                  >
                    Extras subtotal
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {fmt(extrasTotal)}
                  </TableCell>
                  <TableCell className="print:hidden"></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Grand total */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total ex GST</span>
            <span className="text-2xl font-bold">{fmt(totalExGST)}</span>
          </div>
          <Separator className="my-3" />
          <div className="space-y-1.5 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>GST (10%)</span>
              <span>{fmt(totalExGST * 0.1)}</span>
            </div>
            <div className="flex items-center justify-between font-medium text-foreground">
              <span>Total inc GST</span>
              <span>{fmt(totalExGST * 1.1)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Design parameters */}
      <EditableSection
        title="Design parameters (assumed)"
        description="This pricing is based on the following design criteria."
        value={qo.designParams}
        defaultText={DEFAULT_DESIGN_PARAMS_TEXT}
        onCommit={(v) => setQoText("designParams", v)}
        onReset={() => setQoText("designParams", null)}
        defaultRender={
          <>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>5 kPa surcharge loading</li>
              <li>Minimum 150 kPa bearing capacity</li>
              <li>Soil density of 19 kN/m³</li>
              <li>Friction angle of 30°</li>
              <li>Drained cohesion of 1 kPa</li>
              <li>Stiff clay subgrade (~100 kPa)</li>
            </ul>
            <p className="pt-2 text-xs italic">
              Any variation to these parameters may result in a variation to
              cost.
            </p>
          </>
        }
      />

      {/* Terms & Conditions */}
      <EditableSection
        title="Terms & Conditions"
        value={qo.terms}
        defaultText={DEFAULT_TERMS_TEXT}
        onCommit={(v) => setQoText("terms", v)}
        onReset={() => setQoText("terms", null)}
        defaultRender={
          <>
            <p>
              All rates are subject to final engineering design, certification,
              and approval.
            </p>
            <p>
              This proposal is based on construction within a civil subdivision
              environment under a Principal Contractor and assumes coordinated
              site access, sequencing, and preparation.
            </p>
            <BulletBlock
              title="A mobilisation period of 4–6 weeks applies from:"
              items={[
                "Acceptance of quotation",
                "Issue of approved-for-construction (IFC) drawings in PDF and CAD",
                "Receipt of all required reports and approvals",
              ]}
            />
            <BulletBlock
              title="The Principal Contractor is responsible for:"
              items={[
                "Site access, traffic management, and coordination with other trades",
                "Maintaining a safe and compliant work environment",
                "Providing construction-ready work zones in accordance with agreed staging",
                "Weekly production meetings with the Project Manager",
              ]}
            />
            <div>
              <p className="font-medium text-foreground">
                Site readiness requirements
              </p>
              <p className="mt-1">Works are priced on the basis that:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                <li>Minimum 500 m² of surveyed and set-out area is available ahead of works</li>
                <li>Minimum 500 m² of prepared wall face is available for continuous workflow</li>
                <li>Bulk earthworks are complete to design RLs</li>
                <li>Survey set-out is accurate and maintained</li>
              </ul>
              <p className="mt-2">
                Delays, downtime, or re-mobilisation due to failure to meet the
                above will be treated as a variation.
              </p>
            </div>
            <BulletBlock
              title="No allowance has been made for:"
              items={[
                "Double handling",
                "Out-of-sequence works",
                "Working around other trades or restricted access",
              ]}
            />
            <BulletBlock
              title="All works will be completed in accordance with:"
              items={[
                "Approved engineering documentation",
                "Relevant Australian Standards",
                "Site-specific safety and environmental requirements",
              ]}
            />
          </>
        }
      />

      {/* Inclusions */}
      <EditableSection
        title="Inclusions"
        description="The following are included in this proposal."
        value={qo.inclusions}
        defaultText={DEFAULT_INCLUSIONS_TEXT}
        onCommit={(v) => setQoText("inclusions", v)}
        onReset={() => setQoText("inclusions", null)}
        defaultRender={
          <>
            <BulletBlock
              title="Supply & Installation"
              items={[
                "Supply and installation of engineered sleeper retaining walls",
                "Steel posts with concrete or composite sleepers",
                "Installation in accordance with approved civil and structural drawings",
              ]}
            />
            <BulletBlock
              title="Certification"
              items={["Structural certification including Form 15 and Form 12 (as applicable)"]}
            />
            <BulletBlock
              title="Post installation"
              items={[
                "Bored piers using up to an 8-tonne excavator (400–450 mm auger)",
                "Installation using minimum 20 MPa concrete",
                "Mechanical lifting for posts where required",
              ]}
            />
            <BulletBlock
              title="Wall system"
              items={[
                "Concrete sleepers: 200 mm high × 75 mm thick (plain grey)",
                "Composite sleepers: 200 mm high × 65 mm thick (Woodlands Grey)",
              ]}
            />
            <BulletBlock
              title="Drainage"
              items={[
                "Geotextile separation layer",
                "100 mm slotted PVC ag pipe behind wall",
                "Drainage aggregate allowance in line with design (typically 75% wall height)",
              ]}
            />
            <BulletBlock
              title="Backfilling"
              items={[
                "Backfilling using suitable on-site material",
                "Placement in accordance with subdivision levels and design intent",
              ]}
            />
            <div>
              <p className="font-medium text-foreground">Compliance</p>
              <p className="mt-1">Works completed in accordance with:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                <li>Approved engineering design</li>
                <li>Civil subdivision specifications</li>
                <li>Relevant Australian Standards (AS4678, AS3600, AS1726, AS/NZS1170, etc.)</li>
              </ul>
            </div>
          </>
        }
      />

      {/* Exclusions */}
      <EditableSection
        title="Exclusions"
        description="The following are excluded unless specifically stated."
        value={qo.exclusions}
        defaultText={DEFAULT_EXCLUSIONS_TEXT}
        onCommit={(v) => setQoText("exclusions", v)}
        onReset={() => setQoText("exclusions", null)}
        defaultRender={
          <>
            <BulletBlock
              title="Principal Contractor / Developer responsibilities"
              items={[
                "Geotechnical report",
                "Global stability analysis",
                "Survey set-out and control",
                "Council approvals, inspections, and compliance",
                "Stormwater connections and discharge points",
                "Traffic control and site access management",
              ]}
            />
            <BulletBlock
              title="Staging & coordination"
              items={[
                "Out-of-sequence construction",
                "Multiple mobilisations due to staging constraints",
                "Standing time due to other trades or restricted access",
                "Rework due to damage by others",
              ]}
            />
            <BulletBlock
              title="Ground conditions"
              items={[
                "Rock excavation or refusal (drill rate > 10 minutes per lineal metre)",
                "Contaminated material handling or disposal",
                "Dewatering or groundwater management",
                "Unforeseen subsurface conditions",
              ]}
            />
            <BulletBlock
              title="Materials & earthworks"
              items={[
                "Import or export of fill material",
                "Disposal of spoil offsite",
                "Bulk earthworks or trimming beyond standard tolerances",
                "Additional drainage material beyond allowance: 300 mm behind sleeper, 3 m³ per 10 m²",
              ]}
            />
            <BulletBlock
              title="Plant & equipment"
              items={[
                "Concrete pumping",
                "Elevated Work Platforms (EWP)",
                "Specialist lifting equipment beyond standard excavation plant",
              ]}
            />
            <BulletBlock
              title="Design & variations"
              items={[
                "Changes to engineering design or documentation",
                "Variations due to revised lot layouts or services clashes",
                "Fence design, certification, or installation (unless noted)",
              ]}
            />
          </>
        }
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Editable pieces
 * ------------------------------------------------------------------------- */

/** Click-to-edit text. Displays as plain text (so it prints clean) and turns
 *  into an input on click; commits on blur / Enter. Shows an emerald tint +
 *  reset control when it's an override. */
function EditableText({
  value,
  overridden,
  onCommit,
  onReset,
  placeholder,
  multiline,
  displayClassName,
}: {
  value: string;
  overridden?: boolean;
  onCommit: (v: string) => void;
  onReset?: () => void;
  placeholder?: string;
  multiline?: boolean;
  displayClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function start() {
    setDraft(value);
    setEditing(true);
  }
  function commit() {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  }

  if (editing) {
    if (multiline) {
      return (
        <Textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          className="min-h-[80px] text-sm"
        />
      );
    }
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-8 text-sm"
      />
    );
  }

  const trigger = (
    <button
      type="button"
      onClick={start}
      title="Click to edit"
      className={cn(
        "rounded px-1 text-left hover:bg-muted print:px-0 print:hover:bg-transparent",
        multiline && "block w-full whitespace-pre-wrap",
        overridden && "text-emerald-700 print:text-inherit",
        // Empty fields show a placeholder on screen but print nothing.
        !value && "italic text-muted-foreground print:hidden",
        displayClassName,
      )}
    >
      {value || placeholder || "—"}
    </button>
  );

  if (overridden && onReset) {
    return (
      <span className="inline-flex items-start gap-1">
        <button
          type="button"
          onClick={onReset}
          title="Reset to default"
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive print:hidden"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
        {trigger}
      </span>
    );
  }
  return trigger;
}

function EditField({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <EditableText
        value={value}
        placeholder={placeholder}
        onCommit={onCommit}
        displayClassName="font-medium"
      />
    </div>
  );
}

function EditStat({
  label,
  computed,
  override,
  onCommit,
  onReset,
}: {
  label: string;
  computed: string;
  override?: string;
  onCommit: (v: string) => void;
  onReset: () => void;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <EditableText
        value={override ?? computed}
        overridden={override != null}
        onCommit={(v) => onCommit(v === computed ? "" : v)}
        onReset={onReset}
        displayClassName="text-lg font-bold"
      />
    </div>
  );
}

/** A pricing-schedule qty cell you can click to type a manual override.
 *  Overridden quantities show in green with a reset control. */
function EditableQty({
  line,
  onOverride,
}: {
  line: QuotationLineItem;
  onOverride: (value: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const decimals = line.unit === "m2" ? 2 : 0;

  function start() {
    setDraft(String(line.qty));
    setEditing(true);
  }
  function commit() {
    setEditing(false);
    const v = parseFloat(draft);
    if (Number.isFinite(v) && v >= 0) onOverride(v);
  }

  if (editing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Input
          autoFocus
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-7 w-20 text-right tabular-nums"
        />
        <span className="text-xs text-muted-foreground">{line.unit}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {line.qtyOverridden && (
        <button
          type="button"
          onClick={() => onOverride(null)}
          title="Reset to the calculated qty"
          className="text-muted-foreground hover:text-destructive print:hidden"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
      <button
        type="button"
        onClick={start}
        title={
          line.qtyOverridden
            ? "Manual qty, click to edit"
            : "Click to set a manual qty"
        }
        className={cn(
          "rounded px-1 tabular-nums hover:bg-muted print:px-0 print:hover:bg-transparent",
          line.qtyOverridden &&
            "font-semibold text-emerald-700 print:font-normal print:text-inherit",
        )}
      >
        {line.qty.toFixed(decimals)} {line.unit}
      </button>
    </div>
  );
}

/** A pricing-schedule rate cell you can click to type a manual override.
 *  Overridden rates show in green with a reset control. */
function EditableRate({
  line,
  rateTip,
  onOverride,
}: {
  line: QuotationLineItem;
  rateTip?: string;
  onOverride: (value: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function start() {
    setDraft(line.rate.toFixed(2));
    setEditing(true);
  }
  function commit() {
    setEditing(false);
    const v = parseFloat(draft);
    if (Number.isFinite(v) && v >= 0) onOverride(v);
  }

  if (editing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <span className="text-muted-foreground">$</span>
        <Input
          autoFocus
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-7 w-24 text-right tabular-nums"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {line.rateOverridden && (
        <button
          type="button"
          onClick={() => onOverride(null)}
          title="Reset to the calculated rate"
          className="text-muted-foreground hover:text-destructive print:hidden"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
      <button
        type="button"
        onClick={start}
        title={
          line.rateOverridden
            ? "Manual rate, click to edit"
            : (rateTip ?? "Click to set a manual rate")
        }
        className={cn(
          "rounded px-1 tabular-nums hover:bg-muted print:px-0 print:hover:bg-transparent",
          line.rateOverridden
            ? "font-semibold text-emerald-700 print:font-normal print:text-inherit"
            : rateTip
              ? "underline decoration-dotted underline-offset-2 print:no-underline"
              : "",
        )}
      >
        {fmt(line.rate)}
      </button>
    </div>
  );
}

/** A long boilerplate block (design params / T&Cs / inclusions / exclusions).
 *  Renders the polished default layout until edited; once edited, stores plain
 *  text and renders it with a light formatter. Reset restores the default. */
function EditableSection({
  title,
  description,
  value,
  defaultText,
  defaultRender,
  onCommit,
  onReset,
}: {
  title: string;
  description?: string;
  value?: string;
  defaultText: string;
  defaultRender: ReactNode;
  onCommit: (v: string | null) => void;
  onReset: () => void;
}) {
  const overridden = value != null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function start() {
    setDraft(value ?? defaultText);
    setEditing(true);
  }
  function commit() {
    setEditing(false);
    const v = draft;
    if (v.trim() === "" || v.trim() === defaultText.trim()) onCommit(null);
    else onCommit(v);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {!editing && (
            <div className="flex shrink-0 items-center gap-3 print:hidden">
              {overridden && (
                <button
                  type="button"
                  onClick={onReset}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Reset to default
                </button>
              )}
              <Button variant="ghost" size="sm" onClick={start}>
                Edit
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        {editing ? (
          <>
            <Textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              className="min-h-[260px] font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground print:hidden">
              A blank line starts a new paragraph, a line ending with “:” is a
              heading, and lines starting with “- ” become bullets. Click away
              to save.
            </p>
          </>
        ) : overridden ? (
          <div className="space-y-2">{formatQuoteText(value!)}</div>
        ) : (
          defaultRender
        )}
      </CardContent>
    </Card>
  );
}

/** Render user-entered plain text: blank line = paragraph break, "- " prefix =
 *  bullet, trailing ":" = bold heading. */
function formatQuoteText(text: string): ReactNode {
  const rows = text.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;
  const flush = () => {
    if (bullets.length) {
      const items = bullets;
      out.push(
        <ul key={key++} className="list-disc space-y-0.5 pl-5">
          {items.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const raw of rows) {
    const line = raw.trim();
    if (line === "") {
      flush();
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      bullets.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    flush();
    if (line.endsWith(":")) {
      out.push(
        <p key={key++} className="font-medium text-foreground">
          {line}
        </p>,
      );
    } else {
      out.push(<p key={key++}>{line}</p>);
    }
  }
  flush();
  return out;
}

/** Step-by-step "how this per-m² rate is built" panel, shown when a
 *  pricing-schedule line is expanded. */
function RateBreakdownDetail({
  rate,
  bd,
}: {
  rate: number;
  bd: RateBreakdown;
}) {
  const row = (label: string, value: string, strong = false) => (
    <div className="flex items-baseline justify-between gap-4">
      <span className={strong ? "font-medium text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""}`}>
        {value}
      </span>
    </div>
  );
  return (
    <div className="max-w-2xl space-y-2 whitespace-normal break-words rounded-md border bg-background p-3 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        <Info className="h-3.5 w-3.5" /> How this rate is built
      </p>
      <div className="space-y-1">
        {row("Direct construction cost", `${fmt(bd.directCostPerM2)} /m²`)}
        {row(`× Markup (${(bd.markup * 100).toFixed(0)}%)`, `× ${(1 + bd.markup).toFixed(2)}`)}
        {row(`× Margin (${(bd.margin * 100).toFixed(0)}%)`, `× ${(1 + bd.margin).toFixed(2)}`)}
        {bd.bandMultiplier > 0 &&
          row(
            `× Height-band premium (${(bd.bandMultiplier * 100).toFixed(0)}%)`,
            `× ${(1 + bd.bandMultiplier).toFixed(2)}`,
          )}
        <div className="my-1 border-t" />
        {row("= Rate", `${fmt(rate)} /m²`, true)}
      </div>
      <p className="text-muted-foreground">
        Direct cost = (Drilling + Posting + Wall Building + Backfill &amp;
        Gravel) ÷ total m². Establishment, engineering (Form 15 / 12) and
        fence brackets are separate lines. Adjust the markup, margin and band
        premiums in Pricing &amp; Performance.
      </p>
    </div>
  );
}

function BulletBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="font-medium text-foreground">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Plain-text defaults used to seed the section editors.
 * ------------------------------------------------------------------------- */

const DEFAULT_DESIGN_PARAMS_TEXT = `- 5 kPa surcharge loading
- Minimum 150 kPa bearing capacity
- Soil density of 19 kN/m³
- Friction angle of 30°
- Drained cohesion of 1 kPa
- Stiff clay subgrade (~100 kPa)

Any variation to these parameters may result in a variation to cost.`;

const DEFAULT_TERMS_TEXT = `All rates are subject to final engineering design, certification, and approval.

This proposal is based on construction within a civil subdivision environment under a Principal Contractor and assumes coordinated site access, sequencing, and preparation.

A mobilisation period of 4–6 weeks applies from:
- Acceptance of quotation
- Issue of approved-for-construction (IFC) drawings in PDF and CAD
- Receipt of all required reports and approvals

The Principal Contractor is responsible for:
- Site access, traffic management, and coordination with other trades
- Maintaining a safe and compliant work environment
- Providing construction-ready work zones in accordance with agreed staging
- Weekly production meetings with the Project Manager

Site readiness requirements:
- Minimum 500 m² of surveyed and set-out area is available ahead of works
- Minimum 500 m² of prepared wall face is available for continuous workflow
- Bulk earthworks are complete to design RLs
- Survey set-out is accurate and maintained

Delays, downtime, or re-mobilisation due to failure to meet the above will be treated as a variation.

No allowance has been made for:
- Double handling
- Out-of-sequence works
- Working around other trades or restricted access

All works will be completed in accordance with:
- Approved engineering documentation
- Relevant Australian Standards
- Site-specific safety and environmental requirements`;

const DEFAULT_INCLUSIONS_TEXT = `Supply & Installation:
- Supply and installation of engineered sleeper retaining walls
- Steel posts with concrete or composite sleepers
- Installation in accordance with approved civil and structural drawings

Certification:
- Structural certification including Form 15 and Form 12 (as applicable)

Post installation:
- Bored piers using up to an 8-tonne excavator (400–450 mm auger)
- Installation using minimum 20 MPa concrete
- Mechanical lifting for posts where required

Wall system:
- Concrete sleepers: 200 mm high × 75 mm thick (plain grey)
- Composite sleepers: 200 mm high × 65 mm thick (Woodlands Grey)

Drainage:
- Geotextile separation layer
- 100 mm slotted PVC ag pipe behind wall
- Drainage aggregate allowance in line with design (typically 75% wall height)

Backfilling:
- Backfilling using suitable on-site material
- Placement in accordance with subdivision levels and design intent

Compliance:
- Approved engineering design
- Civil subdivision specifications
- Relevant Australian Standards (AS4678, AS3600, AS1726, AS/NZS1170, etc.)`;

const DEFAULT_EXCLUSIONS_TEXT = `Principal Contractor / Developer responsibilities:
- Geotechnical report
- Global stability analysis
- Survey set-out and control
- Council approvals, inspections, and compliance
- Stormwater connections and discharge points
- Traffic control and site access management

Staging & coordination:
- Out-of-sequence construction
- Multiple mobilisations due to staging constraints
- Standing time due to other trades or restricted access
- Rework due to damage by others

Ground conditions:
- Rock excavation or refusal (drill rate > 10 minutes per lineal metre)
- Contaminated material handling or disposal
- Dewatering or groundwater management
- Unforeseen subsurface conditions

Materials & earthworks:
- Import or export of fill material
- Disposal of spoil offsite
- Bulk earthworks or trimming beyond standard tolerances
- Additional drainage material beyond allowance: 300 mm behind sleeper, 3 m³ per 10 m²

Plant & equipment:
- Concrete pumping
- Elevated Work Platforms (EWP)
- Specialist lifting equipment beyond standard excavation plant

Design & variations:
- Changes to engineering design or documentation
- Variations due to revised lot layouts or services clashes
- Fence design, certification, or installation (unless noted)`;
