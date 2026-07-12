import type { CSSProperties, ReactNode } from "react";
import { FolderPlus, PackageSearch, Printer, Ruler, Sparkles } from "lucide-react";
import { PlanDrawing } from "@/components/marketing/PlanDrawing";
import { cn } from "@/lib/utils";

/**
 * Per-stage illustrations for the Virtual Tour. Every scene fills its parent
 * (relative h-full w-full), plays its choreography once and settles to a final
 * frame (custom animations use `both` fill; delayed enter animations carry
 * `fill-mode-backwards`), and keeps at most one infinite idle motion. The
 * scenes restart on each visit because VirtualTour remounts them via `key`.
 * Under reduced motion the parent [data-tour-anim] guard freezes them at the
 * final frame (see index.css).
 */

function SceneCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-4 shadow-lg shadow-sky-900/5",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Chip({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium shadow-sm",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Inline style for a `tour-draw` polyline: dash length = path length so the
 *  wall reveals as the offset animates from the length down to 0. */
function drawStyle(len: number): CSSProperties {
  return { strokeDasharray: len, "--tour-dash": String(len) } as CSSProperties;
}

/* ------------------------------------------------------------------ */

export function SceneWelcome() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center opacity-30 animate-in fade-in duration-700">
        <PlanDrawing gridId="tour-grid-welcome" className="h-full w-auto scale-110" />
      </div>

      <Sparkles className="absolute left-[18%] top-[24%] h-5 w-5 text-sky-400 animate-in fade-in zoom-in-50 fill-mode-backwards duration-500 delay-300" />
      <Sparkles className="absolute right-[20%] top-[30%] h-4 w-4 text-blue-500 animate-in fade-in zoom-in-50 fill-mode-backwards duration-500 delay-500" />
      <Sparkles className="absolute bottom-[22%] right-[28%] h-6 w-6 text-sky-300 animate-in fade-in zoom-in-50 fill-mode-backwards duration-500 delay-700" />

      <div className="relative flex h-full flex-col items-center justify-center gap-3">
        <div className="animate-tour-float">
          <div className="bg-brand-gradient flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-lg animate-tour-pop">
            EC
          </div>
        </div>
        <p className="text-brand-gradient animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards text-2xl font-semibold tracking-tight duration-500 delay-200">
          Elite Civil
        </p>
      </div>
    </div>
  );
}

export function SceneCreateProject() {
  const fields = ["Project name", "Client", "Site address"];
  const delays = ["delay-150", "delay-300", "delay-500"];
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <Chip className="absolute right-[12%] top-[16%] bg-white text-sky-700 animate-tour-float">
        <FolderPlus className="h-3.5 w-3.5" /> New project
      </Chip>

      <SceneCard className="w-64 animate-in fade-in zoom-in-95 duration-300">
        <p className="text-xs font-semibold text-slate-700">Create new project</p>
        <div className="mt-3 space-y-2.5">
          {fields.map((label, i) => (
            <div
              key={label}
              className={cn(
                "space-y-1 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-300",
                delays[i],
              )}
            >
              <div className="h-1.5 w-16 rounded-full bg-slate-200" />
              <div className="flex h-6 items-center rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] text-slate-600">
                {i === 0 ? (
                  "Riverbend Rise Stage 2"
                ) : (
                  <span className="h-1.5 w-24 rounded-full bg-slate-200" />
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <span className="bg-brand-gradient animate-tour-pop rounded-full px-3 py-1.5 text-[11px] font-medium text-white shadow-sm delay-700">
            Create project
          </span>
        </div>
      </SceneCard>
    </div>
  );
}

export function SceneMeasure() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="relative aspect-[16/9] w-[88%]">
        <svg
          viewBox="0 0 640 360"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="tour-grid-measure"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e5edf5" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="640" height="360" fill="#f8fafc" />
          <rect width="640" height="360" fill="url(#tour-grid-measure)" />
          <g fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="6 5">
            <rect x="70" y="60" width="230" height="150" />
            <rect x="340" y="60" width="230" height="150" />
          </g>
          <g fill="none" strokeLinecap="round">
            <polyline
              points="72,210 300,210"
              stroke="#0ea5e9"
              strokeWidth="6"
              className="animate-tour-draw delay-200"
              style={drawStyle(240)}
            />
            <polyline
              points="340,210 568,210"
              stroke="#10b981"
              strokeWidth="6"
              className="animate-tour-draw delay-700"
              style={drawStyle(240)}
            />
            <polyline
              points="570,208 570,62"
              stroke="#f59e0b"
              strokeWidth="6"
              className="animate-tour-draw delay-[1200ms]"
              style={drawStyle(160)}
            />
          </g>
        </svg>

        <CalibDot className="left-[9%] top-[16%]" />
        <CalibDot className="left-[43%] top-[16%]" />
        <span className="animate-tour-pop absolute left-[21%] top-[4%] rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white shadow delay-500">
          12.0 m
        </span>
        <span className="animate-tour-pop absolute left-[10%] top-[66%] inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 shadow-sm delay-1000">
          <span className="h-2 w-2 rounded-full bg-sky-500" /> 18.6 m · 1.2 m H
        </span>
      </div>
    </div>
  );
}

function CalibDot({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-in fade-in zoom-in-50 fill-mode-backwards duration-300 delay-100",
        className,
      )}
    >
      <span className="absolute inset-0 rounded-full bg-sky-400/60 animate-ping" />
      <span className="absolute inset-[3px] rounded-full bg-sky-600 ring-2 ring-white" />
    </span>
  );
}

export function SceneRls() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="relative aspect-[16/9] w-[80%] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(#eef2f7 1px, transparent 1px), linear-gradient(90deg, #eef2f7 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="animate-in fade-in fill-mode-backwards absolute left-[22%] top-[28%] h-[42%] w-[27%] rounded bg-sky-100/70 duration-300 delay-700" />
        <div className="absolute left-[24%] top-[31%] text-[13px] font-semibold text-slate-700">
          RL 21.45
        </div>
        <div className="absolute left-[24%] top-[57%] text-[13px] font-semibold text-slate-700">
          RL 23.05
        </div>
        <div className="animate-in fade-in zoom-in-75 fill-mode-backwards absolute left-[20%] top-[26%] h-[46%] w-[31%] rounded border-2 border-dashed border-sky-500 bg-sky-400/10 duration-300 delay-300" />
        <div className="absolute right-[13%] top-[38%] animate-tour-float">
          <span className="bg-brand-gradient animate-tour-pop rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow delay-1000">
            H 1.60 m
          </span>
        </div>
      </div>
    </div>
  );
}

export function SceneTakeoff() {
  const rows = [
    { label: "Steel posts", qty: "128", rate: "150UC", d: "delay-150", cd: "delay-300" },
    { label: "Concrete", qty: "46 m³", rate: "$310", d: "delay-300", cd: "delay-[450ms]" },
    { label: "Sleepers", qty: "900", rate: "$18", d: "delay-500", cd: "delay-[650ms]" },
  ];
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <Chip className="absolute right-[10%] top-[16%] bg-white text-sky-700 animate-tour-float">
        <Ruler className="h-3.5 w-3.5" /> Your rates
      </Chip>

      <SceneCard className="w-72 animate-in fade-in zoom-in-95 duration-300">
        <p className="text-xs font-semibold text-slate-700">Take Off</p>
        <div className="mt-2.5 space-y-1.5">
          {rows.map((r) => (
            <div
              key={r.label}
              className={cn(
                "flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] animate-in fade-in slide-in-from-left-4 fill-mode-backwards duration-300",
                r.d,
              )}
            >
              <span className="flex-1 text-slate-600">{r.label}</span>
              <span className="tabular-nums font-medium text-slate-800">
                {r.qty}
              </span>
              <span
                className={cn(
                  "animate-tour-pop rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700",
                  r.cd,
                )}
              >
                {r.rate}
              </span>
            </div>
          ))}
        </div>
        <div className="animate-tour-pop relative mt-2.5 flex items-center justify-between overflow-hidden rounded-md bg-blue-50 px-2 py-2 delay-700">
          <span className="text-[11px] font-medium text-slate-700">Total ex GST</span>
          <span className="text-sm font-bold tabular-nums text-blue-700">
            $248,730
          </span>
          <span className="animate-tour-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-0 delay-1000" />
        </div>
      </SceneCard>
    </div>
  );
}

export function SceneQuote() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <SceneCard className="w-56 animate-tour-float">
        <div className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards flex items-center gap-2 duration-300 delay-100">
          <div className="bg-brand-gradient flex h-7 w-7 items-center justify-center rounded-md text-[9px] font-bold text-white">
            EC
          </div>
          <div className="flex-1 space-y-1">
            <div className="h-1.5 w-20 rounded-full bg-slate-300" />
            <div className="h-1.5 w-12 rounded-full bg-slate-200" />
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards h-1.5 w-full rounded-full bg-slate-100 duration-300 delay-200" />
          <div className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards h-1.5 w-3/4 rounded-full bg-slate-100 duration-300 delay-300" />
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards flex items-center justify-between text-[10px] duration-300 delay-500">
            <span className="text-slate-500">Sleeper walls 0 to 1.6 m</span>
            <span className="tabular-nums text-slate-700">$96,410</span>
          </div>
          <div className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards flex items-center justify-between text-[10px] duration-300 delay-700">
            <span className="text-slate-500">Extra over, upper tier</span>
            <span className="tabular-nums text-slate-700">$34,060</span>
          </div>
        </div>
        <div className="animate-in fade-in fill-mode-backwards relative mt-2 flex items-center justify-between overflow-hidden rounded-md bg-sky-50 px-2 py-1.5 text-[11px] duration-300 delay-[900ms]">
          <span className="font-medium text-slate-700">Total inc GST</span>
          <span className="font-bold tabular-nums text-blue-700">$273,603</span>
          <span className="animate-tour-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-0 delay-1000" />
        </div>
        <div className="mt-3 flex justify-center">
          <span className="bg-brand-gradient animate-tour-pop inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-medium text-white shadow-sm delay-[1200ms]">
            <Printer className="h-3 w-3" /> Print / save PDF
          </span>
        </div>
      </SceneCard>
    </div>
  );
}

export function SceneMaterials() {
  const rows = [
    { label: "Galvanised steel posts", qty: "128", d: "delay-100", cd: "delay-300" },
    { label: "Post hole concrete", qty: "46 m³", d: "delay-[250ms]", cd: "delay-[450ms]" },
    { label: "Super Sleepers 2.0 m", qty: "900", d: "delay-[400ms]", cd: "delay-[600ms]" },
    { label: "Fixings", qty: "12 boxes", d: "delay-[550ms]", cd: "delay-[750ms]" },
  ];
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <SceneCard className="w-72 animate-in fade-in zoom-in-95 duration-300">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700">Materials order</p>
          <span className="animate-tour-pop inline-block delay-1000">
            <Chip className="bg-sky-100 text-sky-700">
              <PackageSearch className="h-3 w-3" /> Per lot
            </Chip>
          </span>
        </div>
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div
              key={r.label}
              className={cn(
                "flex items-center justify-between rounded-md bg-slate-50 px-2 py-1.5 text-[11px] animate-in fade-in slide-in-from-right-4 fill-mode-backwards duration-300",
                r.d,
              )}
            >
              <span className="text-slate-600">{r.label}</span>
              <span
                className={cn(
                  "animate-tour-pop rounded-full bg-slate-100 px-2 py-0.5 tabular-nums font-medium text-slate-700",
                  r.cd,
                )}
              >
                {r.qty}
              </span>
            </div>
          ))}
        </div>
      </SceneCard>
    </div>
  );
}

export function SceneShare() {
  const bands = [
    { c: "bg-sky-500", label: "0 to 1.6 m", d: "delay-200" },
    { c: "bg-emerald-500", label: "1.6 to 2.2 m", d: "delay-300" },
    { c: "bg-amber-500", label: "2.2 m +", d: "delay-500" },
  ];
  const team = [
    { c: "bg-sky-500", initials: "SB", d: "delay-700" },
    { c: "bg-blue-600", initials: "JW", d: "delay-[850ms]" },
    { c: "bg-sky-700", initials: "RT", d: "delay-1000" },
  ];
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <PlanDrawing
        gridId="tour-grid-share"
        className="animate-in fade-in h-full w-auto max-w-[92%] duration-500"
      />

      <div className="absolute left-[6%] top-[10%] flex flex-col gap-1.5">
        {bands.map((b) => (
          <span
            key={b.label}
            className={cn(
              "animate-tour-pop inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2 py-1 text-[10px] font-medium text-slate-600 shadow-sm ring-1 ring-slate-200",
              b.d,
            )}
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", b.c)} /> {b.label}
          </span>
        ))}
      </div>

      <span className="animate-tour-pop absolute right-[6%] top-[14%] inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-medium text-sky-700 shadow-sm ring-1 ring-sky-100 delay-700">
        <Printer className="h-3 w-3" /> Client summary
      </span>

      <div className="absolute bottom-[10%] right-[8%] flex animate-tour-float">
        {team.map((t) => (
          <span
            key={t.initials}
            className={cn(
              "animate-tour-pop -ml-2 flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-bold text-white shadow ring-2 ring-white",
              t.c,
              t.d,
            )}
          >
            {t.initials}
          </span>
        ))}
        <span className="animate-tour-pop -ml-2 flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-sky-400 bg-white text-[11px] font-bold text-sky-500 ring-2 ring-white delay-[1150ms]">
          +
        </span>
      </div>
    </div>
  );
}
