import { useEffect, useState } from "react";
import { MousePointerClick } from "lucide-react";
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
  onCalibrate: () => void;
};

export function ExtractionMeta({
  extraction,
  segmentCount,
  locked,
  rescaling,
  onRescale,
  onCalibrate,
}: Props) {
  const tone = confidenceTone(extraction.overall_confidence);
  const confidencePct =
    extraction.overall_confidence === null
      ? null
      : Math.round(extraction.overall_confidence * 100);

  const [scaleInput, setScaleInput] = useState(extraction.scale_text ?? "");
  const [showRatio, setShowRatio] = useState(false);
  useEffect(() => {
    setScaleInput(extraction.scale_text ?? "");
  }, [extraction.scale_text]);

  const inputRatio = parseScaleRatio(scaleInput);
  const currentRatio = parseScaleRatio(extraction.scale_text);
  const changed = inputRatio !== null && inputRatio !== currentRatio;

  // Current calibration reading (from the stored mm-per-pixel + any ratio).
  const raw = extraction.raw_response;
  const mmPerPx =
    raw &&
    typeof raw === "object" &&
    "mm_per_px" in raw &&
    typeof (raw as Record<string, unknown>).mm_per_px === "number"
      ? ((raw as Record<string, unknown>).mm_per_px as number)
      : null;
  const currentReading = extraction.scale_text
    ? `Current: ${extraction.scale_text}${mmPerPx ? ` · 1 px = ${mmPerPx.toFixed(3)} mm` : ""}`
    : mmPerPx
      ? `Current: 1 px = ${mmPerPx.toFixed(3)} mm`
      : "Not calibrated yet";

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
        <p className="mt-0.5 text-sm font-medium tabular-nums">
          {currentReading}
        </p>

        {!locked && (
          <>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Click <strong>Set points</strong>, then two points a known
              distance apart on the drawing and enter that distance, the most
              accurate way to recalibrate.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-8 w-full gap-1.5"
              onClick={onCalibrate}
            >
              <MousePointerClick className="h-3.5 w-3.5" />
              Set points on the drawing
            </Button>

            <button
              type="button"
              onClick={() => setShowRatio((s) => !s)}
              className="mt-2 block text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {showRatio
                ? "Hide scale ratio"
                : "Know the scale ratio? Enter it instead"}
            </button>

            {showRatio && (
              <div className="mt-2 rounded-md border border-dashed bg-muted/30 p-2.5">
                <div className="flex items-center gap-2">
                  <Input
                    value={scaleInput}
                    disabled={rescaling}
                    onChange={(e) => setScaleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && changed) applyRescale();
                    }}
                    placeholder="e.g. 1:500"
                    className="h-8 w-32 font-mono"
                  />
                  {changed && (
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
                  Changing the ratio recomputes every wall length.
                </p>
              </div>
            )}
          </>
        )}
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
