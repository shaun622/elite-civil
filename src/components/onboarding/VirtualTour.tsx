import { useState, type ComponentType } from "react";
import {
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

type Step = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: "Welcome to Elite Civil",
    body: "Price retaining walls straight from a PDF plan — measure the walls, set the heights, and generate a materials order and a customer quote in minutes.",
  },
  {
    icon: FolderPlus,
    title: "1 · Create a project",
    body: "A project groups all the drawings, measurements, quote and materials for one client or site. Start with “Create project”, or forward a plan to get going.",
  },
  {
    icon: ScanLine,
    title: "2 · Measure from PDF",
    body: "Upload the drawing, calibrate the scale by clicking a known distance, then trace each retaining wall. Lengths come straight off the plan.",
  },
  {
    icon: MousePointerClick,
    title: "3 · Grab the RLs",
    body: "Box the top & bottom level numbers on a wall and we read them and set its height. A wall whose levels cross a height band is split automatically for pricing.",
  },
  {
    icon: Ruler,
    title: "4 · Take Off & Pricing",
    body: "Every wall’s posts, concrete, sleepers and hours are calculated. Tune your rates, margins and engineering settings in Pricing & Performance — per project.",
  },
  {
    icon: FileText,
    title: "5 · Quotation",
    body: "A fully editable customer quote: override any rate, qty or description, add or hide lines, and edit the terms & inclusions. Print or save as a PDF.",
  },
  {
    icon: PackageSearch,
    title: "6 · Materials Order",
    body: "A procurement list of steel posts, concrete, sleepers and more — grouped per lot for delivery, with per-type totals so you can order in one go.",
  },
  {
    icon: Users,
    title: "7 · Show clients & share",
    body: "Colour the walls by height on the drawing and print a client summary. Invite your team, and every project stays in sync across your company.",
  },
];

export function VirtualTour({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  function close() {
    onOpenChange(false);
    // Reset for next time, after the dialog close animation.
    setTimeout(() => setStep(0), 200);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <Icon className="h-6 w-6 text-foreground" />
          </div>
          <DialogTitle className="text-lg">{current.title}</DialogTitle>
        </DialogHeader>

        <p className="text-sm leading-relaxed text-muted-foreground">
          {current.body}
        </p>

        <div className="mt-2 flex items-center justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStep(i)}
              aria-label={`Step ${i + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step ? "w-5 bg-foreground" : "w-1.5 bg-muted-foreground/30",
              )}
            />
          ))}
        </div>

        <DialogFooter className="mt-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={step === 0 ? close : () => setStep((s) => s - 1)}
          >
            {step === 0 ? "Skip" : "Back"}
          </Button>
          <Button
            type="button"
            onClick={isLast ? close : () => setStep((s) => s + 1)}
          >
            {isLast ? "Get started" : "Next"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
