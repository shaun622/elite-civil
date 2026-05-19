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
  /** Source vector paths that make up this run. */
  paths: VectorPath[];
  /** Reconstructed centreline as a flat [x0,y0,x1,y1,...] polyline (px). */
  polyline: number[];
  /** True wall length measured along the centreline, in device pixels. */
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

/* ============================================================
 * Oriented bounding box — used to measure a filled-polygon wall by its
 * long axis (a filled shape's polyline length is its perimeter, not its
 * run length).
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

/* ============================================================
 * Wall measurement — group wall-coloured linework into measured runs.
 *
 * Retaining walls are colour-coded linework. They may be drawn as thin
 * stroked lines (often a dashed / dash-dot linetype exploded into many
 * short segments) or, on some drawings, as filled blocks. This:
 *   1. Reduces every wall-coloured path to a measurable centreline piece.
 *   2. Chains pieces whose ends meet — bridging dash gaps, following
 *      corners — into one run per physical wall, without merging walls
 *      that merely cross or run parallel.
 *   3. Reconstructs each run's centreline and measures its true length.
 * ============================================================ */

/** A wall-coloured path reduced to a measurable centreline piece. */
type WallPiece = {
  path: VectorPath;
  /** Ordered centreline points (flat) — the stroked path itself, or the
   *  long axis of the oriented bounding box for a filled shape. */
  pts: number[];
  /** The two endpoints of `pts`. */
  a: [number, number];
  b: [number, number];
  /** Centreline length of this piece, device px. */
  length: number;
};

function toWallPiece(path: VectorPath): WallPiece {
  if (/fill/i.test(path.paintOp)) {
    // Filled block — its outline's polyline length is a perimeter, so
    // measure the long axis of its oriented bounding box instead.
    const obb = pathOBB(path.points);
    const ux = Math.cos(obb.angle);
    const uy = Math.sin(obb.angle);
    const hl = obb.length / 2;
    const a: [number, number] = [obb.cx - ux * hl, obb.cy - uy * hl];
    const b: [number, number] = [obb.cx + ux * hl, obb.cy + uy * hl];
    return { path, pts: [a[0], a[1], b[0], b[1]], a, b, length: obb.length };
  }
  const p = path.points;
  const a: [number, number] = [p[0], p[1]];
  const b: [number, number] = [p[p.length - 2], p[p.length - 1]];
  return { path, pts: p, a, b, length: polylineLength(p) };
}

/** Shortest distance from a point to a segment, device px. */
function pointSegDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Gap tolerance for chaining the pieces of one wall, derived from the
 * linework itself: most piece endpoints sit one linetype-gap from their
 * neighbour, so the bulk of nearest-neighbour distances *is* that gap.
 */
function autoGapPx(pieces: WallPiece[]): number {
  const FALLBACK = 10;
  if (pieces.length < 4) return FALLBACK;
  const eps: { x: number; y: number; pi: number }[] = [];
  pieces.forEach((p, i) => {
    eps.push({ x: p.a[0], y: p.a[1], pi: i });
    eps.push({ x: p.b[0], y: p.b[1], pi: i });
  });
  const nn: number[] = [];
  for (const e of eps) {
    let best = Infinity;
    for (const f of eps) {
      if (f.pi === e.pi) continue;
      const d = Math.hypot(e.x - f.x, e.y - f.y);
      if (d < best) best = d;
    }
    if (Number.isFinite(best)) nn.push(best);
  }
  if (nn.length === 0) return FALLBACK;
  nn.sort((a, b) => a - b);
  const p75 = nn[Math.min(nn.length - 1, Math.floor(nn.length * 0.75))];
  return Math.min(Math.max(p75 * 1.6, 5), 80);
}

/** Closest endpoint pairing between two pieces. */
function bestEndpointLink(
  pi: WallPiece,
  pj: WallPiece,
): { d: number; iEnd: number; jEnd: number } {
  const ei: [number, number][] = [pi.a, pi.b];
  const ej: [number, number][] = [pj.a, pj.b];
  let bd = Infinity;
  let bi = 0;
  let bj = 0;
  for (let x = 0; x < 2; x++) {
    for (let y = 0; y < 2; y++) {
      const d = Math.hypot(ei[x][0] - ej[y][0], ei[x][1] - ej[y][1]);
      if (d < bd) {
        bd = d;
        bi = x;
        bj = y;
      }
    }
  }
  return { d: bd, iEnd: bi, jEnd: bj };
}

/** Unit heading at one end of a piece — toward the join (`into`) or away. */
function heading(
  p: WallPiece,
  endIdx: number,
  into: boolean,
): [number, number] {
  const ep = endIdx === 0 ? p.a : p.b;
  const fp = endIdx === 0 ? p.b : p.a;
  const dx = into ? ep[0] - fp[0] : fp[0] - ep[0];
  const dy = into ? ep[1] - fp[1] : fp[1] - ep[1];
  const m = Math.hypot(dx, dy) || 1;
  return [dx / m, dy / m];
}

/** Chain pieces of one colour into runs (returns arrays of piece indices). */
function connectPieces(pieces: WallPiece[], gapPx: number): number[][] {
  const n = pieces.length;
  const parent = pieces.map((_, i) => i);
  function find(i: number): number {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) {
      const nx = parent[i];
      parent[i] = r;
      i = nx;
    }
    return r;
  }

  const WELD = 2.5;
  const ANGLE_TOL = Math.cos((52 * Math.PI) / 180);
  const shortLimit = gapPx * 1.5;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (find(i) === find(j)) continue;
      const link = bestEndpointLink(pieces[i], pieces[j]);
      if (link.d > gapPx) continue;
      let join = link.d <= WELD;
      if (!join) {
        const dotLike =
          pieces[i].length < shortLimit || pieces[j].length < shortLimit;
        if (dotLike) {
          // A dot is too short to have a reliable direction — chain it on
          // proximity alone; it sits between two dashes of its own wall.
          join = true;
        } else {
          // Two real dashes only chain if one continues the other's line,
          // so a wall that merely crosses or runs parallel is not merged.
          const di = heading(pieces[i], link.iEnd, true);
          const dj = heading(pieces[j], link.jEnd, false);
          join = di[0] * dj[0] + di[1] * dj[1] >= ANGLE_TOL;
        }
      }
      if (join) parent[find(i)] = find(j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const arr = groups.get(r);
    if (arr) arr.push(i);
    else groups.set(r, [i]);
  }
  return [...groups.values()];
}

/** Walk a run's pieces end to end, returning the centreline as a flat
 *  polyline — piece lengths plus the bridged gaps between them. */
function traceRun(pieces: WallPiece[]): number[] {
  if (pieces.length === 1) return pieces[0].pts.slice();

  // The two endpoints furthest apart are the wall's ends — start at one.
  const ends: [number, number][] = [];
  for (const p of pieces) {
    ends.push(p.a);
    ends.push(p.b);
  }
  let sx = ends[0][0];
  let sy = ends[0][1];
  let far = -1;
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const d = Math.hypot(ends[i][0] - ends[j][0], ends[i][1] - ends[j][1]);
      if (d > far) {
        far = d;
        sx = ends[i][0];
        sy = ends[i][1];
      }
    }
  }

  const used = new Array(pieces.length).fill(false);
  const out: number[] = [sx, sy];
  let cx = sx;
  let cy = sy;
  for (let step = 0; step < pieces.length; step++) {
    let bi = -1;
    let bend = 0;
    let bd = Infinity;
    for (let i = 0; i < pieces.length; i++) {
      if (used[i]) continue;
      const da = Math.hypot(pieces[i].a[0] - cx, pieces[i].a[1] - cy);
      const db = Math.hypot(pieces[i].b[0] - cx, pieces[i].b[1] - cy);
      if (da < bd) {
        bd = da;
        bi = i;
        bend = 0;
      }
      if (db < bd) {
        bd = db;
        bi = i;
        bend = 1;
      }
    }
    if (bi < 0) break;
    used[bi] = true;
    const pts = pieces[bi].pts;
    if (bend === 0) {
      for (let k = 0; k + 1 < pts.length; k += 2) out.push(pts[k], pts[k + 1]);
      cx = pieces[bi].b[0];
      cy = pieces[bi].b[1];
    } else {
      for (let k = pts.length - 2; k >= 0; k -= 2) out.push(pts[k], pts[k + 1]);
      cx = pieces[bi].a[0];
      cy = pieces[bi].a[1];
    }
  }
  return out;
}

/** Drop near-collinear interior vertices so the stored centreline keeps
 *  only the wall's real corners (its length is preserved). */
function simplifyFlat(flat: number[], epsPx: number): number[] {
  const n = flat.length / 2;
  if (n <= 2) return flat.slice();
  const out: number[] = [flat[0], flat[1]];
  for (let i = 1; i < n - 1; i++) {
    const ax = out[out.length - 2];
    const ay = out[out.length - 1];
    const bx = flat[i * 2];
    const by = flat[i * 2 + 1];
    const cx = flat[(i + 1) * 2];
    const cy = flat[(i + 1) * 2 + 1];
    if (pointSegDist(bx, by, ax, ay, cx, cy) > epsPx) out.push(bx, by);
  }
  out.push(flat[(n - 1) * 2], flat[(n - 1) * 2 + 1]);
  return out;
}

export type MeasureWallsOptions = {
  /** Override the auto-derived gap tolerance (device px). */
  gapPx?: number;
  /** Drop runs shorter than this (device px). Default 0 — keep all. */
  minRunLengthPx?: number;
};

/**
 * Group a page's wall-coloured linework into measured wall runs. Each run
 * is one physical wall: a chain of connected same-colour pieces, with its
 * centreline reconstructed and its true length measured along it.
 */
export function measureWalls(
  paths: VectorPath[],
  colors: Set<string>,
  opts: MeasureWallsOptions = {},
): WallRun[] {
  const wallPaths = paths.filter(
    (p) => p.points.length >= 4 && colors.has(p.color.toLowerCase()),
  );
  if (wallPaths.length === 0) return [];

  const allPieces = wallPaths.map(toWallPiece);
  const gapPx = opts.gapPx ?? autoGapPx(allPieces);
  const minRun = opts.minRunLengthPx ?? 0;

  const byColor = new Map<string, WallPiece[]>();
  for (const piece of allPieces) {
    const c = piece.path.color.toLowerCase();
    const arr = byColor.get(c);
    if (arr) arr.push(piece);
    else byColor.set(c, [piece]);
  }

  const runs: WallRun[] = [];
  for (const [color, pieces] of byColor) {
    for (const idxs of connectPieces(pieces, gapPx)) {
      const traced = traceRun(idxs.map((i) => pieces[i]));
      const polyline = simplifyFlat(traced, 1.5);
      const lengthPx = polylineLength(polyline);
      if (lengthPx < minRun) continue;
      runs.push({
        color,
        paths: idxs.map((i) => pieces[i].path),
        polyline,
        lengthPx,
      });
    }
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

/**
 * The stroked path passing nearest to (x,y) within `maxDistPx`, by
 * perpendicular distance to its segments — used for click-to-identify, so
 * a click on a wall samples that wall's exact colour. Null if none is near.
 */
export function nearestPath(
  paths: VectorPath[],
  x: number,
  y: number,
  maxDistPx: number,
): VectorPath | null {
  let best: VectorPath | null = null;
  let bestD = maxDistPx;
  for (const p of paths) {
    const pts = p.points;
    for (let k = 0; k + 3 < pts.length; k += 2) {
      const d = pointSegDist(x, y, pts[k], pts[k + 1], pts[k + 2], pts[k + 3]);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}
