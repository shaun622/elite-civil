import type { Bbox, Point } from "@/types/db";

/**
 * Coordinates from the extractor are image-pixel positions: x in
 * 0..imageWidth, y in 0..imageHeight. These helpers clamp to the image
 * bounds so a stray coordinate can never render off the drawing.
 *
 * Note: extractions created before 2026-05-17 used a normalized 0-1000
 * coordinate space and will render in the top-left corner — re-extract
 * those pages to get correct overlay positions.
 */

function clamp(v: number, max: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(max, v));
}

export function bboxToPixels(
  bbox: Bbox,
  imageWidth: number,
  imageHeight: number,
) {
  const [x1, y1, x2, y2] = bbox;
  const left = clamp(Math.min(x1, x2), imageWidth);
  const top = clamp(Math.min(y1, y2), imageHeight);
  const right = clamp(Math.max(x1, x2), imageWidth);
  const bottom = clamp(Math.max(y1, y2), imageHeight);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function pointsToPixels(
  points: Point[],
  imageWidth: number,
  imageHeight: number,
): number[] {
  const out: number[] = [];
  for (const [x, y] of points) {
    out.push(clamp(x, imageWidth), clamp(y, imageHeight));
  }
  return out;
}
