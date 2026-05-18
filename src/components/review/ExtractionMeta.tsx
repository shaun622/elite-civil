import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseScaleRatio } from "@/lib/api/review";
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

type Props = {
  extraction: Extraction;
  segmentCount: number;
  locked: boolean;
  rescaling: boolean;
  onRescale: (newRatio: number) => void;
};

export function ExtractionMeta({
  extraction,
  segmentCount,
  locked,
  rescaling,
  onRescale,
}: Props) {
  const tone = confidenceTone(extraction.overall_confidence);
  const confidencePct =
    extraction.overall_confidence === null
      ? null
      : Math.round(extraction.overall_confidence * 100);

  const [scaleInput, setScaleInput] = useState(extraction.scale_text ?? "");
  useEffect(() => {
    setScaleInput(extraction.scale_text ?? "");
  }, [extraction.scale_text]);

  const inputRatio = parseScaleRatio(scaleInput);
  const currentRatio = parseScaleRatio(extraction.scale_text);
  const changed = inputRatio !== null && inputRatio !== currentRatio;

  function applyRescale() {
    if (inputRatio === null || rescaling) return;
    if (
      confirm(
        `Rescale all ${segmentCount} wall${segmentCount === 1 ? "" : "s"} to 1:${inputRatio}? Every length is recomputed for the new scale.`,
      )
    ) {
      onRescale(inputRatio);
    }
  }

  return (
    <div className="rounded-md border bg-card p-3 text-xs">
      <div className="grid grid-cols-3 gap-x-3">
        <Stat label="View type" value={VIEW_TYPE_LABELS[extraction.view_type]} />
        <Stat
          label="Units"
          value={extraction.units === "unknown" ? "—" : extraction.units}
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
              tone === "secondary" &&
                "bg-amber-500 text-white hover:bg-amber-500",
            )}
          >
            {confidencePct === null ? "—" : `${confidencePct}%`}
          </Badge>
        </div>
      </div>

      <div className="mt-3 border-t pt-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Scale
        </p>
        <div className="mt-1 flex items-center gap-2">
          <Input
            value={scaleInput}
            disabled={locked || rescaling}
            onChange={(e) => setScaleInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && changed) applyRescale();
            }}
            placeholder="e.g. 1:500"
            className="h-8 w-32 font-mono"
          />
          {changed && !locked && (
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0"
              disabled={rescaling}
              onClick={applyRescale}
            >
              {rescaling ? "Rescaling…" : `Rescale to 1:${inputRatio}`}
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Changing the ratio recomputes every wall length for the new scale.
        </p>
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
