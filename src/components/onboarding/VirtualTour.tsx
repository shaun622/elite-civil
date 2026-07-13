import {
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
} from "react";
import {
  Check,
  FileText,
  FolderPlus,
  MousePointerClick,
  PackageSearch,
  Ruler,
  ScanLine,
  Sparkles,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SceneCreateProject,
  SceneMaterials,
  SceneMeasure,
  SceneQuote,
  SceneRls,
  SceneShare,
  SceneTakeoff,
  SceneWelcome,
} from "@/components/onboarding/tourScenes";

type Step = {
  icon: ComponentType<{ className?: string }>;
  short: string;
  title: string;
  body: string;
  scene: ComponentType;
};

const STEPS: Step[] = [
  {
    icon: Sparkles,
    short: "Welcome",
    title: "Welcome to Elite Civil",
    body: "Price retaining walls straight from a PDF plan: measure the walls, set the heights, and generate a materials order and a customer quote in minutes.",
    scene: SceneWelcome,
  },
  {
    icon: FolderPlus,
    short: "Create a project",
    title: "1 · Create a project",
    body: "A project groups all the drawings, measurements, quote and materials for one client or site. Start with “Create project”, or forward a plan to get going.",
    scene: SceneCreateProject,
  },
  {
    icon: ScanLine,
    short: "Measure from PDF",
    title: "2 · Measure from PDF",
    body: "Upload the drawing, calibrate the scale by clicking a known distance, then trace each retaining wall. Lengths come straight off the plan.",
    scene: SceneMeasure,
  },
  {
    icon: MousePointerClick,
    short: "Grab the RLs",
    title: "3 · Grab the RLs",
    body: "Box the top & bottom level numbers on a wall and we read them and set its height. A wall whose levels cross a height band is split automatically for pricing.",
    scene: SceneRls,
  },
  {
    icon: Ruler,
    short: "Take Off & Pricing",
    title: "4 · Take Off & Pricing",
    body: "Every wall’s posts, concrete, sleepers and hours are calculated. Tune your rates, margins and engineering settings in Pricing & Performance, per project.",
    scene: SceneTakeoff,
  },
  {
    icon: FileText,
    short: "Quotation",
    title: "5 · Quotation",
    body: "A fully editable customer quote: override any rate, qty or description, add or hide lines, and edit the terms & inclusions. Print or save as a PDF.",
    scene: SceneQuote,
  },
  {
    icon: PackageSearch,
    short: "Materials Order",
    title: "6 · Materials Order",
    body: "A procurement list of steel posts, concrete, sleepers and more, grouped per lot for delivery, with per-type totals so you can order in one go.",
    scene: SceneMaterials,
  },
  {
    icon: Users,
    short: "Share & team",
    title: "7 · Show clients & share",
    body: "Colour the walls by height on the drawing and print a client summary. Invite your team, and every project stays in sync across your company.",
    scene: SceneShare,
  },
];

// Rail item pitch: h-10 (40px) + gap-1 (4px). Keep in sync with the item
// height and gap below, or the sliding accent desyncs.
const RAIL_PITCH = 44;

export function VirtualTour({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const nextRef = useRef<HTMLButtonElement>(null);
  const current = STEPS[step];
  const Scene = current.scene;
  const isLast = step === STEPS.length - 1;

  function go(next: number) {
    if (next === step || next < 0 || next >= STEPS.length) return;
    setDirection(next > step ? 1 : -1);
    setStep(next);
  }

  function close() {
    onOpenChange(false);
    // Reset after the dialog close animation so the next open starts fresh.
    setTimeout(() => {
      setStep(0);
      setDirection(1);
    }, 200);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (
      t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.isContentEditable
    ) {
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(step + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(step - 1);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent
        onKeyDown={onKeyDown}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          nextRef.current?.focus();
        }}
        className="flex h-[100dvh] max-h-[100dvh] flex-col gap-0 overflow-hidden overflow-y-hidden p-0 duration-300 data-[state=open]:slide-in-from-bottom-4 sm:grid sm:h-[620px] sm:max-h-[90vh] sm:max-w-4xl sm:grid-cols-[248px_1fr]"
      >
        {/* Desktop stage rail */}
        <nav
          aria-label="Tour stages"
          className="relative hidden shrink-0 flex-col border-r bg-slate-50/70 p-3 sm:flex"
        >
          <div className="flex items-center gap-2 px-1 pb-2">
            <span className="bg-brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-bold text-white shadow-sm">
              EC
            </span>
            <span className="text-sm font-semibold">Quick tour</span>
          </div>

          <div className="relative mt-1 flex flex-col gap-1">
            <span
              aria-hidden="true"
              className="bg-brand-gradient pointer-events-none absolute left-0 top-0 h-10 w-[3px] rounded-full motion-safe:transition-transform motion-safe:duration-300"
              style={{ transform: `translateY(${step * RAIL_PITCH}px)` }}
            />
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const active = i === step;
              const visited = i < step;
              return (
                <button
                  key={s.short}
                  type="button"
                  onClick={() => go(i)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "relative flex h-10 items-center gap-2.5 rounded-lg pl-4 pr-3 text-left text-sm transition-colors",
                    active
                      ? "bg-white font-medium text-sky-700 shadow-sm ring-1 ring-sky-100"
                      : "text-muted-foreground hover:bg-white/60 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{s.short}</span>
                  {visited && (
                    <Check className="animate-in fade-in zoom-in-50 ml-auto h-3.5 w-3.5 shrink-0 text-sky-500" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-auto px-1 pt-3">
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="bg-brand-gradient h-full rounded-full transition-all duration-300"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        </nav>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div
            key={step}
            data-tour-anim
            className={cn(
              "animate-in fade-in fill-mode-both flex min-h-0 flex-1 flex-col duration-300 [animation-timing-function:cubic-bezier(.22,1,.36,1)]",
              direction === 1
                ? "slide-in-from-right-8"
                : "slide-in-from-left-8",
            )}
          >
            <div
              aria-hidden="true"
              className="relative aspect-[16/10] w-full shrink-0 overflow-hidden border-b bg-gradient-to-br from-slate-50 via-sky-50/50 to-white sm:aspect-auto sm:h-[300px]"
            >
              <Scene />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 sm:px-8">
              <DialogHeader>
                <DialogTitle className="text-lg">{current.title}</DialogTitle>
              </DialogHeader>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {current.body}
              </p>
            </div>
          </div>

          {/* Mobile stage chips */}
          <div className="flex gap-1.5 overflow-x-auto border-t px-4 py-2 sm:hidden">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const active = i === step;
              return (
                <button
                  key={s.short}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={s.short}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
                    active
                      ? "bg-brand-gradient text-white shadow-sm"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>

          <DialogFooter className="items-center gap-2 border-t px-6 py-4 sm:justify-between">
            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" size="sm" onClick={close}>
                Skip tour
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                {step + 1} of {STEPS.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => go(step - 1)}
                disabled={step === 0}
              >
                Back
              </Button>
              <Button
                key={isLast ? "go" : "next"}
                ref={nextRef}
                type="button"
                className="animate-tour-pop"
                onClick={isLast ? close : () => go(step + 1)}
              >
                {isLast ? "Get started" : "Next"}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
