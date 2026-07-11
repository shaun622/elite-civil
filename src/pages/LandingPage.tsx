import { Link } from "react-router-dom";
import {
  ArrowRight,
  Calculator,
  Check,
  DollarSign,
  FileText,
  FileUp,
  LayoutDashboard,
  Layers,
  PackageSearch,
  Printer,
  Ruler,
  ScanLine,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Public marketing page. Everything here is hand built: the hero "app
 * window" is an HTML + SVG mockup of the real takeoff canvas, so it stays
 * pixel sharp at every size and never goes stale like a screenshot.
 */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <main>
        <Hero />
        <ValueStrip />
        <HowItWorks />
        <FeatureGrid />
        <TakeoffShowcase />
        <ModulesShowcase />
        <QuoteShowcase />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nav                                                                  */
/* ------------------------------------------------------------------ */

function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="bg-brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-bold text-white shadow-sm">
            EC
          </span>
          <span className="font-semibold tracking-tight">Elite Civil</span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#features" className="transition-colors hover:text-foreground">
            Features
          </a>
          <a
            href="#how-it-works"
            className="transition-colors hover:text-foreground"
          >
            How it works
          </a>
          <Link to="/pricing" className="transition-colors hover:text-foreground">
            Pricing
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/signup">
              Get started
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                 */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Backdrop: soft blue glows + a fading blueprint grid */}
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[620px] w-[980px] -translate-x-1/2 rounded-full bg-sky-100/80 blur-3xl" />
      <div className="pointer-events-none absolute right-[8%] top-24 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(100,140,190,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,140,190,0.10) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 0%, black 40%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 0%, black 40%, transparent 100%)",
        }}
      />

      <div className="container relative pb-20 pt-16 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3.5 py-1.5 text-xs font-medium text-sky-700">
            <Sparkles className="h-3.5 w-3.5" />
            Purpose-built for retaining wall contractors
          </span>

          <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
            From civil drawings to a{" "}
            <span className="text-brand-gradient">priced quote</span> in
            minutes
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
            Elite Civil reads your subdivision PDFs, measures every wall and
            prices the whole job with your rates, your crews and your
            materials. Review it on the drawing, then print a quote your
            client can sign.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="gap-2 px-8 text-base">
              <Link to="/signup">
                Start free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-base">
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>

          <p className="mt-5 text-sm text-muted-foreground">
            3 free drawings · No card required
          </p>
        </div>

        <HeroMockup />
      </div>
    </section>
  );
}

function HeroMockup() {
  return (
    <div className="relative mx-auto mt-16 max-w-5xl">
      {/* Floating proof chips */}
      <div className="absolute -left-4 top-14 z-10 hidden -rotate-2 items-center gap-2.5 rounded-xl border bg-white px-3.5 py-2.5 shadow-lg lg:flex">
        <span className="bg-brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-white">
          <ScanLine className="h-4 w-4" />
        </span>
        <div className="text-left leading-tight">
          <p className="text-sm font-semibold">60 walls measured</p>
          <p className="text-xs text-muted-foreground">straight from the PDF</p>
        </div>
      </div>
      <div className="absolute -right-4 bottom-12 z-10 hidden rotate-2 items-center gap-2.5 rounded-xl border bg-white px-3.5 py-2.5 shadow-lg lg:flex">
        <span className="bg-brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-white">
          <FileText className="h-4 w-4" />
        </span>
        <div className="text-left leading-tight">
          <p className="text-sm font-semibold tabular-nums">$248,730 ex GST</p>
          <p className="text-xs text-muted-foreground">quote ready to send</p>
        </div>
      </div>

      {/* App window */}
      <div className="overflow-hidden rounded-2xl border bg-white shadow-2xl shadow-sky-900/10">
        {/* Window chrome */}
        <div className="flex h-9 items-center gap-2 border-b bg-slate-50 px-3.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="mx-auto rounded-md border bg-white px-3 py-0.5 text-[10px] text-muted-foreground">
            elitecivil.app / riverbend-rise-stage-2
          </span>
          <span className="w-14" />
        </div>

        <div className="flex">
          {/* Icon rail */}
          <div className="hidden w-11 shrink-0 flex-col items-center gap-1 border-r py-2.5 sm:flex">
            <span className="bg-brand-gradient mb-1 flex h-7 w-7 items-center justify-center rounded-md text-[9px] font-bold text-white">
              EC
            </span>
            {[LayoutDashboard, ScanLine, Ruler, DollarSign, Calculator, PackageSearch, FileText].map(
              (Icon, i) => (
                <span
                  key={i}
                  className={
                    i === 1
                      ? "flex h-7 w-7 items-center justify-center rounded-md bg-sky-100 text-sky-700"
                      : "flex h-7 w-7 items-center justify-center rounded-md text-slate-400"
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
              ),
            )}
          </div>

          {/* Canvas column */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Toolbar */}
            <div className="flex h-10 items-center gap-2 border-b px-3">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600">
                Plan · Sheet 12
              </span>
              <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600 sm:inline">
                Scale 1:200
              </span>
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-semibold text-sky-700">
                <Layers className="h-3 w-3" />
                Height bands on
              </span>
              <span className="hidden items-center gap-1 text-slate-400 sm:flex">
                <ZoomOut className="h-3.5 w-3.5" />
                <span className="text-[10px] tabular-nums">100%</span>
                <ZoomIn className="h-3.5 w-3.5" />
              </span>
            </div>

            {/* Drawing */}
            <PlanDrawing className="block h-auto w-full" />
          </div>

          {/* Summary panel */}
          <div className="hidden w-60 shrink-0 flex-col border-l md:flex">
            <div className="border-b px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Takeoff summary
              </p>
              <p className="mt-1 text-sm font-semibold">
                Riverbend Rise Stage 2
              </p>
            </div>
            <div className="space-y-2.5 px-4 py-3 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Total face area</span>
                <span className="font-medium tabular-nums text-foreground">
                  1,137 m²
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Wall segments</span>
                <span className="font-medium tabular-nums text-foreground">
                  60
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Lots</span>
                <span className="font-medium tabular-nums text-foreground">
                  35
                </span>
              </div>
            </div>
            <div className="space-y-2 border-t px-4 py-3 text-xs">
              <BandRow color="#0ea5e9" label="0 to 1.6 m" value="412 m²" />
              <BandRow color="#10b981" label="1.6 to 2.2 m" value="486 m²" />
              <BandRow color="#f59e0b" label="2.2 m +" value="239 m²" />
            </div>
            <div className="mt-auto border-t px-4 py-3.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total ex GST
              </p>
              <p className="text-xl font-semibold tabular-nums text-blue-700">
                $248,730
              </p>
              <span className="bg-brand-gradient mt-2.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold text-white shadow-sm">
                <Printer className="h-3 w-3" />
                Print quotation
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BandRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <svg width="10" height="10" className="shrink-0">
        <rect width="10" height="10" rx="3" fill={color} />
      </svg>
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-medium tabular-nums">{value}</span>
    </div>
  );
}

/**
 * The mock site plan: lots, colour-coded walls, badges and RLs. Pure SVG so
 * it scales crisply and prints the exact brand colours.
 */
function PlanDrawing({
  className,
  gridId = "lp-grid",
}: {
  className?: string;
  /** Unique per instance: the SVG renders twice on the page and duplicate
   *  pattern ids are invalid HTML. */
  gridId?: string;
}) {
  return (
    <svg
      viewBox="0 0 640 400"
      className={className}
      role="img"
      aria-label="Site plan with retaining walls colour coded by height band"
    >
      <defs>
        <pattern id={gridId} width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e5edf5" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width="640" height="400" fill="#f8fafc" />
      <rect width="640" height="400" fill={`url(#${gridId})`} />

      {/* Lot boundaries */}
      <g fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="6 5">
        <rect x="60" y="52" width="180" height="176" />
        <rect x="240" y="52" width="200" height="176" />
        <rect x="440" y="52" width="140" height="176" />
        <line x1="60" y1="290" x2="580" y2="290" />
      </g>

      {/* Lot labels */}
      <g fill="#94a3b8" fontSize="11" fontWeight="600" textAnchor="middle">
        <text x="150" y="130">LOT 14</text>
        <text x="340" y="130">LOT 15</text>
        <text x="510" y="130">LOT 16</text>
      </g>
      <g fill="#b6c2d2" fontSize="10" textAnchor="middle">
        <text x="320" y="316">MURRAY PARADE</text>
      </g>

      {/* Walls, colour coded by height band */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="62,228 238,228" stroke="#0ea5e9" strokeWidth="6" />
        <polyline points="244,228 438,228" stroke="#10b981" strokeWidth="6" />
        <polyline points="440,226 440,54" stroke="#f59e0b" strokeWidth="6" />
        <polyline points="60,226 60,110" stroke="#0ea5e9" strokeWidth="6" />
      </g>

      {/* Selection halo on the emerald wall */}
      <rect
        x="236"
        y="217"
        width="212"
        height="22"
        rx="11"
        fill="none"
        stroke="#10b981"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        opacity="0.65"
      />

      {/* RL markers */}
      <g>
        <circle cx="62" cy="228" r="3.5" fill="#1d4ed8" />
        <text x="70" y="248" fontSize="9" fill="#64748b">RL 21.45</text>
        <circle cx="438" cy="228" r="3.5" fill="#1d4ed8" />
        <text x="392" y="248" fontSize="9" fill="#64748b">RL 22.60</text>
      </g>

      {/* Wall badges */}
      <WallBadge x={92} y={196} dot="#0ea5e9" text="18.6 m · 1.2 m H" />
      <WallBadge x={286} y={196} dot="#10b981" text="16.2 m · 1.8 m H" />
      <WallBadge x={452} y={126} dot="#f59e0b" text="9.4 m · 2.4 m H" />

      {/* Selected wall tooltip card */}
      <g>
        <rect x="268" y="248" width="150" height="58" rx="10" fill="#ffffff" stroke="#e2e8f0" />
        <rect x="268" y="248" width="150" height="58" rx="10" fill="none" stroke="#0f172a" strokeOpacity="0.04" />
        <text x="282" y="268" fontSize="10" fontWeight="700" fill="#0f172a">
          Wall B2 · Lot 15
        </text>
        <text x="282" y="283" fontSize="9" fill="#64748b">
          16.2 m long · 1.8 m high
        </text>
        <text x="282" y="297" fontSize="9" fill="#0284c7" fontWeight="600">
          Super Sleeper · 29.2 m²
        </text>
      </g>

      {/* North arrow + scale */}
      <g>
        <circle cx="596" cy="358" r="14" fill="#ffffff" stroke="#e2e8f0" />
        <path d="M 596 349 L 601 364 L 596 360.5 L 591 364 Z" fill="#475569" />
        <text x="596" y="388" fontSize="8" fill="#94a3b8" textAnchor="middle">N</text>
      </g>
      <text x="60" y="382" fontSize="9" fill="#94a3b8">SCALE 1:200</text>
    </svg>
  );
}

function WallBadge({
  x,
  y,
  dot,
  text,
}: {
  x: number;
  y: number;
  dot: string;
  text: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width="112" height="22" rx="11" fill="#ffffff" stroke="#e2e8f0" />
      <circle cx={x + 13} cy={y + 11} r="4" fill={dot} />
      <text x={x + 24} y={y + 15} fontSize="10" fontWeight="600" fill="#334155">
        {text}
      </text>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Value strip                                                          */
/* ------------------------------------------------------------------ */

const VALUES = [
  { icon: ScanLine, label: "AI-measured takeoffs" },
  { icon: DollarSign, label: "Your rates and margins" },
  { icon: PackageSearch, label: "Materials counted per lot" },
  { icon: FileText, label: "Client-ready quotes" },
];

function ValueStrip() {
  return (
    <section className="border-y bg-slate-50/70">
      <div className="container grid grid-cols-2 gap-6 py-8 sm:grid-cols-4">
        {VALUES.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center justify-center gap-2.5">
            <Icon className="h-5 w-5 shrink-0 text-sky-600" />
            <span className="text-sm font-medium text-slate-700">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* How it works                                                         */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    icon: FileUp,
    title: "Upload your drawings",
    body: "Drop the subdivision PDF into a project and calibrate the scale in one click.",
  },
  {
    icon: Ruler,
    title: "Review every wall",
    body: "AI traces the walls and reads the RLs. Confirm heights, lots and wall types right on the drawing.",
  },
  {
    icon: Printer,
    title: "Price and send",
    body: "Your rates drive the estimate. Fine tune any line, then print a polished quotation.",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20">
      <div className="container py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
            How it works
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Three steps from PDF to quote
          </h2>
          <p className="mt-4 text-muted-foreground">
            No digitiser, no spreadsheet gymnastics. The whole takeoff lives in
            one place.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <div
              key={title}
              className="relative rounded-2xl border bg-card p-6 transition-shadow hover:shadow-md"
            >
              <span className="bg-brand-gradient absolute -top-3.5 left-6 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm">
                {i + 1}
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Modules showcase                                                     */
/* ------------------------------------------------------------------ */

function ModulesShowcase() {
  return (
    <section id="modules" className="scroll-mt-20 border-t">
      <div className="container py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
            From takeoff to order
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            One takeoff drives the whole estimate
          </h2>
          <p className="mt-4 text-muted-foreground">
            Measure once. The take off, pricing, cost breakdown and materials
            order all read from the same walls, so a change in one place flows
            through the lot.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-2">
          {/* 1. Take-Off */}
          <ModuleCard
            n={1}
            icon={Ruler}
            title="Take-Off"
            lead="Every wall in one sortable table: lot, length, height, design and post size."
          >
            <table className="w-full tabular-nums">
              <thead>
                <tr className="border-b border-slate-200 bg-sky-100/60 text-[10px] uppercase tracking-wide text-sky-900">
                  <th className="px-1.5 py-1 text-left font-semibold">Wall</th>
                  <th className="px-1.5 py-1 text-left font-semibold">Lot</th>
                  <th className="px-1.5 py-1 text-right font-semibold">L (m)</th>
                  <th className="px-1.5 py-1 text-right font-semibold">H (m)</th>
                  <th className="px-1.5 py-1 text-right font-semibold">m²</th>
                </tr>
              </thead>
              <tbody className="text-slate-600">
                <tr className="border-b border-slate-200/70">
                  <td className="px-1.5 py-1 font-medium text-foreground">B1</td>
                  <td className="px-1.5 py-1">14</td>
                  <td className="px-1.5 py-1 text-right">18.6</td>
                  <td className="px-1.5 py-1 text-right">1.2</td>
                  <td className="px-1.5 py-1 text-right">22.3</td>
                </tr>
                <tr className="border-b border-slate-200/70 bg-sky-50">
                  <td className="px-1.5 py-1 font-medium text-foreground">B2</td>
                  <td className="px-1.5 py-1">15</td>
                  <td className="px-1.5 py-1 text-right">16.2</td>
                  <td className="px-1.5 py-1 text-right">1.8</td>
                  <td className="px-1.5 py-1 text-right font-semibold text-sky-700">
                    29.2
                  </td>
                </tr>
                <tr>
                  <td className="px-1.5 py-1 font-medium text-foreground">B3</td>
                  <td className="px-1.5 py-1">16</td>
                  <td className="px-1.5 py-1 text-right">9.4</td>
                  <td className="px-1.5 py-1 text-right">2.4</td>
                  <td className="px-1.5 py-1 text-right">22.6</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-300 font-semibold text-foreground">
                  <td className="px-1.5 py-1" colSpan={4}>
                    60 walls total
                  </td>
                  <td className="px-1.5 py-1 text-right">1,137 m²</td>
                </tr>
              </tfoot>
            </table>
          </ModuleCard>

          {/* 2. Pricing engine */}
          <ModuleCard
            n={2}
            icon={DollarSign}
            title="Pricing engine"
            lead="Your crew rates, machine time and margins price the whole job. Change a number and everything reprices."
          >
            <div className="space-y-1.5">
              <StatRow label="Drilling crew" value="$95 /hr" />
              <StatRow label="Machine and operator" value="$180 /hr" />
              <StatRow label="Markup" value="15%" />
              <StatRow label="Margin" value="20%" />
            </div>
            <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
              <StatRow
                label="Quote rate"
                value="$218.76 /m²"
                labelClass="font-medium text-foreground"
                valueClass="font-semibold text-sky-700"
              />
              <StatRow
                label="Total ex GST"
                value="$248,730"
                labelClass="font-semibold text-foreground"
                valueClass="font-semibold text-blue-700"
              />
            </div>
          </ModuleCard>

          {/* 3. Cost Breakdown */}
          <ModuleCard
            n={3}
            icon={Calculator}
            title="Cost Breakdown"
            lead="See where the money goes before you commit to a price."
          >
            <div className="space-y-1.5">
              <StatRow label="Drilling" value="$21,420" />
              <StatRow label="Posting" value="$44,780" />
              <StatRow label="Wall building" value="$84,350" />
              <StatRow label="Backfill and gravel" value="$23,490" />
              <StatRow label="Engineering" value="$6,200" />
            </div>
            <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
              <StatRow
                label="Cost total"
                value="$180,240"
                labelClass="font-semibold text-foreground"
                valueClass="font-semibold text-foreground"
              />
              <StatRow label="Cost per m²" value="$158.52" />
              <StatRow
                label="Quote"
                value="$248,730"
                labelClass="font-medium text-foreground"
                valueClass="font-semibold text-blue-700"
              />
            </div>
          </ModuleCard>

          {/* 4. Materials Order */}
          <ModuleCard
            n={4}
            icon={PackageSearch}
            title="Materials Order"
            lead="Purchase quantities counted from the walls, split per lot for staged deliveries."
          >
            <div className="space-y-1.5">
              <StatRow label="Galvanised steel posts" value="358" />
              <StatRow label="Super Sleepers 2.0 m" value="2,845" />
              <StatRow label="Post hole concrete" value="39 m³" />
              <StatRow label="Drainage gravel" value="310 t" />
            </div>
            <p className="mt-2 border-t border-slate-200 pt-2 text-[11px] text-muted-foreground">
              Split across 35 lots for delivery staging.
            </p>
          </ModuleCard>
        </div>
      </div>
    </section>
  );
}

function ModuleCard({
  n,
  icon: Icon,
  title,
  lead,
  children,
}: {
  n: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
      <span className="bg-brand-gradient absolute -top-3.5 left-6 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm">
        {n}
      </span>
      <div className="flex items-start gap-3">
        <span className="bg-brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{lead}</p>
        </div>
      </div>
      <div className="mt-4 rounded-xl border bg-slate-50/70 p-3 text-xs">
        {children}
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  labelClass = "text-slate-600",
  valueClass = "text-slate-700",
}: {
  label: string;
  value: string;
  labelClass?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={labelClass}>{label}</span>
      <span className={`tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Feature grid                                                         */
/* ------------------------------------------------------------------ */

const FEATURES = [
  {
    icon: ScanLine,
    title: "Measure from PDF",
    body: "Upload plans and let AI extract dimensions, RLs and wall lines straight off the sheet.",
  },
  {
    icon: Ruler,
    title: "Smart takeoff",
    body: "Every segment with its lot, height, length and design in one fast, sortable table.",
  },
  {
    icon: Layers,
    title: "Height band views",
    body: "Colour code walls by height, toggle overlays and print a summary anyone can read.",
  },
  {
    icon: DollarSign,
    title: "Pricing engine",
    body: "Crew rates, machine time, materials and margins. Change a number and the whole job reprices.",
  },
  {
    icon: PackageSearch,
    title: "Materials order",
    body: "Steel posts, sleepers, concrete and gravel quantified per lot and totalled for ordering.",
  },
  {
    icon: FileText,
    title: "Editable quotation",
    body: "Every line, rate and description is editable. Add rows, hide rows, print to PDF.",
  },
];

function FeatureGrid() {
  return (
    <section id="features" className="scroll-mt-20 border-y bg-slate-50/70">
      <div className="container py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
            Features
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything between the drawing and the deposit
          </h2>
          <p className="mt-4 text-muted-foreground">
            Built around how retaining wall jobs are actually measured, priced
            and won.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="bg-brand-gradient flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Deep dives                                                           */
/* ------------------------------------------------------------------ */

function TakeoffShowcase() {
  return (
    <section className="container grid items-center gap-12 py-20 sm:py-24 lg:grid-cols-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
          Takeoff
        </p>
        <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          See every wall, right on the drawing
        </h2>
        <p className="mt-4 text-muted-foreground">
          No more highlighters and scale rulers. Walls appear on the plan
          exactly where they are, coloured by height band, with the numbers
          your estimate needs.
        </p>
        <ul className="mt-7 space-y-3">
          {[
            "Walls colour coded by height band, with length and area badges",
            "Heights read from top and bottom RLs, editable any time",
            "Toggle bands and wall sections on or off before you print",
          ].map((point) => (
            <li key={point} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                <Check className="h-3 w-3" />
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="overflow-hidden rounded-2xl border shadow-xl shadow-sky-900/5">
        <div className="flex h-9 items-center gap-2 border-b bg-slate-50 px-3.5">
          <Layers className="h-3.5 w-3.5 text-sky-600" />
          <span className="text-xs font-medium text-slate-600">
            Height band view
          </span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] font-semibold text-sky-700">
            Bands on
          </span>
        </div>
        <PlanDrawing className="block h-auto w-full" gridId="lp-grid-showcase" />
      </div>
    </section>
  );
}

function QuoteShowcase() {
  return (
    <section className="border-y bg-slate-50/70">
      <div className="container grid items-center gap-12 py-20 sm:py-24 lg:grid-cols-2">
        {/* Quote document mock */}
        <div className="order-2 lg:order-1">
          <div className="mx-auto max-w-md rounded-2xl border bg-white p-7 shadow-xl shadow-sky-900/5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                  Quotation
                </p>
                <h3 className="mt-1 font-semibold">Riverbend Rise Stage 2</h3>
                <p className="text-xs text-muted-foreground">
                  Harfield Developments · Quote #Q-2418
                </p>
              </div>
              <span className="bg-brand-gradient flex h-9 w-9 items-center justify-center rounded-lg text-[10px] font-bold text-white">
                EC
              </span>
            </div>

            <div className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  Sleeper retaining walls, height 0 to 1.6 m
                </span>
                <span className="tabular-nums">$82,410</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  Sleeper retaining walls, height 1.6 to 2.2 m
                </span>
                <span className="tabular-nums">$96,260</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  Sleeper retaining walls, height 2.2 m and over
                </span>
                <span className="tabular-nums">$36,000</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  Extra over for upper tier walls
                </span>
                <span className="tabular-nums">$34,060</span>
              </div>
              <div className="space-y-1.5 border-t pt-3">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">$248,730</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>GST 10%</span>
                  <span className="tabular-nums">$24,873</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total inc GST</span>
                  <span className="tabular-nums text-blue-700">$273,603</span>
                </div>
              </div>
            </div>

            <span className="bg-brand-gradient mt-6 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white shadow-sm">
              <Printer className="h-3.5 w-3.5" />
              Print / save PDF
            </span>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
            Quotation
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            A quote you can send the same day
          </h2>
          <p className="mt-4 text-muted-foreground">
            The quotation builds itself from your takeoff and pricing, then
            stays fully in your control. Change anything before it goes out
            the door.
          </p>
          <ul className="mt-7 space-y-3">
            {[
              "Totals flow straight from the takeoff and your pricing",
              "Override any rate, quantity or description inline",
              "Add extra over items and print a branded PDF",
            ].map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                  <Check className="h-3 w-3" />
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* CTA + footer                                                         */
/* ------------------------------------------------------------------ */

function CtaBand() {
  return (
    <section className="container py-20 sm:py-24">
      <div className="bg-brand-gradient relative overflow-hidden rounded-3xl px-8 py-14 text-center text-white shadow-lg sm:px-14">
        <div className="pointer-events-none absolute -left-20 -top-28 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-sky-200/20 blur-3xl" />

        <h2 className="relative mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Price your next retaining wall job with Elite Civil
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-sky-100">
          Set up in minutes. Your first three drawings are free.
        </p>
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="gap-2 bg-white px-8 text-base text-blue-700 shadow-sm hover:bg-sky-50"
          >
            <Link to="/signup">
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-white/40 bg-transparent text-base text-white hover:bg-white/10 hover:text-white"
          >
            <Link to="/pricing">View pricing</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t bg-slate-50/70">
      <div className="container grid gap-10 py-12 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="bg-brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-bold text-white shadow-sm">
              EC
            </span>
            <span className="font-semibold tracking-tight">Elite Civil</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Takeoff and estimating software for retaining wall contractors.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Product
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a href="#features" className="text-muted-foreground hover:text-foreground">
                Features
              </a>
            </li>
            <li>
              <a href="#how-it-works" className="text-muted-foreground hover:text-foreground">
                How it works
              </a>
            </li>
            <li>
              <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
                Pricing
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Account
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link to="/login" className="text-muted-foreground hover:text-foreground">
                Sign in
              </Link>
            </li>
            <li>
              <Link to="/signup" className="text-muted-foreground hover:text-foreground">
                Create an account
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t">
        <div className="container flex h-14 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© 2026 Elite Civil · Australia &amp; New Zealand</span>
          <span className="tabular-nums">v{__APP_VERSION__}</span>
        </div>
      </div>
    </footer>
  );
}
