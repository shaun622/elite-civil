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
