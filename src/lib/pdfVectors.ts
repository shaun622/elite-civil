import * as pdfjsLib from "pdfjs-dist";
import { loadPdf, type PdfDocument } from "@/lib/pdfRender";

// Map pdf.js operator codes (numbers) back to their names for diagnostics.
const OPS_BY_CODE: Record<number, string> = {};
for (const [name, code] of Object.entries(pdfjsLib.OPS)) {
  OPS_BY_CODE[code as number] = name;
}

/**
 * Stage 1 feasibility probe. Walks a PDF page's operator list and reports
 * what vector content is present — primarily: are there stroked paths, and
 * what distinct stroke colours appear (so we can tell if retaining walls
 * are colour-separable). Output is intentionally raw/diagnostic so a single
 * run reveals the exact operator + colour formats this pdf.js build emits.
 */

export type PageVectorReport = {
  pageNumber: number;
  pageWidthPt: number;
  pageHeightPt: number;
  totalOps: number;
  opHistogram: { name: string; count: number }[];
  constructPathCount: number;
  strokedPathCount: number;
  filledPathCount: number;
  strokeColors: { color: string; strokedPaths: number }[];
  distinctLineWidths: number[];
  /** Raw dump of the first N colour-setting ops, verbatim. */
  rawColorOpSamples: string[];
  error?: string;
};

export type VectorProbeResult = {
  fileName: string;
  pageCount: number;
  pages: PageVectorReport[];
};

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Best-effort interpretation of a colour op's args into a hex string. */
function argsToColor(opName: string, args: unknown[]): string | null {
  const flat: number[] = [];
  const collect = (v: unknown) => {
    if (typeof v === "number") flat.push(v);
    else if (v && typeof v === "object" && "length" in (v as ArrayLike<unknown>)) {
      const arr = v as ArrayLike<number>;
      for (let i = 0; i < arr.length; i++) {
        if (typeof arr[i] === "number") flat.push(arr[i]);
      }
    }
  };
  for (const a of args) collect(a);

  // A CSS string somewhere in the args.
  for (const a of args) {
    if (typeof a === "string" && /^#?[0-9a-f]{6}$/i.test(a.trim())) {
      const s = a.trim();
      return s.startsWith("#") ? s.toLowerCase() : `#${s.toLowerCase()}`;
    }
  }

  const scale = (n: number) => (n <= 1 ? n * 255 : n);

  if (opName.includes("Gray") && flat.length >= 1) {
    const g = scale(flat[0]);
    return toHex(g, g, g);
  }
  if (opName.includes("CMYK") && flat.length >= 4) {
    const [c, m, y, k] = flat.map((n) => (n <= 1 ? n : n / 255));
    return toHex(
      255 * (1 - c) * (1 - k),
      255 * (1 - m) * (1 - k),
      255 * (1 - y) * (1 - k),
    );
  }
  if (flat.length >= 3) {
    return toHex(scale(flat[0]), scale(flat[1]), scale(flat[2]));
  }
  if (flat.length === 1) {
    // Possibly a packed 0xRRGGBB integer.
    const n = flat[0];
    if (Number.isInteger(n) && n > 255) {
      return toHex((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);
    }
  }
  return null;
}

const STROKE_PAINT_OPS = new Set([
  "stroke",
  "closeStroke",
  "fillStroke",
  "eoFillStroke",
  "closeFillStroke",
  "closeEOFillStroke",
]);
const FILL_PAINT_OPS = new Set(["fill", "eoFill"]);

async function probePage(
  pdf: PdfDocument,
  pageNumber: number,
): Promise<PageVectorReport> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });

  const base: PageVectorReport = {
    pageNumber,
    pageWidthPt: Math.round(viewport.width),
    pageHeightPt: Math.round(viewport.height),
    totalOps: 0,
    opHistogram: [],
    constructPathCount: 0,
    strokedPathCount: 0,
    filledPathCount: 0,
    strokeColors: [],
    distinctLineWidths: [],
    rawColorOpSamples: [],
  };

  try {
    const opList = await page.getOperatorList();
    const fnArray = opList.fnArray;
    const argsArray = opList.argsArray;
    base.totalOps = fnArray.length;

    const opCounts = new Map<string, number>();
    const colorCounts = new Map<string, number>();
    const lineWidths = new Set<number>();
    const rawColorSamples: string[] = [];
    const stack: { strokeColor: string; lineWidth: number }[] = [];

    let strokeColor = "default";
    let lineWidth = 1;

    for (let i = 0; i < fnArray.length; i++) {
      const opName = OPS_BY_CODE[fnArray[i]] ?? `op_${fnArray[i]}`;
      const args = (argsArray[i] ?? []) as unknown[];
      opCounts.set(opName, (opCounts.get(opName) ?? 0) + 1);

      if (opName === "save") {
        stack.push({ strokeColor, lineWidth });
      } else if (opName === "restore") {
        const s = stack.pop();
        if (s) {
          strokeColor = s.strokeColor;
          lineWidth = s.lineWidth;
        }
      } else if (opName === "setLineWidth") {
        if (typeof args[0] === "number") {
          lineWidth = args[0];
          lineWidths.add(Math.round(args[0] * 100) / 100);
        }
      } else if (opName === "constructPath") {
        base.constructPathCount++;
      } else if (/setStroke.*Color/i.test(opName) || opName === "setStrokeColorN") {
        const parsed = argsToColor(opName, args);
        if (parsed) strokeColor = parsed;
        if (rawColorSamples.length < 40) {
          rawColorSamples.push(
            `${opName} ${safeStringify(args)} -> ${parsed ?? "?"}`,
          );
        }
      } else if (STROKE_PAINT_OPS.has(opName)) {
        base.strokedPathCount++;
        colorCounts.set(strokeColor, (colorCounts.get(strokeColor) ?? 0) + 1);
      } else if (FILL_PAINT_OPS.has(opName)) {
        base.filledPathCount++;
      }
    }

    base.opHistogram = [...opCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    base.strokeColors = [...colorCounts.entries()]
      .map(([color, strokedPaths]) => ({ color, strokedPaths }))
      .sort((a, b) => b.strokedPaths - a.strokedPaths);
    base.distinctLineWidths = [...lineWidths].sort((a, b) => a - b);
    base.rawColorOpSamples = rawColorSamples;
  } catch (err) {
    base.error = err instanceof Error ? err.message : "probe failed";
  }

  return base;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, (_k, val) => {
      if (val instanceof Uint8Array || val instanceof Uint8ClampedArray) {
        return `[${val.length} bytes: ${Array.from(val.slice(0, 8)).join(",")}…]`;
      }
      if (typeof val === "number" && !Number.isInteger(val)) {
        return Math.round(val * 1000) / 1000;
      }
      return val;
    });
  } catch {
    return String(v);
  }
}

export async function probePdfVectors(
  file: File | ArrayBuffer,
  fileName = "drawing.pdf",
): Promise<VectorProbeResult> {
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const pdf = await loadPdf(data);
  const pages: PageVectorReport[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    pages.push(await probePage(pdf, i));
  }
  return { fileName, pageCount: pdf.numPages, pages };
}

/* ============================================================
 * Geometry extraction — CTM-aware vector paths in device pixels.
 * ============================================================ */

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Compose two affine matrices the way canvas `ctx.transform` does (A then B). */
function compose(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** A single stroked vector path, flattened to a polyline in device pixels. */
export type VectorPath = {
  /** Flat [x0,y0,x1,y1,...] device-pixel coordinates. */
  points: number[];
  color: string;
  lineWidth: number;
  /** The paint operator that produced this path (stroke / closeFillStroke …). */
  paintOp: string;
};

export type PageVectors = {
  pageNumber: number;
  width: number;
  height: number;
  paths: VectorPath[];
};

function flattenCubic(
  x0: number,
  y0: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x1: number,
  y1: number,
  out: number[],
) {
  // Sample the cubic Bézier at a few points — retaining-wall linework is
  // almost always straight, so 4 samples is ample.
  for (let s = 1; s <= 4; s++) {
    const t = s / 4;
    const mt = 1 - t;
    const x =
      mt * mt * mt * x0 +
      3 * mt * mt * t * c1x +
      3 * mt * t * t * c2x +
      t * t * t * x1;
    const y =
      mt * mt * mt * y0 +
      3 * mt * mt * t * c1y +
      3 * mt * t * t * c2y +
      t * t * t * y1;
    out.push(x, y);
  }
}

/** Parse a constructPath op's args into user-space subpaths (flat point arrays). */
function parseConstructPath(args: unknown[]): number[][] {
  const subOps = (args[0] ?? []) as number[];
  const coords = (args[1] ?? []) as ArrayLike<number>;
  const OPS = pdfjsLib.OPS;
  const subpaths: number[][] = [];
  let cur: number[] = [];
  let ci = 0;
  let cx = 0;
  let cy = 0;

  for (const op of subOps) {
    if (op === OPS.moveTo) {
      if (cur.length >= 4) subpaths.push(cur);
      cx = coords[ci++];
      cy = coords[ci++];
      cur = [cx, cy];
    } else if (op === OPS.lineTo) {
      cx = coords[ci++];
      cy = coords[ci++];
      cur.push(cx, cy);
    } else if (op === OPS.curveTo) {
      const c1x = coords[ci++], c1y = coords[ci++];
      const c2x = coords[ci++], c2y = coords[ci++];
      const ex = coords[ci++], ey = coords[ci++];
      flattenCubic(cx, cy, c1x, c1y, c2x, c2y, ex, ey, cur);
      cx = ex;
      cy = ey;
    } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
      // Variant Béziers (4 args). Approximate with a straight segment to the
      // final point — fine for straight wall linework.
      ci += 2;
      cx = coords[ci++];
      cy = coords[ci++];
      cur.push(cx, cy);
    } else if (op === OPS.closePath) {
      if (cur.length >= 2) cur.push(cur[0], cur[1]);
    } else if (op === OPS.rectangle) {
      const x = coords[ci++], y = coords[ci++];
      const w = coords[ci++], h = coords[ci++];
      if (cur.length >= 4) subpaths.push(cur);
      cur = [x, y, x + w, y, x + w, y + h, x, y + h, x, y];
      cx = x;
      cy = y;
    }
  }
  if (cur.length >= 4) subpaths.push(cur);
  return subpaths;
}

const STROKE_OPS_SET = new Set<number>();

/** Extract every stroked vector path on a page, in device pixels at `scale`. */
export async function extractPageVectors(
  pdf: PdfDocument,
  pageNumber: number,
  scale = 2,
): Promise<PageVectors> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const baseMatrix = viewport.transform as Matrix;
  const opList = await page.getOperatorList();
  const OPS = pdfjsLib.OPS;

  if (STROKE_OPS_SET.size === 0) {
    for (const n of [
      "stroke",
      "closeStroke",
      "fillStroke",
      "eoFillStroke",
      "closeFillStroke",
      "closeEOFillStroke",
    ]) {
      const code = (OPS as Record<string, number>)[n];
      if (typeof code === "number") STROKE_OPS_SET.add(code);
    }
  }

  const paths: VectorPath[] = [];
  let ctm: Matrix = IDENTITY;
  let strokeColor = "#000000";
  let lineWidth = 1;
  const stack: { ctm: Matrix; strokeColor: string; lineWidth: number }[] = [];
  let pending: number[][] = [];

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = (opList.argsArray[i] ?? []) as unknown[];

    if (fn === OPS.save) {
      stack.push({ ctm, strokeColor, lineWidth });
    } else if (fn === OPS.restore) {
      const s = stack.pop();
      if (s) {
        ctm = s.ctm;
        strokeColor = s.strokeColor;
        lineWidth = s.lineWidth;
      }
    } else if (fn === OPS.transform) {
      ctm = compose(ctm, args as Matrix);
    } else if (fn === OPS.setLineWidth) {
      if (typeof args[0] === "number") lineWidth = args[0];
    } else if (fn === OPS.setStrokeRGBColor) {
      strokeColor = argsToColor("setStrokeRGBColor", args) ?? strokeColor;
    } else if (fn === OPS.constructPath) {
      pending = parseConstructPath(args);
    } else if (STROKE_OPS_SET.has(fn)) {
      const full = compose(baseMatrix, ctm);
      const paintOp = OPS_BY_CODE[fn] ?? `op_${fn}`;
      for (const sub of pending) {
        const dev: number[] = [];
        for (let k = 0; k + 1 < sub.length; k += 2) {
          const [dx, dy] = apply(full, sub[k], sub[k + 1]);
          dev.push(dx, dy);
        }
        if (dev.length >= 4) {
          paths.push({ points: dev, color: strokeColor, lineWidth, paintOp });
        }
      }
      pending = [];
    } else if (fn === OPS.endPath) {
      pending = [];
    }
  }

  return {
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    paths,
  };
}

export async function extractPdfPageVectors(
  file: File | ArrayBuffer,
  pageNumber: number,
  scale = 2,
): Promise<PageVectors> {
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const pdf = await loadPdf(data);
  return extractPageVectors(pdf, pageNumber, scale);
}

/* ============================================================
 * Wall-run grouping — merge connected same-colour segments.
 * ============================================================ */

/** Total polyline length of a flat [x0,y0,x1,y1,...] point array. */
export function polylineLength(points: number[]): number {
  let total = 0;
  for (let k = 2; k + 1 < points.length; k += 2) {
    total += Math.hypot(
      points[k] - points[k - 2],
      points[k + 1] - points[k - 1],
    );
  }
  return total;
}

export type WallRun = {
  color: string;
  paths: VectorPath[];
  /** Total length of all segments in this run, in device pixels. */
  lengthPx: number;
};

/** A bucket of paths sharing colour + line weight + paint operator. */
export type PathBucket = {
  color: string;
  lineWidth: number;
  paintOp: string;
  count: number;
  lengthPx: number;
};

/**
 * Break a colour-filtered set of paths down by (line weight, paint op) so we
 * can tell which bucket is the actual wall line vs hatch / batter ticks.
 */
export function bucketPaths(
  paths: VectorPath[],
  colors: Set<string>,
): PathBucket[] {
  const buckets = new Map<string, PathBucket>();
  for (const p of paths) {
    if (!colors.has(p.color.toLowerCase())) continue;
    const lw = Math.round(p.lineWidth);
    const key = `${p.color.toLowerCase()}|${lw}|${p.paintOp}`;
    const existing = buckets.get(key);
    const len = polylineLength(p.points);
    if (existing) {
      existing.count++;
      existing.lengthPx += len;
    } else {
      buckets.set(key, {
        color: p.color.toLowerCase(),
        lineWidth: lw,
        paintOp: p.paintOp,
        count: 1,
        lengthPx: len,
      });
    }
  }
  return [...buckets.values()].sort((a, b) => b.lengthPx - a.lengthPx);
}

/**
 * Group stroked paths into wall runs. Only paths whose colour is in
 * `colors` are considered; same-colour paths whose endpoints touch
 * (within `tolerancePx`) are merged into one run via union-find.
 */
export function groupIntoRuns(
  paths: VectorPath[],
  colors: Set<string>,
  tolerancePx = 3,
): WallRun[] {
  const subset = paths.filter((p) => colors.has(p.color.toLowerCase()));
  const n = subset.length;
  if (n === 0) return [];

  const parent = subset.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) {
      const next = parent[i];
      parent[i] = r;
      i = next;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  const ends = subset.map((p) => {
    const len = p.points.length;
    return [
      [p.points[0], p.points[1]],
      [p.points[len - 2], p.points[len - 1]],
    ];
  });
  const t2 = tolerancePx * tolerancePx;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (subset[i].color.toLowerCase() !== subset[j].color.toLowerCase()) {
        continue;
      }
      let connected = false;
      for (const ei of ends[i]) {
        for (const ej of ends[j]) {
          const dx = ei[0] - ej[0];
          const dy = ei[1] - ej[1];
          if (dx * dx + dy * dy <= t2) {
            connected = true;
            break;
          }
        }
        if (connected) break;
      }
      if (connected) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const arr = groups.get(root);
    if (arr) arr.push(i);
    else groups.set(root, [i]);
  }

  const runs: WallRun[] = [];
  for (const idxs of groups.values()) {
    const runPaths = idxs.map((i) => subset[i]);
    const lengthPx = runPaths.reduce(
      (sum, p) => sum + polylineLength(p.points),
      0,
    );
    runs.push({ color: runPaths[0].color, paths: runPaths, lengthPx });
  }
  return runs.sort((a, b) => b.lengthPx - a.lengthPx);
}

/* ============================================================
 * OBB-based wall measurement.
 *
 * Walls on this drawing are filled closed polygons (closeFillStroke),
 * so a polyline length measures the *perimeter*. Instead, each path's
 * length is its oriented-bounding-box long axis. Short shapes (batter
 * ticks) are dropped, surviving wall pieces are clustered by bounding-box
 * proximity, and a wall's length is the SUM of its pieces' long axes
 * (which stays correct around corners).
 * ============================================================ */

export type Obb = {
  length: number;
  width: number;
  /** Centroid. */
  cx: number;
  cy: number;
  /** Direction of the long axis, radians. */
  angle: number;
};

/** Oriented bounding box of a point set, via principal-component analysis. */
export function pathOBB(points: number[]): Obb {
  const n = points.length / 2;
  if (n < 2) return { length: 0, width: 0, cx: 0, cy: 0, angle: 0 };

  let mx = 0;
  let my = 0;
  for (let i = 0; i < points.length; i += 2) {
    mx += points[i];
    my += points[i + 1];
  }
  mx /= n;
  my /= n;

  let cxx = 0;
  let cxy = 0;
  let cyy = 0;
  for (let i = 0; i < points.length; i += 2) {
    const dx = points[i] - mx;
    const dy = points[i + 1] - my;
    cxx += dx * dx;
    cxy += dx * dy;
    cyy += dy * dy;
  }

  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);

  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    const dx = points[i] - mx;
    const dy = points[i + 1] - my;
    const u = dx * ux + dy * uy;
    const v = -dx * uy + dy * ux;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const a = maxU - minU;
  const b = maxV - minV;
  if (a >= b) {
    return { length: a, width: b, cx: mx, cy: my, angle: theta };
  }
  return { length: b, width: a, cx: mx, cy: my, angle: theta + Math.PI / 2 };
}

/** OBB length + width (device px) for every path of an isolated colour. */
export function pathDimensions(
  paths: VectorPath[],
  colors: Set<string>,
): { lengthPx: number; widthPx: number }[] {
  return paths
    .filter((p) => colors.has(p.color.toLowerCase()))
    .map((p) => {
      const obb = pathOBB(p.points);
      return { lengthPx: obb.length, widthPx: obb.width };
    });
}

/**
 * Measure walls. The retaining walls are drawn as thick *dashed* lines, so
 * each dash is a separate filled rectangle. This:
 *   1. Keeps only pieces that look like wall dashes (length / width above
 *      the given minimums — drops batter ticks and height-label glyphs).
 *   2. Clusters dashes that are collinear and sequential along the same
 *      line into one wall run (bridging the dash gaps).
 *   3. Measures each run by the bounding box of the whole dash chain — so
 *      the gaps between dashes are counted, giving the true wall length.
 */
export function measureWallRuns(
  paths: VectorPath[],
  colors: Set<string>,
  minPieceLengthPx: number,
  minPieceWidthPx: number,
  maxGapPx: number,
): WallRun[] {
  const pieces = paths
    .filter((p) => colors.has(p.color.toLowerCase()))
    .map((p) => ({ path: p, obb: pathOBB(p.points) }))
    .filter(
      (x) =>
        x.obb.length >= minPieceLengthPx && x.obb.width >= minPieceWidthPx,
    );

  const n = pieces.length;
  if (n === 0) return [];

  const parent = pieces.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) {
      const next = parent[i];
      parent[i] = r;
      i = next;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  const MAX_ANGLE = (14 * Math.PI) / 180;
  // Perpendicular tolerance: dashes of one wall sit on a shared centreline.
  // Keep it tight so a parallel neighbouring wall doesn't merge in.
  const maxPerpPx = Math.max(minPieceWidthPx * 1.5, 4);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pi = pieces[i];
      const pj = pieces[j];
      if (pi.path.color.toLowerCase() !== pj.path.color.toLowerCase()) {
        continue;
      }
      // Collinear?
      let da = Math.abs(pi.obb.angle - pj.obb.angle) % Math.PI;
      if (da > Math.PI / 2) da = Math.PI - da;
      if (da > MAX_ANGLE) continue;

      const ux = Math.cos(pi.obb.angle);
      const uy = Math.sin(pi.obb.angle);
      const dx = pj.obb.cx - pi.obb.cx;
      const dy = pj.obb.cy - pi.obb.cy;
      const perp = Math.abs(-dx * uy + dy * ux);
      if (perp > maxPerpPx) continue;

      const along = Math.abs(dx * ux + dy * uy);
      const gap = along - pi.obb.length / 2 - pj.obb.length / 2;
      if (gap > maxGapPx) continue;

      union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const arr = groups.get(root);
    if (arr) arr.push(i);
    else groups.set(root, [i]);
  }

  const runs: WallRun[] = [];
  for (const idxs of groups.values()) {
    const members = idxs.map((i) => pieces[i]);
    // Length = long axis of the whole dash chain (spans the gaps).
    const allPoints: number[] = [];
    for (const m of members) allPoints.push(...m.path.points);
    const lengthPx = pathOBB(allPoints).length;
    runs.push({
      color: members[0].path.color,
      paths: members.map((m) => m.path),
      lengthPx,
    });
  }
  return runs.sort((a, b) => b.lengthPx - a.lengthPx);
}

/* ============================================================
 * Snap-to-geometry — pick the vector vertex nearest a click.
 * ============================================================ */

/**
 * Find the vector vertex nearest to a point, in the same device-pixel
 * space the paths were extracted in. Used so manual scale calibration can
 * snap each click onto exact drawing geometry (a scale-bar tick, a wall
 * corner) instead of an imprecise freehand point. Returns `null` when no
 * vertex lies within `maxDistPx`.
 */
export function nearestVertex(
  paths: VectorPath[],
  x: number,
  y: number,
  maxDistPx: number,
): [number, number] | null {
  let best: [number, number] | null = null;
  let bestD2 = maxDistPx * maxDistPx;
  for (const p of paths) {
    const pts = p.points;
    for (let k = 0; k + 1 < pts.length; k += 2) {
      const dx = pts[k] - x;
      const dy = pts[k + 1] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = [pts[k], pts[k + 1]];
      }
    }
  }
  return best;
}
