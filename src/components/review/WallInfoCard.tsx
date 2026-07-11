import { X } from "lucide-react";
import { bandColor, bandIndex, bandLabel } from "@/lib/engine/heightBands";
import { roundHeightUp } from "@/lib/engine/calculations";
import type { WallSegment } from "@/types/db";

const CARD_W = 224; // w-56
const CARD_H = 116; // upper-bound estimate, used only for clamping

/**
 * Floating info card shown when a wall is clicked on the drawing. Anchored at
 * the wall midpoint (in container pixels) and clamped inside the viewport.
 * Takeoff facts only: label, lot, length, height, face m², design and the
 * height band. The band dot uses the same rounding + colour chain as the wall
 * colouring, so it always matches the on-drawing wall colour.
 */
export function WallInfoCard({
  segment,
  edges,
  roundOpts,
  anchor,
  containerSize,
  onClose,
}: {
  segment: WallSegment;
  edges: number[];
  roundOpts: { enabled: boolean; incrementM: number };
  anchor: { x: number; y: number };
  containerSize: { width: number; height: number };
  onClose: () => void;
}) {
  const lengthM = segment.length_mm != null ? segment.length_mm / 1000 : null;
  const heightM = segment.height_mm != null ? segment.height_mm / 1000 : null;
  const faceM2 = lengthM != null && heightM != null ? lengthM * heightM : null;

  const title = `${segment.label?.trim() || "Wall"}${
    segment.lot ? ` · Lot ${segment.lot}` : ""
  }`;

  const dims: string[] = [];
  if (lengthM != null) dims.push(`${lengthM.toFixed(1)} m long`);
  dims.push(heightM != null ? `${heightM.toFixed(1)} m high` : "height not set");
  const dimLine = dims.join(" · ");

  const designLine = `${segment.wall_design ?? "Design not set"}${
    faceM2 != null ? ` · ${faceM2.toFixed(1)} m²` : ""
  }`;

  let band: { color: string; label: string } | null = null;
  if (heightM != null && edges.length > 0) {
    const i = bandIndex(roundHeightUp(heightM, roundOpts), edges);
    band = { color: bandColor(i), label: bandLabel(i, edges) };
  }

  // Prefer sitting below the wall (the Konva length/m² badge sits above the
  // midpoint); flip above if that would overflow the bottom edge.
  const left = clamp(anchor.x - CARD_W / 2, 8, containerSize.width - CARD_W - 8);
  let top = anchor.y + 16;
  if (top + CARD_H > containerSize.height - 8) top = anchor.y - CARD_H - 16;
  top = clamp(top, 8, Math.max(8, containerSize.height - CARD_H - 8));

  return (
    <div
      className="pointer-events-auto absolute w-56 rounded-xl border bg-white p-3 pr-8 shadow-lg"
      style={{ left, top }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close wall info"
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{dimLine}</p>
      <p className="mt-1 text-xs font-semibold text-sky-700">{designLine}</p>

      {band && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <svg width="10" height="10" className="shrink-0">
            <rect width="10" height="10" rx="3" fill={band.color} />
          </svg>
          <span>{band.label}</span>
        </div>
      )}
    </div>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
