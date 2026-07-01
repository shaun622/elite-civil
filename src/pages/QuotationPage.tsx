import { Fragment, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ChevronRight, Info, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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
import type { QuotationLineItem, RateBreakdown } from "@/lib/engine/types";
import type { ExtraOverItem } from "@/types/db";

const aud = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
});

function fmt(v: number): string {
  return aud.format(v);
}

/**
 * Quotation — customer-facing pricing schedule. Reads engine quotation
 * lines + the project's extra-over items, and adds the boilerplate
 * design / inclusions / exclusions blocks BE Landscapes uses on
 * their PDFs. Print-friendly via `window.print()`.
 */
export function QuotationPage() {
  const { id } = useParams<{ id: string }>();
  const { project, loading: projectLoading, update } = useProject(id);
  const { walls, loading: wallsLoading } = useProjectWalls(id);
  // Which pricing-schedule line has its rate breakdown expanded.
  const [expandedLine, setExpandedLine] = useState<number | null>(null);

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
  const lines = bundle.quotationLines;
  const breakdown = bundle.costBreakdown;
  const extras = project.extra_over_items ?? [];
  const extrasTotal = extras.reduce((s, i) => s + i.qty * i.rate, 0);
  const linesTotal = lines.reduce((s, l) => s + l.total, 0);
  const totalExGST = linesTotal + extrasTotal;

  function updateExtras(next: ExtraOverItem[]) {
    void update({ extra_over_items: next });
  }

  function addExtra() {
    updateExtras([
      ...extras,
      {
        id: crypto.randomUUID(),
        description: "",
        qty: 1,
        unit: "EA",
        rate: 0,
      },
    ]);
  }

  function patchExtra(itemId: string, patch: Partial<ExtraOverItem>) {
    updateExtras(
      extras.map((x) => (x.id === itemId ? { ...x, ...patch } : x)),
    );
  }

  function removeExtra(itemId: string) {
    updateExtras(extras.filter((x) => x.id !== itemId));
  }

  /** Set (or clear, with null) a manual rate override for a pricing line. */
  function setRateOverride(key: string, value: number | null) {
    if (!project) return;
    const next = { ...(project.cost_overrides ?? {}) } as Record<
      string,
      number
    >;
    const k = `quote_rate:${key}`;
    if (value == null || !Number.isFinite(value) || value < 0) delete next[k];
    else next[k] = value;
    void update({ cost_overrides: next });
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
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Quotation</h2>
          <p className="text-muted-foreground">
            Generated pricing for {project.name}
          </p>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          Print / save PDF
        </Button>
      </div>

      {/* Project header */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project" value={project.name} />
            <Field
              label="Quote number"
              value={project.quote_number || "Not set"}
            />
            <Field label="Client" value={project.client_name || "Not set"} />
            <Field
              label="Contact"
              value={project.contact_name || "Not set"}
            />
          </div>
          {project.description && (
            <>
              <Separator className="my-4" />
              <p className="text-sm text-muted-foreground">
                {project.description}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Wall summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wall summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6">
            <Stat label="Total m²" value={breakdown.totalM2.toFixed(1)} />
            <Stat label="Lots" value={String(bundle.uniqueLotCount)} />
            <Stat
              label="Segments"
              value={String(bundle.calculatedWalls.length)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Pricing schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pricing schedule</CardTitle>
          <CardDescription>
            Retaining walls complete, including certification (Form 15 +
            Form 12), drainage outlets, and safety fence.
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, i) => {
                const bd = line.rateBreakdown;
                const isOpen = expandedLine === i;
                const rateTip = bd
                  ? `${fmt(bd.directCostPerM2)}/m² direct cost × ${(1 + bd.markup).toFixed(2)} markup × ${(1 + bd.margin).toFixed(2)} margin${bd.bandMultiplier ? ` × ${(1 + bd.bandMultiplier).toFixed(2)} band` : ""} = ${fmt(line.rate)}/m²`
                  : undefined;
                return (
                  <Fragment key={`${line.description}-${i}`}>
                    <TableRow>
                      <TableCell className="text-sm">
                        <span className="inline-flex items-center gap-1.5">
                          {bd && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedLine(isOpen ? null : i)
                              }
                              title="How is this rate calculated?"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <ChevronRight
                                className={`h-3.5 w-3.5 transition-transform ${
                                  isOpen ? "rotate-90" : ""
                                }`}
                              />
                            </button>
                          )}
                          {line.description}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {line.qty.toFixed(line.unit === "m2" ? 2 : 0)}{" "}
                        {line.unit}
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
                    </TableRow>
                    {bd && isOpen && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={4} className="py-2">
                          <RateBreakdownDetail
                            rate={line.rate}
                            bd={bd}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
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
              </TableRow>
            </TableBody>
          </Table>
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
            <Button variant="outline" size="sm" onClick={addExtra}>
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
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {extras.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Input
                        className="h-8 text-sm"
                        placeholder="e.g. Tree removal at lot 503"
                        value={item.description}
                        onChange={(e) =>
                          patchExtra(item.id, { description: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.1"
                        className="h-8 w-16 text-right text-sm"
                        value={item.qty}
                        onChange={(e) =>
                          patchExtra(item.id, {
                            qty: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 w-16 text-sm"
                        value={item.unit}
                        onChange={(e) =>
                          patchExtra(item.id, { unit: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 w-28 text-right text-sm"
                        value={item.rate}
                        onChange={(e) =>
                          patchExtra(item.id, {
                            rate: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {fmt(item.qty * item.rate)}
                    </TableCell>
                    <TableCell>
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
                  <TableCell></TableCell>
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Design parameters (assumed)
          </CardTitle>
          <CardDescription>
            This pricing is based on the following design criteria.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
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
        </CardContent>
      </Card>

      {/* Terms & Conditions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Terms &amp; Conditions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
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
              "Weekly production meetings with BE Project Manager",
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
        </CardContent>
      </Card>

      {/* Inclusions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inclusions</CardTitle>
          <CardDescription>
            The following are included in this proposal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
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
        </CardContent>
      </Card>

      {/* Exclusions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exclusions</CardTitle>
          <CardDescription>
            The following are excluded unless specifically stated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
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
              "Additional drainage material beyond allowance — 300 mm behind sleeper, 3 m³ per 10 m²",
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
        </CardContent>
      </Card>
    </div>
  );
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
          className="text-muted-foreground hover:text-destructive"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
      <button
        type="button"
        onClick={start}
        title={
          line.rateOverridden
            ? "Manual rate — click to edit"
            : (rateTip ?? "Click to set a manual rate")
        }
        className={`rounded px-1 tabular-nums hover:bg-muted ${
          line.rateOverridden
            ? "font-semibold text-emerald-700"
            : rateTip
              ? "underline decoration-dotted underline-offset-2"
              : ""
        }`}
      >
        {fmt(line.rate)}
      </button>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function BulletBlock({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
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
