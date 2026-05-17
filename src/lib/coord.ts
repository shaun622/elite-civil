import type { Bbox, Point } from "@/types/db";

const NORM = 1000;

export function bboxToPixels(
  bbox: Bbox,
  imageWidth: number,
  imageHeight: number,
) {
  const [x1, y1, x2, y2] = bbox;
  const left = (Math.min(x1, x2) / NORM) * imageWidth;
  const top = (Math.min(y1, y2) / NORM) * imageHeight;
  const right = (Math.max(x1, x2) / NORM) * imageWidth;
  const bottom = (Math.max(y1, y2) / NORM) * imageHeight;
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function pointsToPixels(
  points: Point[],
  imageWidth: number,
  imageHeight: number,
): number[] {
  const out: number[] = [];
  for (const [x, y] of points) {
    out.push((x / NORM) * imageWidth, (y / NORM) * imageHeight);
  }
  return out;
}
