import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Extraction } from "@/types/db";

function confidenceTone(c: number | null) {
  if (c === null) return "outline";
  if (c >= 0.85) return "default";
  if (c >= 0.6) return "secondary";
  return "destructive";
}

const VIEW_TYPE_LABELS: Record<Extraction["view_type"], string> = {
  plan: "Plan",
  elevation: "Elevation",
  section: "Section",
  unknown: "Unknown",
};

export function ExtractionMeta({ extraction }: { extraction: Extraction }) {
  const tone = confidenceTone(extraction.overall_confidence);
  const confidencePct =
    extraction.overall_confidence === null
      ? null
      : Math.round(extraction.overall_confidence * 100);
  return (
    <div className="rounded-md border bg-card p-3 text-xs">
      <div className="grid grid-cols-2 gap-y-2 gap-x-3">
        <Stat label="View type" value={VIEW_TYPE_LABELS[extraction.view_type]} />
        <Stat
          label="Units"
          value={extraction.units === "unknown" ? "—" : extraction.units}
        />
        <Stat
          label="Scale"
          value={extraction.scale_text ?? "—"}
          mono
        />
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Confidence
          </p>
          <Badge
            variant={tone}
            className={cn(
              "mt-1",
              tone === "default" && "bg-emerald-600 hover:bg-emerald-600",
              tone === "secondary" && "bg-amber-500 text-white hover:bg-amber-500",
            )}
          >
            {confidencePct === null ? "—" : `${confidencePct}%`}
          </Badge>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-0.5 text-sm", mono && "font-mono")}>{value}</p>
    </div>
  );
}
