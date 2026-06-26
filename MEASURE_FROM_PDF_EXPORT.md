# Measure-from-PDF — portable export

A self-contained export of the **"Measure walls from PDF"** system from the
TakeoffMate estimator. Drop this single file into another Claude session and it
has everything needed to rebuild the feature in a different tool: the full
algorithm, the exact coordinate model, every dependency, the proven source of
each file (verbatim, at the bottom), and a precise checklist for decoupling it
from this app's Supabase/router/auth.

> **Reading order for the implementing agent:** read §1–§6 (the contract +
> coordinate model + deps), then create the four files in §"Source files" in
> dependency order, then follow §7 (decoupling checklist) to wire it into the
> host tool. The engine files (`pdfRender.ts`, `pdfVectors.ts`) are dependency-
> light and drop in unchanged. The React page is a *reference UI* — keep its
> logic, re-skin its chrome.

---

## 1. What it does

Given a **vector PDF** of a civil/landscape site plan, it measures the real-
world length of retaining walls straight from the drawing's vector geometry —
no manual tracing, no raster tracing, no AI. The user:

1. **Calibrates the scale** — clicks two points a known distance apart (a scale
   bar is ideal) and types that distance, or enters the plot ratio (e.g.
   `1:500`). This yields `mmPerPx` (real millimetres per device pixel).
2. **Identifies walls** — either by **colour** (click a wall, or pick swatches
   from the palette of stroke colours found on the sheet) or, on mono-colour
   drawings, by **picking walls one by one** (click a wall to grab its whole
   connected run; Alt/Shift to grab a single segment).
3. **Measures & saves** — the engine groups the wall-coloured linework into one
   run per physical wall, reconstructs each centreline, and multiplies its pixel
   length by `mmPerPx` to get `lengthMm`. The output is a list of
   `MeasuredWall` the host app persists however it likes.

The hard part — and the reusable IP — is **`measureWalls`** in `pdfVectors.ts`:
turning thousands of little stroked dashes (linetypes explode into many short
segments), corners, T-junctions and surveyor marks into *one clean run per
wall* without fusing walls that merely cross or run parallel.

## 2. The pipeline (data flow)

```
PDF (ArrayBuffer)
  │  pdfjs-dist getOperatorList()  ── walk the page's draw ops, CTM-aware
  ▼
VectorPath[]               extractPageVectors(pdf, pageNo, VECTOR_SCALE)
  │  every STROKED path, flattened to a device-pixel polyline + its colour
  │  (VECTOR_SCALE = 200/72, so coords live in 200-DPI raster-pixel space)
  ▼
filter by wall colour(s)   (or by a hand-picked subset of path indices)
  ▼
measureWalls(paths, colors)
  │  1. toWallPiece     — reduce each path to a measurable centreline piece
  │  2. autoGapPx       — derive a dash-gap tolerance from the linework itself
  │  3. connectPieces   — union-find chaining, junction-aware (T/+ guard)
  │  4. mergeCollinearRuns — 2nd pass: re-fuse runs split by X/SS/RL marks
  │  5. runCentreline   — straight wall → OBB long axis; bent wall → traced
  ▼
WallRun[]  (polyline in device px, lengthPx)
  │  × mmPerPx
  ▼
MeasuredWall[]  { color, typeLabel, polyline:[x,y][], lengthMm }
  │  host app persists (this app writes wall_segments rows; yours does its thing)
  ▼
(heights/RLs are added later, downstream — NOT part of this system)
```

## 3. The contract (clean I/O boundary)

The whole system reduces to **one input** (PDF bytes + page no, optional backdrop
image URL) and **one output** (measured walls + the calibration). Everything
else in the reference page is host plumbing.

```ts
/** A measured wall. Coordinates are in DEVICE PIXELS = the 200-DPI raster
 *  pixel space (see §4). lengthMm is the real-world length. */
export type MeasuredWall = {
  color: string;                 // lowercase hex, e.g. "#dd6e00"
  typeLabel: string;             // user's label for this wall type
  polyline: [number, number][];  // centreline, device-pixel coords
  lengthMm: number;
};

/** What the user calibrated, plus the walls. */
export type MeasureResult = {
  walls: MeasuredWall[];
  mmPerPx: number;               // real mm per device pixel
  scaleText: string | null;      // e.g. "1:500" if the user noted it
};

/** Recommended props for a decoupled <MeasureFromPdf> component. */
export type MeasureFromPdfProps = {
  pdfBuffer: ArrayBuffer;        // the PDF bytes (host loads these however)
  pageNumber?: number;           // 1-based; default 1
  backdropUrl?: string;          // optional URL to a 200-DPI PNG of the SAME
                                 //   page, for the faint backdrop (see §4)
  onMeasured: (r: MeasureResult) => void;
  onSkip?: (r: Omit<MeasureResult, "walls">) => void; // calibration only
  onCancel?: () => void;
};
```

If your tool only needs the *engine* (no UI), you can ignore the React page
entirely and call `extractWallsFromPdfPage(pdfBuffer, pageNumber, { wallColors,
mmPerPx })` directly — it returns `MeasuredWall[]`.

## 4. Coordinate model — read this twice

This is the single most important thing to get right; every bug in a port comes
from here.

- **Device-pixel space.** Vectors are extracted at `VECTOR_SCALE = 200/72 ≈
  2.7778`, i.e. as if the sheet were rasterised at **200 DPI**. All polyline
  coords, click hit-tests, calibration points and the stored centrelines live in
  this one space. `extractPageVectors(pdf, pageNo, scale)` bakes the page's
  viewport transform (`viewport.transform`) into every point, so a path's points
  are already in this pixel space — no per-call matrix maths downstream.
- **`mmPerPx`** is *real millimetres per device pixel*. Two ways to get it:
  - **Click calibration (most accurate):** `mmPerPx = (knownMetres*1000) /
    pixelDistanceBetweenTheTwoClicks`.
  - **Plot ratio:** `mmPerPx = (25.4 / 200) * ratio` (a 200-DPI pixel spans
    `25.4/200` mm of paper, times the plot ratio). See `mmPerPxFromScaleRatio`.
  - Then `lengthMm = lengthPx * mmPerPx`.
- **Optional raster backdrop.** The page can show a faint PNG of the sheet
  behind the vectors so the user can read labels/streets the vector pass drops.
  That PNG **must be rasterised at the same 200 DPI** (this app uses
  `rasterizePage(pdf, pageNo, 200)` in `pdfRender.ts`). Because both share the
  200-DPI space, the PNG draws straight onto the full canvas with **no offset or
  scale maths** — `ctx.drawImage(png, 0, 0, canvas.width, canvas.height)`.
- **Canvas render transform.** The `<canvas>` draws the *whole sheet* at
  `displayScale = baseDs * zoom`, origin `(0,0)`, where `baseDs =
  min(containerW / sheetW, containerH / sheetH)` fits the sheet to the viewport.
  The canvas *bitmap* is resized to `sheetW*displayScale × sheetH*displayScale`
  so lines stay crisp at any zoom (it is NOT a CSS transform).
- **Click → vector coords.** Because origin is `(0,0)` and the only transform is
  the uniform `displayScale`:
  `vectorX = (clientX - canvasRect.left) / displayScale` (same for Y). Snap
  radii etc. are divided by `displayScale` so they stay constant on screen.
- **Zoom-toward-cursor + pan** are done by resizing the bitmap and adjusting the
  scroll container's `scrollLeft/scrollTop`, not by transforms. Wheel zoom uses
  a **native, non-passive** `wheel` listener (React's `onWheel` is passive and
  can't `preventDefault` the page scroll). Click actions are resolved from
  **pointer-up with a <3 px move threshold**, because the pan's
  `setPointerCapture` swallows the canvas `click` event in most browsers.

## 5. Dependencies

Runtime libraries actually used by this system (versions this app ships, but
recent majors are fine):

| package | version | used for |
|---|---|---|
| `pdfjs-dist` | `^4.7.76` | PDF parse, operator list, viewport, raster render |
| `react` / `react-dom` | `^18.3.1` | the reference UI component |
| `lucide-react` | `^0.460.0` | icons in the reference UI (swap freely) |

The shadcn/ui primitives (`Button`, `Input`, `Label`, `Alert`) + the `cn` helper
(`clsx` + `tailwind-merge`) are only UI chrome — a minimal stand-in is in §6 so
the page builds with **zero** UI deps. Tailwind classes are used for styling; if
the host tool has no Tailwind, the classes are inert (layout still works enough
to drive it) or you re-skin.

**The pdf.js worker** (critical, bundler-specific). `pdfRender.ts` does:
```ts
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url"; // Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
```
The `?url` suffix is a **Vite** feature. For other bundlers:
- **Webpack 5 / Next.js:** `pdfjsLib.GlobalWorkerOptions.workerSrc = new
  URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();`
- **Anything / CDN fallback:** copy `pdf.worker.min.mjs` into your static assets
  and set `workerSrc` to its served path, or point it at a CDN build that
  **matches your `pdfjs-dist` version exactly**.

Module import aliases used across the files (`@/...`): map them to wherever you
place the files. The mapping this app uses:
| alias | meaning |
|---|---|
| `@/lib/pdfRender` | the `pdfRender.ts` file |
| `@/lib/pdfVectors` | the `pdfVectors.ts` file |
| `@/lib/vectorWalls` | the `vectorWalls.ts` file (rename to taste) |
| `@/components/ui/*` | shadcn primitives → your components or the §6 shim |
| `@/lib/utils` | the `cn` helper |
| `@/lib/supabase`, `@/hooks/useAuth`, `@/lib/api/*`, `@/types/db` | **host couplings — removed when decoupling (see §7)** |

## 6. Minimal UI shim (so it builds with no shadcn)

Create `ui.tsx` and point the page's `@/components/ui/*` + `cn` imports at it,
**or** map them to your own design system.

```tsx
// ui.tsx — minimal stand-ins for the shadcn/ui primitives the page uses.
// Replace with your own components for real styling.
import * as React from "react";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }
>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} data-variant={variant} data-size={size}
    className={cn("tm-btn", className)} {...props} />
));
Button.displayName = "Button";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("tm-input", className)} {...props} />
));
Input.displayName = "Input";

export function Label(props: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...props} />;
}

export function Alert(
  props: React.HTMLAttributes<HTMLDivElement> & { variant?: string },
) {
  const { variant, className, ...rest } = props;
  return <div role="alert" data-variant={variant}
    className={cn("tm-alert", className)} {...rest} />;
}
export function AlertDescription(
  props: React.HTMLAttributes<HTMLDivElement>,
) {
  return <div {...props} />;
}
```

(The verbatim shadcn `Button` is included at the bottom for reference if you'd
rather use the real thing — it needs `@radix-ui/react-slot` +
`class-variance-authority` + `clsx` + `tailwind-merge`.)

## 7. Decoupling checklist (turning the app page into `<MeasureFromPdf>`)

The reference `WallMeasurePage.tsx` is wired to this app. To make the props-based
`<MeasureFromPdf>` of §3, change exactly these things — everything else (the
canvas render, pan/zoom, calibration, colour-pick, per-wall-pick logic) stays:

1. **Remove routing.** Delete `useParams`, `useNavigate`, `Link`, `Navigate`
   imports/usage. `projectId`/`pageId` go away; take `pageNumber` from props.
2. **Remove auth.** Delete `useAuth` / `user`. It was only used to stamp
   `userId` on the save — gone with the save.
3. **Replace the PDF-load effect.** The effect that does
   `supabase.from("drawing_pages")…/drawings…/storage.download()` →
   **delete it**; instead seed state from the `pdfBuffer` prop:
   `useEffect(() => { setPdfBuffer(props.pdfBuffer); setPageNumber(props.pageNumber ?? 1); setLoading(false); }, [props.pdfBuffer, props.pageNumber])`.
   (The *vector-extraction* effect that follows stays as-is.)
4. **Replace the backdrop loader.** The effect calling
   `getSignedUrlsForPaths([imagePath])` → use `props.backdropUrl` directly:
   `if (!props.backdropUrl) { setBackdrop(null); return; } const img = new
   Image(); img.crossOrigin = "anonymous"; img.onload = …; img.src =
   props.backdropUrl;`. Drop the `imagePath` state. (If you have no PNG, just
   don't pass `backdropUrl` — the page works vectors-only.)
5. **Replace persistence.** `measureAndSave` currently calls `saveVectorWalls({…})`
   then `navigate(...)`. Replace the `saveVectorWalls` call with
   `props.onMeasured({ walls: measured, mmPerPx, scaleText: scaleText.trim() ||
   null })`; drop the navigate. Likewise `skipAndOpenReview` →
   `props.onSkip?.({ mmPerPx, scaleText: scaleText.trim() || null })`.
   **You do not need `vectorWalls.ts`'s `saveVectorWalls` at all** — it's this
   app's Supabase writer. Keep `extractWallsFromPdfPage`, `measurePickedWalls`,
   `mmPerPxFromScaleRatio`, `VECTOR_SCALE`, and the types.
6. **UI primitives.** Point `@/components/ui/*` + `cn` at the §6 shim or your own
   components. Swap `lucide-react` icons for whatever you have.
7. **`vectorWalls.ts` cleanup.** Delete its `import { supabase }`, the
   `saveVectorWalls` function and `SaveVectorWallsResult`/`rlPairsAvgHeightMm`
   (persistence), and — if you don't use them — `distinctVectorColors` /
   `snapHexToColors` (colour-matching helpers, harmless to keep). Keep the rest.
   `RlPair` (`{ top: number; bottom: number }`) is only referenced by the
   optional `MeasuredWall.rlPairs` field; inline the type or drop the field.

That's the entire surface. The measuring engine (`pdfRender.ts`, `pdfVectors.ts`,
and the extraction half of `vectorWalls.ts`) has **no host coupling** beyond the
pdf.js worker line in §5.

## 8. Tuning knobs (if results look off on a new drawing)

All in `pdfVectors.ts`, all derived from the linework so they usually need no
touching — but if a port mis-groups:
- `autoGapPx` — dash-bridging tolerance (p75 of nearest-neighbour endpoint
  distances × 1.6, clamped 5–80 px). Raise if a dashed wall comes back in pieces.
- `connectPieces`: `JUNCTION_TOL` (2.5 px cluster), `THROUGH_TOL` (52° "passes
  straight through" test at T/+ junctions), `ANGLE_TOL` (52° continuation test).
- `mergeCollinearRuns`: `SECOND_GAP_PX` (`max(gap*4, 60)`), `AXIS_ALIGN_OK`
  (~10° parallel test), `LATERAL_OK_FRAC` (0.2 — perpendicular offset guard that
  stops parallel walls fusing).
- `extractWallsFromPdfPage`: `minRunLengthPx: 500 / mmPerPx` drops sub-0.5 m junk
  runs (arrowheads, height brackets). Per-wall picking uses `minRunLengthPx: 1`.
- `runCentreline`: a run whose OBB `width ≤ max(length*0.08, 8)` collapses to its
  long axis (clean 2-point centreline); otherwise it's traced + corner-simplified.

---

# Source files

Four files, in dependency order. The first three are the engine + extraction;
the fourth is the reference React page (see §7 to decouple). They are pasted
**verbatim** from the working app — including this app's `@/` imports and (in
`vectorWalls.ts` / the page) the Supabase couplings you'll strip per §7.


## `src/lib/pdfRender.ts`

```ts
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const PDF_BASE_DPI = 72;

export type RasterizedPage = {
  pageNumber: number;
  blob: Blob;
  width: number;
  height: number;
};

export type PdfDocument = pdfjsLib.PDFDocumentProxy;

export async function loadPdf(file: File | ArrayBuffer): Promise<PdfDocument> {
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  return pdfjsLib.getDocument({ data }).promise;
}

export async function rasterizePage(
  pdf: PdfDocument,
  pageNumber: number,
  dpi: number = 200,
): Promise<RasterizedPage> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: dpi / PDF_BASE_DPI });
  const width = Math.floor(viewport.width);
  const height = Math.floor(viewport.height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to acquire canvas 2D context.");

  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encode failed."))),
      "image/png",
    );
  });

  // Free canvas memory eagerly — large drawings can run hundreds of MB.
  canvas.width = 0;
  canvas.height = 0;

  return { pageNumber, blob, width, height };
}

```


## `src/lib/pdfVectors.ts`

```ts
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
  /** Ordered centreline points (flat) — the stroked line itself, or the
   *  long axis of the oriented bounding box for a filled / closed shape. */
  pts: number[];
  /** The two endpoints of `pts`. */
  a: [number, number];
  b: [number, number];
  /** Centreline length of this piece, device px. */
  length: number;
  /** True for a filled block or a closed box — measured by its bounding
   *  box, and its direction is reliable however short it is. */
  shape: boolean;
};

/** A path is a closed shape (polygon / box) when its outline returns to
 *  its start — its polyline length is then a perimeter, not a run. */
function isClosedPath(pts: number[]): boolean {
  if (pts.length < 8) return false;
  const dx = pts[0] - pts[pts.length - 2];
  const dy = pts[1] - pts[pts.length - 1];
  return Math.hypot(dx, dy) <= 1.5;
}

function toWallPiece(path: VectorPath): WallPiece {
  // Filled blocks and closed boxes are shapes — their outline length is a
  // perimeter, so measure the long axis of the oriented bounding box. Only
  // an open stroked line is measured along its own polyline.
  const shape = /fill/i.test(path.paintOp) || isClosedPath(path.points);
  if (shape) {
    const obb = pathOBB(path.points);
    const ux = Math.cos(obb.angle);
    const uy = Math.sin(obb.angle);
    const hl = obb.length / 2;
    const a: [number, number] = [obb.cx - ux * hl, obb.cy - uy * hl];
    const b: [number, number] = [obb.cx + ux * hl, obb.cy + uy * hl];
    return {
      path,
      pts: [a[0], a[1], b[0], b[1]],
      a,
      b,
      length: obb.length,
      shape: true,
    };
  }
  const p = path.points;
  const a: [number, number] = [p[0], p[1]];
  const b: [number, number] = [p[p.length - 2], p[p.length - 1]];
  return { path, pts: p, a, b, length: polylineLength(p), shape: false };
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

  // ===== Junction detection =====
  // Cluster all piece endpoints by tight proximity. A cluster where three
  // or more distinct pieces converge is a junction (a T- or +-intersection).
  // At a junction only the pair(s) whose headings into the cluster are
  // roughly opposite — i.e., one wall passing straight through — are
  // allowed to chain. The cross arms branch off as their own runs instead
  // of fusing into one giant tangled run. A two-piece cluster is just a
  // corner of one wall and is left untouched, so L-walls stay intact.
  const JUNCTION_TOL = 2.5;
  const THROUGH_TOL = Math.cos((52 * Math.PI) / 180);
  const numEp = n * 2;
  const epX: number[] = new Array(numEp);
  const epY: number[] = new Array(numEp);
  for (let i = 0; i < n; i++) {
    epX[i * 2] = pieces[i].a[0];
    epY[i * 2] = pieces[i].a[1];
    epX[i * 2 + 1] = pieces[i].b[0];
    epY[i * 2 + 1] = pieces[i].b[1];
  }
  const epParent = Array.from({ length: numEp }, (_, i) => i);
  function epFind(i: number): number {
    let r = i;
    while (epParent[r] !== r) r = epParent[r];
    while (epParent[i] !== r) {
      const nx = epParent[i];
      epParent[i] = r;
      i = nx;
    }
    return r;
  }
  const tol2 = JUNCTION_TOL * JUNCTION_TOL;
  for (let i = 0; i < numEp; i++) {
    for (let j = i + 1; j < numEp; j++) {
      const dx = epX[i] - epX[j];
      const dy = epY[i] - epY[j];
      if (dx * dx + dy * dy <= tol2) {
        epParent[epFind(i)] = epFind(j);
      }
    }
  }
  const clusterEps = new Map<number, number[]>();
  for (let i = 0; i < numEp; i++) {
    const r = epFind(i);
    const arr = clusterEps.get(r);
    if (arr) arr.push(i);
    else clusterEps.set(r, [i]);
  }
  const epJunction = new Map<number, number>();
  const allowedAt = new Map<number, Set<string>>();
  for (const [root, epIdxs] of clusterEps) {
    const pieceSet = new Set(epIdxs.map((ep) => ep >> 1));
    if (pieceSet.size < 3) continue;
    for (const ep of epIdxs) epJunction.set(ep, root);
    const headings: { pi: number; dx: number; dy: number }[] = [];
    for (const pi of pieceSet) {
      const endIdx = epFind(pi * 2) === root ? 0 : 1;
      const h = heading(pieces[pi], endIdx, true);
      headings.push({ pi, dx: h[0], dy: h[1] });
    }
    const allowed = new Set<string>();
    for (let i = 0; i < headings.length; i++) {
      for (let j = i + 1; j < headings.length; j++) {
        const dot =
          headings[i].dx * headings[j].dx + headings[i].dy * headings[j].dy;
        if (dot <= -THROUGH_TOL) {
          const lo = Math.min(headings[i].pi, headings[j].pi);
          const hi = Math.max(headings[i].pi, headings[j].pi);
          allowed.add(`${lo},${hi}`);
        }
      }
    }
    if (allowed.size > 0) allowedAt.set(root, allowed);
  }

  // ===== Pairwise union-find with junction guard =====
  const WELD = 2.5;
  const ANGLE_TOL = Math.cos((52 * Math.PI) / 180);
  const shortLimit = gapPx * 1.5;
  // A piece has a usable direction if it is a shape (its bounding box gives
  // the axis) or a stroked line long enough not to be a stray dot.
  const reliable = pieces.map((p) => p.shape || p.length >= shortLimit);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (find(i) === find(j)) continue;
      const link = bestEndpointLink(pieces[i], pieces[j]);
      if (link.d > gapPx) continue;

      // Junction guard — if either joining endpoint sits in a junction
      // cluster, only let this pair chain when it is one of the through-
      // pairs precomputed for that junction.
      const iEp = i * 2 + link.iEnd;
      const jEp = j * 2 + link.jEnd;
      const junc = epJunction.get(iEp) ?? epJunction.get(jEp);
      if (junc !== undefined) {
        const allowed = allowedAt.get(junc);
        if (!allowed) continue;
        const lo = Math.min(i, j);
        const hi = Math.max(i, j);
        if (!allowed.has(`${lo},${hi}`)) continue;
      }

      let join = link.d <= WELD;
      if (!join) {
        if (reliable[i] && reliable[j]) {
          // Both pieces have a direction — only chain them when one
          // continues the other's line, so a wall that merely crosses or
          // runs parallel is never merged in.
          const di = heading(pieces[i], link.iEnd, true);
          const dj = heading(pieces[j], link.jEnd, false);
          join = di[0] * dj[0] + di[1] * dj[1] >= ANGLE_TOL;
        } else {
          // A stray dot has no usable direction — chain it on proximity
          // alone; it sits between two dashes of its own wall.
          join = true;
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

/**
 * Centreline of a wall run. A straight wall — its bounding box is long and
 * thin — collapses to the box's long axis: two clean points and an exact
 * length, with no stray vertices from per-dash jitter. A wall that
 * genuinely bends keeps a traced, corner-simplified centreline.
 */
function runCentreline(pieces: WallPiece[]): number[] {
  const all: number[] = [];
  for (const p of pieces) {
    for (let k = 0; k + 1 < p.pts.length; k += 2) {
      all.push(p.pts[k], p.pts[k + 1]);
    }
  }
  const obb = pathOBB(all);
  if (obb.width <= Math.max(obb.length * 0.08, 8)) {
    const ux = Math.cos(obb.angle);
    const uy = Math.sin(obb.angle);
    const hl = obb.length / 2;
    return [
      obb.cx - ux * hl,
      obb.cy - uy * hl,
      obb.cx + ux * hl,
      obb.cy + uy * hl,
    ];
  }
  return simplifyFlat(traceRun(pieces), 1.5);
}

/**
 * Second-pass merge — re-fuse runs that the first-pass chainer split
 * apart because the gap between pieces exceeded the per-piece gap
 * tolerance, or because a junction guard refused to chain through.
 *
 * Operates on whole runs (not pieces), so each candidate has a reliable
 * long-axis direction from its oriented bounding box. A pair fuses when:
 *   1. Their long axes are nearly parallel (≤ ~10°),
 *   2. Their nearest endpoints sit close enough together, AND
 *   3. That endpoint pair really lies along the run's own axis — i.e.
 *      the perpendicular offset from one run's centreline to the
 *      other's endpoint is small. This kills any chance of merging
 *      parallel walls that happen to lie near each other.
 */
function mergeCollinearRuns(
  groups: number[][],
  pieces: WallPiece[],
  basePieceGapPx: number,
): number[][] {
  if (groups.length < 2) return groups;

  type RunMeta = {
    cx: number;
    cy: number;
    ux: number;
    uy: number;
    length: number;
    width: number;
    a: [number, number];
    b: [number, number];
  };

  const meta: RunMeta[] = groups.map((g) => {
    const all: number[] = [];
    for (const i of g) {
      const pts = pieces[i].pts;
      for (let k = 0; k + 1 < pts.length; k += 2) {
        all.push(pts[k], pts[k + 1]);
      }
    }
    const obb = pathOBB(all);
    const ux = Math.cos(obb.angle);
    const uy = Math.sin(obb.angle);
    const hl = obb.length / 2;
    return {
      cx: obb.cx,
      cy: obb.cy,
      ux,
      uy,
      length: obb.length,
      width: obb.width,
      a: [obb.cx - ux * hl, obb.cy - uy * hl],
      b: [obb.cx + ux * hl, obb.cy + uy * hl],
    };
  });

  // The second-pass gap tolerance is much more generous than the first
  // pass — we're bridging X markers, SS labels and RL ticks that sit on
  // the wall line. Capped so wholly separate walls never join.
  const SECOND_GAP_PX = Math.max(basePieceGapPx * 4, 60);
  // ~10° angular tolerance between the two long axes (orientation only —
  // sign doesn't matter, so we take |dot|).
  const AXIS_ALIGN_OK = Math.cos((10 * Math.PI) / 180);
  // Perpendicular offset from one run's centreline to the other's joining
  // endpoint, as a fraction of the joining gap.
  const LATERAL_OK_FRAC = 0.2;
  // Hard floor on lateral tolerance so very-short gaps still chain.
  const LATERAL_MIN_PX = 3;

  const parent = groups.map((_, i) => i);
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

  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      if (find(i) === find(j)) continue;
      const A = meta[i];
      const B = meta[j];

      // Axes parallel? Use |dot| because axis direction is unsigned.
      const axisAlign = Math.abs(A.ux * B.ux + A.uy * B.uy);
      if (axisAlign < AXIS_ALIGN_OK) continue;

      // Closest endpoint pair across the two runs.
      const candidates: [[number, number], [number, number]][] = [
        [A.a, B.a],
        [A.a, B.b],
        [A.b, B.a],
        [A.b, B.b],
      ];
      let bestD = Infinity;
      let bestPair: [[number, number], [number, number]] | null = null;
      for (const [pa, pb] of candidates) {
        const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
        if (d < bestD) {
          bestD = d;
          bestPair = [pa, pb];
        }
      }
      if (!bestPair || bestD > SECOND_GAP_PX) continue;

      // Lateral check: how far off A's axis does B's joining endpoint
      // sit, and vice versa? The perpendicular component must be a small
      // fraction of the gap, or the pair is parallel-but-offset rather
      // than end-to-end.
      const [pa, pb] = bestPair;
      const tol = Math.max(LATERAL_MIN_PX, bestD * LATERAL_OK_FRAC);
      const perpAB = Math.abs((pb[0] - A.cx) * -A.uy + (pb[1] - A.cy) * A.ux);
      const perpBA = Math.abs((pa[0] - B.cx) * -B.uy + (pa[1] - B.cy) * B.ux);
      if (perpAB > tol || perpBA > tol) continue;

      parent[find(i)] = find(j);
    }
  }

  const merged = new Map<number, number[]>();
  for (let i = 0; i < groups.length; i++) {
    const r = find(i);
    const arr = merged.get(r);
    if (arr) arr.push(...groups[i]);
    else merged.set(r, [...groups[i]]);
  }
  return [...merged.values()];
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
    // First pass: chain pieces by shared endpoints + junction-aware
    // through-pair tests. Tight tolerance — bridges dashes, never glues
    // separate walls together.
    const firstPass = connectPieces(pieces, gapPx);
    // Second pass: re-fuse runs that lie along the same line. Surveyors'
    // X markers, SS labels and RL ticks sit on top of the wall and often
    // break it into many short same-colour runs after the first pass;
    // this stage stitches them back into one wall.
    const merged = mergeCollinearRuns(firstPass, pieces, gapPx);
    for (const idxs of merged) {
      const runPieces = idxs.map((i) => pieces[i]);
      const polyline = runCentreline(runPieces);
      const lengthPx = polylineLength(polyline);
      if (lengthPx < minRun) continue;
      runs.push({
        color,
        paths: runPieces.map((p) => p.path),
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

/**
 * Same idea as `nearestPath` but returns the index in `paths` of the
 * hit, so callers can use it as a stable key (the click-walls-by-hand
 * picker needs to identify the exact path the user clicked, not just
 * one with the same colour).
 */
export function nearestPathIndex(
  paths: VectorPath[],
  x: number,
  y: number,
  maxDistPx: number,
): number {
  let bestIdx = -1;
  let bestD = maxDistPx;
  for (let i = 0; i < paths.length; i++) {
    const pts = paths[i].points;
    for (let k = 0; k + 3 < pts.length; k += 2) {
      const d = pointSegDist(x, y, pts[k], pts[k + 1], pts[k + 2], pts[k + 3]);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
  }
  return bestIdx;
}

```


## `src/lib/vectorWalls.ts`

```ts
import { supabase } from "@/lib/supabase";
import { loadPdf } from "@/lib/pdfRender";
import {
  extractPageVectors,
  measureWalls,
  type VectorPath,
} from "@/lib/pdfVectors";
import type { RlPair } from "@/types/db";

/**
 * Stage I of the vector pipeline: turn a PDF page's vector linework into
 * measured wall runs, and persist them as `wall_segments`.
 *
 * Vectors are extracted at the same DPI the page PNG was rasterised at, so
 * every coordinate is already in the review screen's pixel space — the
 * DrawingViewer overlay renders them with no transform.
 */

const RASTER_DPI = 200;
/** Vector extraction scale so coords match the stored 200-DPI PNG. */
export const VECTOR_SCALE = RASTER_DPI / 72;

/**
 * mm of real-world distance per raster pixel for a drawing plotted at
 * 1:ratio. The page is rasterized at RASTER_DPI of the plotted sheet, so
 * one pixel spans (25.4 / RASTER_DPI) mm of paper × the scale ratio.
 */
export function mmPerPxFromScaleRatio(ratio: number): number {
  return (25.4 / RASTER_DPI) * ratio;
}

export type WallColorSpec = {
  /** Lowercase hex, e.g. "#dd6e00". */
  color: string;
  /** Human label for this colour, e.g. "Type 1". */
  typeLabel: string;
};

export type MeasuredWall = {
  color: string;
  typeLabel: string;
  /** Centreline as [x,y] pixel pairs — [[x0,y0],[x1,y1]] in raster space. */
  polyline: [number, number][];
  lengthMm: number;
  /** Lot the wall sits on, fused from the AI lot labels — Stage II. */
  lotName?: string | null;
  /** RL pairs fused from the AI-read RLs — one per wall end. Stage II. */
  rlPairs?: RlPair[];
};

export type ExtractWallsOptions = {
  wallColors: WallColorSpec[];
  /** Millimetres of real-world distance per device pixel (at VECTOR_SCALE). */
  mmPerPx: number;
};

/**
 * Measure walls from a specific set of paths the user has hand-picked
 * on the canvas. Used by the "Pick walls one by one" mode on mono-
 * colour drawings where the colour filter can't distinguish walls
 * from contours / dimensions / boundaries.
 *
 * Each picked path's colour is treated as its own wall type; the
 * junction-aware grouping inside measureWalls still kicks in, so a
 * dashed wall the user picked one piece of (with run-expansion) comes
 * back as a single measured run.
 */
export function measurePickedWalls(opts: {
  vectors: import("@/lib/pdfVectors").PageVectors;
  pickedIndices: Set<number>;
  mmPerPx: number;
  typeLabel?: string;
}): MeasuredWall[] {
  const { vectors, pickedIndices, mmPerPx } = opts;
  if (pickedIndices.size === 0) return [];
  const typeLabel = opts.typeLabel ?? "Manual selection";

  const subset = vectors.paths.filter((_, i) => pickedIndices.has(i));
  const colors = new Set(subset.map((p) => p.color.toLowerCase()));
  // Lower min-length here than the colour-driven extractor because the
  // user has explicitly chosen each path — they know it's a wall, no
  // need to drop short ones as likely-noise.
  const runs = measureWalls(subset, colors, { minRunLengthPx: 1 });

  return runs.map((run) => ({
    color: run.color.toLowerCase(),
    typeLabel,
    polyline: flatToPairs(run.polyline),
    lengthMm: run.lengthPx * mmPerPx,
  }));
}

/** Extract + measure retaining walls from one PDF page's vector geometry. */
export async function extractWallsFromPdfPage(
  file: File | ArrayBuffer,
  pageNumber: number,
  opts: ExtractWallsOptions,
): Promise<MeasuredWall[]> {
  const data =
    file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const pdf = await loadPdf(data);
  const vectors = await extractPageVectors(pdf, pageNumber, VECTOR_SCALE);

  const { mmPerPx } = opts;
  const typeByColor = new Map(
    opts.wallColors.map((w) => [w.color.toLowerCase(), w.typeLabel]),
  );
  const colors = new Set(typeByColor.keys());

  // Drop runs shorter than half a metre — real retaining walls are always
  // much longer, and small same-colour features (orange height brackets,
  // arrowheads near RLs) produce dot-like junk runs otherwise.
  const runs = measureWalls(vectors.paths, colors, {
    minRunLengthPx: 500 / mmPerPx,
  });

  return runs.map((run) => ({
    color: run.color.toLowerCase(),
    typeLabel: typeByColor.get(run.color.toLowerCase()) ?? "Wall",
    polyline: flatToPairs(run.polyline),
    lengthMm: run.lengthPx * mmPerPx,
  }));
}

/** Flat [x0,y0,x1,y1,...] → [x,y] pairs. */
function flatToPairs(flat: number[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let k = 0; k + 1 < flat.length; k += 2) {
    pairs.push([flat[k], flat[k + 1]]);
  }
  return pairs;
}

export type SaveVectorWallsResult = {
  extractionId: string;
  wallCount: number;
};

/** Average wall height (mm) from RL pairs — null when there are none. */
function rlPairsAvgHeightMm(pairs: RlPair[] | undefined): number | null {
  if (!pairs || pairs.length === 0) return null;
  const sum = pairs.reduce((s, p) => s + (p.top - p.bottom), 0);
  return Math.round((sum / pairs.length) * 1000);
}

/**
 * Persist measured walls for a page: replaces any existing extraction with
 * a fresh `extractions` row + one `wall_segments` row per wall. Lengths come
 * from the vector geometry; heights/labels are left for the user (or the
 * Stage II AI pass) to fill in.
 */
export async function saveVectorWalls(opts: {
  drawingPageId: string;
  userId: string;
  walls: MeasuredWall[];
  scaleText: string | null;
  mmPerPx: number;
}): Promise<SaveVectorWallsResult> {
  const { drawingPageId, userId, walls, scaleText, mmPerPx } = opts;

  const warnings = [
    "Lengths measured from PDF vector geometry. Grab or enter Top RL and Bottom RL for each wall to set its height.",
  ];

  // Walk drawing_page -> drawing to find the owning project. New
  // wall_segments rows carry `project_id` so the project-wide Take Off
  // query picks them up alongside any manually-entered walls.
  const { data: pageRow, error: pageErr } = await supabase
    .from("drawing_pages")
    .select("drawing_id, drawings!inner(project_id)")
    .eq("id", drawingPageId)
    .maybeSingle();
  if (pageErr || !pageRow) {
    throw new Error(pageErr?.message ?? "Owning drawing not found.");
  }
  const projectId =
    (pageRow as { drawings?: { project_id?: string | null } }).drawings
      ?.project_id ?? null;

  // Clear any prior extraction (cascade removes its wall_segments / dims).
  const { error: delErr } = await supabase
    .from("extractions")
    .delete()
    .eq("drawing_page_id", drawingPageId);
  if (delErr) throw delErr;

  const { data: extraction, error: extErr } = await supabase
    .from("extractions")
    .insert({
      drawing_page_id: drawingPageId,
      user_id: userId,
      raw_response: {
        source: "pdf-vectors",
        mm_per_px: mmPerPx,
        wall_count: walls.length,
      },
      scale_text: scaleText,
      units: "mm",
      view_type: "plan",
      overall_confidence: 0.9,
      warnings,
    })
    .select()
    .single();
  if (extErr || !extraction) {
    throw new Error(extErr?.message ?? "Failed to create extraction.");
  }

  // Number walls per type label: "Type 1 wall 1", "Type 1 wall 2", …
  const perType = new Map<string, number>();
  const segmentRows = walls.map((wall, i) => {
    const n = (perType.get(wall.typeLabel) ?? 0) + 1;
    perType.set(wall.typeLabel, n);
    return {
      extraction_id: extraction.id,
      project_id: projectId,
      user_id: userId,
      source_id: `vec_${i + 1}`,
      label: wall.lotName
        ? `Lot ${wall.lotName} — ${wall.typeLabel}`
        : `${wall.typeLabel} wall ${n}`,
      length_mm: Math.round(wall.lengthMm),
      height_mm: rlPairsAvgHeightMm(wall.rlPairs),
      thickness_mm: null,
      rl_pairs: wall.rlPairs ?? [],
      polyline: wall.polyline,
      label_bbox: null,
      source_dimension_ids: [],
      confidence: 0.9,
      notes: `${wall.typeLabel} — length measured from PDF vector geometry.`,
      user_added: false,
      // Map the AI-read lot label onto the BE Landscapes `lot` column
      // so it shows up immediately in the Take Off table. Wall type /
      // design / position stay null — they take the engine's defaults
      // until the user picks each per wall.
      lot: wall.lotName ?? null,
    };
  });

  if (segmentRows.length > 0) {
    const { error: segErr } = await supabase
      .from("wall_segments")
      .insert(segmentRows);
    if (segErr) throw segErr;
  }

  await supabase
    .from("drawing_pages")
    .update({ extraction_status: "extracted", extraction_error: null })
    .eq("id", drawingPageId);

  return { extractionId: extraction.id, wallCount: walls.length };
}

/* ============================================================
 * Stage II fusion — attach AI-read semantics to measured walls.
 * ============================================================ */

/** Distinct stroke colours present in a page's vector linework (lowercased). */
export function distinctVectorColors(paths: VectorPath[]): string[] {
  const seen = new Set<string>();
  for (const p of paths) seen.add(p.color.toLowerCase());
  return [...seen];
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().toLowerCase().match(/^#?([0-9a-f]{6})$/);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Snap an AI-estimated wall colour to the nearest colour that actually
 * appears in the PDF's vector linework, so the measurement's exact-colour
 * filter has a real colour to match. Returns null if nothing is close.
 */
export function snapHexToColors(
  hex: string,
  palette: string[],
): string | null {
  const target = hexToRgb(hex);
  if (!target) return null;
  let best: string | null = null;
  let bestD = Infinity;
  for (const c of palette) {
    const rgb = hexToRgb(c);
    if (!rgb) continue;
    const d =
      (rgb[0] - target[0]) ** 2 +
      (rgb[1] - target[1]) ** 2 +
      (rgb[2] - target[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  // Reject a "nearest" that is not really the same colour (~80 per channel).
  return best && bestD <= 3 * 80 * 80 ? best : null;
}


```


## `src/pages/WallMeasurePage.tsx`

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  MousePointerClick,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/lib/supabase";
import { getSignedUrlsForPaths } from "@/lib/api/drawings";
import { useAuth } from "@/hooks/useAuth";
import {
  extractPageVectors,
  nearestPath,
  nearestPathIndex,
  nearestVertex,
  type PageVectors,
} from "@/lib/pdfVectors";
import { loadPdf } from "@/lib/pdfRender";
import {
  extractWallsFromPdfPage,
  measurePickedWalls,
  mmPerPxFromScaleRatio,
  saveVectorWalls,
  VECTOR_SCALE,
  type WallColorSpec,
} from "@/lib/vectorWalls";
import { parseScaleRatio } from "@/lib/api/review";

/**
 * Stage I wall-measurement workflow for a drawing page. Loads the page's
 * PDF, renders its vector linework, lets the user calibrate the scale by
 * clicking a known distance, specify the wall colours, then measures and
 * saves the result as wall_segments.
 */
export function WallMeasurePage() {
  const { projectId, pageId } = useParams<{
    projectId: string;
    pageId: string;
  }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [vectors, setVectors] = useState<PageVectors | null>(null);
  const [displayScale, setDisplayScale] = useState(1);
  // 1.0 = "fit full sheet to viewport", anything > 1 enlarges the canvas so
  // the user can pan around it via the scroll container.
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Live mirror of zoom + a pending zoom anchor, used by the native
  // (non-passive) wheel handler to zoom toward the cursor. React's onWheel
  // is passive, so preventDefault there is a no-op — hence the manual
  // listener below.
  const zoomRef = useRef(1);
  const zoomAnchorRef = useRef<{
    px: number;
    py: number;
    prevLeft: number;
    prevTop: number;
    f: number;
  } | null>(null);
  // Tracked so the base scale (fit-the-full-sheet-to-container) recomputes
  // when the container resizes — the canvas would otherwise stay sized for
  // the first paint.
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Faint rasterised-sheet backdrop behind the vectors, so the user can read
  // lot labels / streets / legend (none of which survive vector extraction)
  // while picking walls. Same 200-DPI coordinate space as the vectors, so it
  // overlays 1:1.
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [backdrop, setBackdrop] = useState<HTMLImageElement | null>(null);
  const [showBackdrop, setShowBackdrop] = useState(true);

  // Click-and-drag pan on the canvas wrapper. The drag state lives in a
  // ref so the click handler sees the final "did the user actually
  // drag?" value without us having to bounce through a state update.
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<
    | {
        startX: number;
        startY: number;
        scrollLeft: number;
        scrollTop: number;
        moved: boolean;
      }
    | null
  >(null);

  const [calibPoints, setCalibPoints] = useState<[number, number][]>([]);
  const [knownDist, setKnownDist] = useState("");
  const [scaleRatio, setScaleRatio] = useState("");
  const [mmPerPx, setMmPerPx] = useState<number | null>(null);
  const [snap, setSnap] = useState(true);
  // Click-two-points distance calibration is the default (most accurate).
  // The scale-ratio input is a fallback, revealed by `showRatio`.
  const [showRatio, setShowRatio] = useState(false);
  // Explicit "Set points" mode — when on, clicking the drawing places the
  // two calibration points (crosshair cursor). Keeps stray clicks from
  // dropping points when the user just wants to pan / look around.
  const [settingPoints, setSettingPoints] = useState(false);
  // Live cursor position (vector coords) while placing the second
  // calibration point — drives the rubber-band preview line.
  const [calibCursor, setCalibCursor] = useState<[number, number] | null>(null);

  const [wallTypes, setWallTypes] = useState<WallColorSpec[]>([]);
  const [picking, setPicking] = useState(false);
  const [scaleText, setScaleText] = useState("");
  const [saving, setSaving] = useState(false);

  // "Pick walls one by one" mode — needed on mono-colour drawings
  // where the colour-pick workflow can't tell walls apart from contours.
  // pickingPaths: is the mode active? pickedPathIndices: the chosen paths.
  const [pickingPaths, setPickingPaths] = useState(false);
  const [pickedPathIndices, setPickedPathIndices] = useState<Set<number>>(
    () => new Set(),
  );

  /**
   * Pre-computed run-groups: for every path index, which connected run
   * does it belong to? A click in pickingPaths mode looks up the run
   * of the nearest path and picks every path in that run together,
   * so a dashed wall the user clicks one dash of comes through as a
   * single picked wall.
   *
   * Connectivity is per-colour endpoint clustering (within ~5 px) —
   * same family used by the auto extractor. Quadratic in path count
   * per colour, which is fine because the same-colour subset on a
   * typical drawing is small.
   */
  const componentOfPath = useMemo<Map<number, number>>(() => {
    const out = new Map<number, number>();
    if (!vectors) return out;
    const byColor = new Map<string, number[]>();
    vectors.paths.forEach((p, i) => {
      if (p.points.length < 4) return;
      const c = p.color.toLowerCase();
      const arr = byColor.get(c) ?? [];
      arr.push(i);
      byColor.set(c, arr);
    });
    const TOL_SQ = 6 * 6;
    let nextKey = 1;
    for (const [, indices] of byColor) {
      const parent = indices.map((_, k) => k);
      const find = (k: number): number => {
        let r = k;
        while (parent[r] !== r) r = parent[r];
        while (parent[k] !== r) {
          const nx = parent[k];
          parent[k] = r;
          k = nx;
        }
        return r;
      };
      // Cache endpoints once.
      const ends: { ax: number; ay: number; bx: number; by: number }[] =
        indices.map((idx) => {
          const pts = vectors.paths[idx].points;
          return {
            ax: pts[0],
            ay: pts[1],
            bx: pts[pts.length - 2],
            by: pts[pts.length - 1],
          };
        });
      for (let a = 0; a < ends.length; a++) {
        for (let b = a + 1; b < ends.length; b++) {
          const ea = ends[a];
          const eb = ends[b];
          const d1 =
            (ea.ax - eb.ax) * (ea.ax - eb.ax) +
            (ea.ay - eb.ay) * (ea.ay - eb.ay);
          if (d1 <= TOL_SQ) {
            parent[find(a)] = find(b);
            continue;
          }
          const d2 =
            (ea.ax - eb.bx) * (ea.ax - eb.bx) +
            (ea.ay - eb.by) * (ea.ay - eb.by);
          if (d2 <= TOL_SQ) {
            parent[find(a)] = find(b);
            continue;
          }
          const d3 =
            (ea.bx - eb.ax) * (ea.bx - eb.ax) +
            (ea.by - eb.ay) * (ea.by - eb.ay);
          if (d3 <= TOL_SQ) {
            parent[find(a)] = find(b);
            continue;
          }
          const d4 =
            (ea.bx - eb.bx) * (ea.bx - eb.bx) +
            (ea.by - eb.by) * (ea.by - eb.by);
          if (d4 <= TOL_SQ) {
            parent[find(a)] = find(b);
          }
        }
      }
      const rootMap = new Map<number, number>();
      for (let k = 0; k < indices.length; k++) {
        const r = find(k);
        let key = rootMap.get(r);
        if (key === undefined) {
          key = nextKey++;
          rootMap.set(r, key);
        }
        out.set(indices[k], key);
      }
    }
    return out;
  }, [vectors]);

  // Distinct stroke colours present on the page, most common first — the
  // palette the user picks wall colours from.
  const palette = useMemo(() => {
    if (!vectors) return [] as { color: string; count: number }[];
    const counts = new Map<string, number>();
    for (const p of vectors.paths) {
      const c = p.color.toLowerCase();
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([c]) => c !== "#ffffff")
      .map(([color, count]) => ({ color, count }))
      .sort((a, b) => b.count - a.count);
  }, [vectors]);

  function addWallColor(color: string) {
    setWallTypes((prev) =>
      prev.some((w) => w.color === color)
        ? prev
        : [...prev, { color, typeLabel: `Wall type ${prev.length + 1}` }],
    );
  }

  function toggleWallColor(color: string) {
    setWallTypes((prev) =>
      prev.some((w) => w.color === color)
        ? prev.filter((w) => w.color !== color)
        : [...prev, { color, typeLabel: `Wall type ${prev.length + 1}` }],
    );
  }

  /**
   * Toggle a path's selection in pickingPaths mode. By default the
   * whole connected run (same colour, endpoint-clustered) is added or
   * removed in one go — that's what the user almost always wants on a
   * dashed wall. `singleOnly` (Alt / Shift held) limits it to just the
   * one clicked path, for the rare case where the auto-grouping has
   * picked up a stray neighbour.
   */
  function togglePathPick(idx: number, singleOnly: boolean) {
    setPickedPathIndices((prev) => {
      const next = new Set(prev);
      const indicesToToggle: number[] = [];
      if (singleOnly) {
        indicesToToggle.push(idx);
      } else {
        const comp = componentOfPath.get(idx);
        if (comp === undefined) {
          indicesToToggle.push(idx);
        } else {
          for (const [pathIdx, c] of componentOfPath) {
            if (c === comp) indicesToToggle.push(pathIdx);
          }
        }
      }
      // If every one of these is already picked, unpick them; else pick.
      const allPicked = indicesToToggle.every((i) => next.has(i));
      if (allPicked) {
        for (const i of indicesToToggle) next.delete(i);
      } else {
        for (const i of indicesToToggle) next.add(i);
      }
      return next;
    });
  }

  // Load the page's PDF from storage.
  useEffect(() => {
    if (!pageId) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const { data: page, error: pageErr } = await supabase
          .from("drawing_pages")
          .select("page_number, drawing_id, image_path")
          .eq("id", pageId)
          .single();
        if (pageErr || !page) throw new Error(pageErr?.message ?? "Page not found.");
        if (active) setImagePath(page.image_path ?? null);

        const { data: drawing, error: drawErr } = await supabase
          .from("drawings")
          .select("file_path")
          .eq("id", page.drawing_id)
          .single();
        if (drawErr || !drawing) {
          throw new Error(drawErr?.message ?? "Drawing not found.");
        }

        const { data: blob, error: dlErr } = await supabase.storage
          .from("drawings")
          .download(drawing.file_path);
        if (dlErr || !blob) {
          throw new Error(dlErr?.message ?? "Could not load the PDF.");
        }
        const buf = await blob.arrayBuffer();
        if (!active) return;
        setPdfBuffer(buf);
        setPageNumber(page.page_number);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [pageId]);

  // Extract the page's vectors once the PDF is loaded.
  useEffect(() => {
    if (!pdfBuffer) return;
    let active = true;
    (async () => {
      try {
        const pdf = await loadPdf(pdfBuffer.slice(0));
        const v = await extractPageVectors(pdf, pageNumber, VECTOR_SCALE);
        if (!active) return;
        setVectors(v);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Render failed.");
        }
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfBuffer, pageNumber]);

  // Load the rasterised page PNG for the faint backdrop. Same 200-DPI space
  // as the vectors, so it overlays without any coordinate transform.
  useEffect(() => {
    if (!imagePath) {
      setBackdrop(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        const urls = await getSignedUrlsForPaths([imagePath]);
        const url = urls[imagePath];
        if (!url || !active) return;
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (active) setBackdrop(img);
        };
        img.onerror = () => {
          if (active) setBackdrop(null);
        };
        img.src = url;
      } catch {
        // Non-fatal — the page just shows vectors only.
        if (active) setBackdrop(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [imagePath]);

  // Track the scroll container's size so the base "fit full sheet" scale
  // recomputes on resize (otherwise the canvas stays sized for first paint).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    });
    obs.observe(el);
    setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    return () => obs.disconnect();
  }, [vectors]);

  // Keep the zoom mirror in sync for the native wheel handler.
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Native, non-passive wheel-to-zoom (toward the cursor). React's onWheel
  // is passive so it can't preventDefault the page scroll; this can.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !vectors) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const z = zoomRef.current;
      const delta = e.deltaY > 0 ? 1 / 1.15 : 1.15;
      const nz = Math.max(0.25, Math.min(8, +(z * delta).toFixed(3)));
      if (nz === z) return;
      zoomAnchorRef.current = {
        px,
        py,
        prevLeft: el.scrollLeft,
        prevTop: el.scrollTop,
        f: nz / z,
      };
      setZoom(nz);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [vectors]);

  // Draw the linework once the canvas has mounted (i.e. vectors are ready).
  useEffect(() => {
    if (!vectors) return;
    const highlight = new Set(wallTypes.map((w) => w.color));
    setDisplayScale(
      redraw(
        vectors,
        calibPoints,
        highlight,
        picking,
        zoom,
        pickedPathIndices,
        pickingPaths,
        showBackdrop ? backdrop : null,
        calibCursor,
      ),
    );
    // After a wheel-zoom resized the canvas, shift the scroll so the point
    // under the cursor stays put (zoom toward cursor).
    const anchor = zoomAnchorRef.current;
    if (anchor) {
      const el = scrollRef.current;
      if (el) {
        el.scrollLeft = (anchor.prevLeft + anchor.px) * anchor.f - anchor.px;
        el.scrollTop = (anchor.prevTop + anchor.py) * anchor.f - anchor.py;
      }
      zoomAnchorRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    vectors,
    calibPoints,
    wallTypes,
    picking,
    zoom,
    pickedPathIndices,
    pickingPaths,
    backdrop,
    showBackdrop,
    containerSize,
    calibCursor,
  ]);

  function redraw(
    v: PageVectors,
    points: [number, number][],
    highlight: Set<string>,
    picking: boolean,
    zoomFactor: number,
    pickedIndices: Set<number>,
    pickingPaths: boolean,
    backdropImg: HTMLImageElement | null,
    cursor: [number, number] | null,
  ): number {
    const canvas = canvasRef.current;
    if (!canvas) return 1;
    // Render the full sheet (the faint backdrop fills the paper margins).
    const renderW = v.width;
    const renderH = v.height;
    // Base fit: scale the whole sheet to fit the scroll container so it's
    // fully visible at zoom 1, matching the Review viewer. Falls back to a
    // ~1400 px fit before the container has laid out. Zoom multiplies on
    // top; the canvas bitmap itself grows so lines stay crisp at any zoom.
    const cw = scrollRef.current?.clientWidth ?? 0;
    const ch = scrollRef.current?.clientHeight ?? 0;
    const baseDs =
      cw > 0 && ch > 0
        ? Math.min(cw / renderW, ch / renderH)
        : Math.min(1, 1400 / renderW);
    const ds = baseDs * zoomFactor;
    canvas.width = Math.round(renderW * ds);
    canvas.height = Math.round(renderH * ds);
    const ctx = canvas.getContext("2d");
    if (!ctx) return ds;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Faint rasterised sheet under the vectors — coords are 1:1 so the full
    // PNG scales straight onto the full canvas.
    if (backdropImg) {
      ctx.globalAlpha = 0.45;
      ctx.drawImage(backdropImg, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const drawPath = (
      path: PageVectors["paths"][number],
      color: string,
      width: number,
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      const p = path.points;
      ctx.moveTo(p[0] * ds, p[1] * ds);
      for (let k = 2; k + 1 < p.length; k += 2) {
        ctx.lineTo(p[k] * ds, p[k + 1] * ds);
      }
      ctx.stroke();
    };

    // Picked wall colours OR individually picked paths draw bold. While
    // either picker is active the rest keeps its true colour so every
    // wall is visible to aim at; once both pickers are off, the rest
    // fades so the chosen walls can be verified at a glance.
    const hasHiColour = highlight.size > 0;
    const hasHiPaths = pickedIndices.size > 0;
    const hasHi = hasHiColour || hasHiPaths;
    const fade = hasHi && !picking && !pickingPaths;
    const isHi = (path: PageVectors["paths"][number], idx: number) =>
      (hasHiColour && highlight.has(path.color.toLowerCase())) ||
      (hasHiPaths && pickedIndices.has(idx));
    for (let i = 0; i < v.paths.length; i++) {
      const path = v.paths[i];
      if (isHi(path, i)) continue;
      drawPath(path, fade ? "#e6e6e6" : path.color, 0.7);
    }
    if (hasHi) {
      for (let i = 0; i < v.paths.length; i++) {
        const path = v.paths[i];
        if (isHi(path, i)) drawPath(path, path.color, 2.5);
      }
    }
    // Calibration markers: a dashed line between the two points, with a
    // white-haloed violet vertical tick at each so it lines up precisely
    // against a scale-bar mark.
    if (points.length === 2) {
      ctx.strokeStyle = "#7c3aed";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(points[0][0] * ds, points[0][1] * ds);
      ctx.lineTo(points[1][0] * ds, points[1][1] * ds);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Rubber-band preview: after the first point is placed, draw a live
    // line from it to the cursor so the user sees the span as they move.
    if (points.length === 1 && cursor) {
      ctx.strokeStyle = "#a78bfa";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(points[0][0] * ds, points[0][1] * ds);
      ctx.lineTo(cursor[0] * ds, cursor[1] * ds);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    points.forEach(([x, y]) => {
      const px = x * ds;
      const py = y * ds;
      const half = 30;
      ctx.beginPath();
      ctx.moveTo(px, py - half);
      ctx.lineTo(px, py + half);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, py - half);
      ctx.lineTo(px, py + half);
      ctx.strokeStyle = "#7c3aed";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
    return ds;
  }

  /** Pointer-down on the canvas wrapper starts a potential drag-pan. */
  function onPanPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const el = scrollRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      moved: false,
    };
    setDragging(true);
  }

  /** Update scroll position as the user drags. Treats moves under 3 px as
   *  a still click — the threshold avoids hand-tremor turning every pick
   *  click into a tiny accidental pan. */
  function onPanPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const el = scrollRef.current;
    if (!el) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      drag.moved = true;
    }
    if (drag.moved) {
      el.scrollLeft = drag.scrollLeft - dx;
      el.scrollTop = drag.scrollTop - dy;
    }
  }

  /** Release the pointer. If the press didn't move (a click, not a drag),
   *  run the canvas action — picking or placing a calibration point. We do
   *  this from pointer-up rather than a separate `click` handler because the
   *  pan's setPointerCapture swallows the canvas `click` event in most
   *  browsers, which is why clicks "did nothing" before. */
  function onPanPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const moved = drag?.moved ?? false;
    dragRef.current = null;
    setDragging(false);
    const el = scrollRef.current;
    if (el && el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    if (!moved) activateAt(e.clientX, e.clientY, e.altKey, e.shiftKey);
  }

  /** A click on the canvas (resolved from pointer-up). Picks a colour, picks
   *  a wall, or places a calibration point depending on the active mode. */
  function activateAt(
    clientX: number,
    clientY: number,
    altKey: boolean,
    shiftKey: boolean,
  ) {
    const canvas = canvasRef.current;
    if (!vectors || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Canvas renders the full sheet at `displayScale`, origin at (0,0), so
    // undoing the scale gives vector coords.
    const cx = (clientX - rect.left) / displayScale;
    const cy = (clientY - rect.top) / displayScale;

    if (picking) {
      const hit = nearestPath(vectors.paths, cx, cy, 12 / displayScale);
      if (hit) addWallColor(hit.color.toLowerCase());
      return;
    }
    if (pickingPaths) {
      const idx = nearestPathIndex(vectors.paths, cx, cy, 12 / displayScale);
      if (idx < 0) return;
      togglePathPick(idx, altKey || shiftKey);
      return;
    }
    if (!settingPoints) return; // navigate mode — clicks don't place points

    // Snap onto exact drawing geometry (scale-bar ticks, wall corners) so
    // the calibration distance is precise, not freehand.
    let x = cx;
    let y = cy;
    if (snap) {
      const v = nearestVertex(vectors.paths, x, y, 14 / displayScale);
      if (v) {
        x = v[0];
        y = v[1];
      }
    }
    const next: [number, number][] =
      calibPoints.length >= 2 ? [[x, y]] : [...calibPoints, [x, y]];
    setCalibPoints(next);
    setCalibCursor(null);
    setMmPerPx(null);
  }

  /** Track the cursor for the rubber-band preview line — only in Set-points
   *  mode, after the first point is down and before the second. */
  function onCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!settingPoints || calibPoints.length !== 1 || dragging) {
      if (calibCursor !== null) setCalibCursor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setCalibCursor([
      (e.clientX - rect.left) / displayScale,
      (e.clientY - rect.top) / displayScale,
    ]);
  }

  function setCalibration() {
    if (calibPoints.length !== 2) return;
    const distMm = parseFloat(knownDist) * 1000;
    if (!Number.isFinite(distMm) || distMm <= 0) {
      setError("Enter the real distance in metres.");
      return;
    }
    const [a, b] = calibPoints;
    const px = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (px < 1) {
      setError("Calibration points are too close together.");
      return;
    }
    setError(null);
    setMmPerPx(distMm / px);
    setSettingPoints(false);
    setCalibCursor(null);
  }

  function setCalibrationFromRatio() {
    const ratio = parseScaleRatio(scaleRatio);
    if (ratio === null || ratio <= 0) {
      setError("Enter the drawing scale as a ratio, e.g. 1:500.");
      return;
    }
    setError(null);
    setMmPerPx(mmPerPxFromScaleRatio(ratio));
    setScaleText(`1:${ratio}`);
  }

  /**
   * Persist the calibration (mm-per-pixel) as an empty extraction and
   * jump to Review. Used when the drawing is mono-colour and the auto
   * extractor would either over- or under-collect — the user draws each
   * wall manually in Review with two clicks, and each manual wall still
   * gets a real length because the calibration is stored alongside the
   * extraction.
   */
  async function skipAndOpenReview() {
    if (!user || !pageId || !projectId) return;
    if (mmPerPx === null) {
      setError("Calibrate the scale first.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await saveVectorWalls({
        drawingPageId: pageId,
        userId: user.id,
        walls: [],
        scaleText: scaleText.trim() || null,
        mmPerPx,
      });
      navigate(`/projects/${projectId}/pages/${pageId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
      setSaving(false);
    }
  }

  async function measureAndSave() {
    if (!pdfBuffer || !user || !pageId || !projectId || !vectors) return;
    if (mmPerPx === null) {
      setError("Calibrate the scale first.");
      return;
    }
    const usingPicks = pickedPathIndices.size > 0;
    if (!usingPicks && wallTypes.length === 0) {
      setError(
        "Add at least one wall type — pick a colour, click a wall on the drawing, or use the per-wall picker.",
      );
      return;
    }
    setError(null);
    setSaving(true);
    try {
      // Per-wall picking takes priority when the user has selected
      // anything — those are explicit picks and shouldn't be diluted
      // by a colour-based scan.
      const measured = usingPicks
        ? measurePickedWalls({
            vectors,
            pickedIndices: pickedPathIndices,
            mmPerPx,
            typeLabel: "Manual selection",
          })
        : await extractWallsFromPdfPage(pdfBuffer.slice(0), pageNumber, {
            wallColors: wallTypes,
            mmPerPx,
          });
      if (measured.length === 0) {
        throw new Error(
          "No walls measured. Check the wall colours and calibration.",
        );
      }
      // Walls arrive with no lot names or RLs — the user assigns lots and
      // grabs RLs on the Review page.
      await saveVectorWalls({
        drawingPageId: pageId,
        userId: user.id,
        walls: measured,
        scaleText: scaleText.trim() || null,
        mmPerPx,
      });
      navigate(`/projects/${projectId}/pages/${pageId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Measure failed.");
      setSaving(false);
    }
  }

  if (!projectId || !pageId) return <Navigate to="/dashboard" replace />;

  return (
    <main
      // Fill exactly the available height under the global Header (3.5rem
      // tall) so the page never scrolls — the canvas + sidebar each
      // handle their own internal scrolling. Without this constraint the
      // 78vh canvas stacks on top of the title + page padding and pushes
      // the bottom of the layout below the viewport.
      className="flex h-[calc(100vh-3.5rem)] flex-col gap-3 px-6 py-3"
    >
      <div className="shrink-0 space-y-1">
        <Link
          to={`/projects/${projectId}/pages/${pageId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to review
        </Link>

        <h1 className="text-xl font-semibold tracking-tight">
          Measure walls from PDF
        </h1>
        <p className="max-w-2xl text-xs text-muted-foreground">
          Calibrate the scale, click a retaining wall to pick its type, then
          measure. Lengths come straight from the drawing's vector geometry.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="shrink-0">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading drawing…
        </div>
      )}

      {!loading && vectors && (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_320px]">
            <div className="flex min-h-0 min-w-0 flex-col">
              {picking && (
                <div className="mb-2 shrink-0 rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-xs text-violet-900">
                  Click any retaining wall to add its colour as a wall type.
                  Toggle "Pick wall by clicking" off when you're done.
                </div>
              )}
              <div className="relative flex min-h-0 flex-1 flex-col">
                {/* Floating zoom toolbar — sits over the top-right of the
                    canvas so the drawing area stays free for clicks. */}
                <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border bg-white/95 p-1 shadow-sm backdrop-blur-sm">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Zoom out (—)"
                    onClick={() =>
                      setZoom((z) => Math.max(0.25, +(z / 1.25).toFixed(3)))
                    }
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </Button>
                  <button
                    type="button"
                    onClick={() => setZoom(1)}
                    title="Reset to 100%"
                    className="min-w-[3rem] rounded px-1.5 text-xs font-medium tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Zoom in (+)"
                    onClick={() =>
                      setZoom((z) => Math.min(8, +(z * 1.25).toFixed(3)))
                    }
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </Button>
                  <span className="mx-1 h-4 w-px bg-border" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Fit drawing to viewport"
                    onClick={() => {
                      // zoom 1 == the base "whole sheet fits the container"
                      // scale, so reset zoom and scroll back to the corner.
                      setZoom(1);
                      requestAnimationFrame(() => {
                        const el = scrollRef.current;
                        if (!el) return;
                        el.scrollLeft = 0;
                        el.scrollTop = 0;
                      });
                    }}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                  <span className="mx-1 h-4 w-px bg-border" />
                  <button
                    type="button"
                    onClick={() => setShowBackdrop((s) => !s)}
                    title={
                      showBackdrop
                        ? "Hide the drawing background"
                        : "Show the drawing background"
                    }
                    className={`flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium ${
                      showBackdrop
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Drawing
                  </button>
                </div>

                <div
                  ref={scrollRef}
                  onPointerDown={onPanPointerDown}
                  onPointerMove={onPanPointerMove}
                  onPointerUp={onPanPointerUp}
                  onPointerCancel={onPanPointerUp}
                  className={`min-h-0 flex-1 overflow-auto rounded-lg border bg-white ${
                    dragging ? "cursor-grabbing" : "cursor-grab"
                  }`}
                >
                  <canvas
                    ref={canvasRef}
                    onMouseMove={onCanvasMouseMove}
                    onMouseLeave={() => setCalibCursor(null)}
                    // Crosshair while a click-mode is active (picking a
                    // colour / wall, or setting calibration points). Plain
                    // otherwise — the wrapper shows grab for panning.
                    className={
                      picking || pickingPaths || settingPoints
                        ? "block cursor-crosshair"
                        : "block"
                    }
                  />
                </div>
              </div>
            </div>

            <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
              <section className="rounded-lg border bg-card p-4">
                <h2 className="text-sm font-semibold">1 · Calibrate scale</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Click <strong>Set points</strong>, then click two points a
                  known distance apart on the drawing (a scale bar is ideal)
                  and enter that distance — the most accurate way to
                  calibrate.
                </p>

                <Button
                  size="sm"
                  variant={settingPoints ? "default" : "outline"}
                  className="mt-3 gap-1.5"
                  onClick={() => {
                    setSettingPoints((s) => {
                      const next = !s;
                      if (next) {
                        // entering set-points mode — leave the picking modes
                        setPicking(false);
                        setPickingPaths(false);
                        setCalibPoints([]);
                        setCalibCursor(null);
                      }
                      return next;
                    });
                  }}
                >
                  <MousePointerClick className="h-3.5 w-3.5" />
                  {settingPoints ? "Setting points… (click to stop)" : "Set points"}
                </Button>

                {settingPoints && (
                  <>
                    <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={snap}
                        onChange={(e) => setSnap(e.target.checked)}
                        className="h-3.5 w-3.5 accent-violet-600"
                      />
                      Snap clicks to the nearest drawing vertex
                    </label>

                    <p className="mt-2.5 text-[11px] font-medium text-violet-700">
                      {calibPoints.length === 0
                        ? "Click the first point on the drawing."
                        : calibPoints.length === 1
                          ? "Now click the second point."
                          : "Two points set — enter the distance below."}
                    </p>
                  </>
                )}

                <div className="mt-2 grid gap-1.5">
                  <Label htmlFor="dist" className="text-xs">
                    Distance between the points (metres)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="dist"
                      value={knownDist}
                      onChange={(e) => setKnownDist(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setCalibration();
                      }}
                      placeholder="e.g. 20"
                      className="h-9"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={setCalibration}
                      disabled={calibPoints.length !== 2}
                    >
                      Set
                    </Button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowRatio((s) => !s)}
                  className="mt-3 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  {showRatio
                    ? "Hide scale ratio"
                    : "Know the scale ratio? Enter it instead"}
                </button>

                {showRatio && (
                  <div className="mt-3 rounded-md border border-dashed bg-muted/30 p-3">
                    <p className="text-[11px] text-muted-foreground">
                      If the title block lists a ratio (e.g. 1:500) you can use
                      it — but clicking a known distance above is usually more
                      accurate.
                    </p>
                    <div className="mt-2.5 grid gap-1.5">
                      <Label htmlFor="ratio" className="text-xs">
                        Scale ratio
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="ratio"
                          value={scaleRatio}
                          onChange={(e) => setScaleRatio(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setCalibrationFromRatio();
                          }}
                          placeholder="e.g. 1:500"
                          className="h-9 font-mono"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={setCalibrationFromRatio}
                        >
                          Set
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {mmPerPx !== null && (
                  <p className="mt-3 text-xs text-emerald-700">
                    Calibrated: 1 px = {mmPerPx.toFixed(2)} mm
                  </p>
                )}
              </section>

              <section className="rounded-lg border bg-card p-4">
                <h2 className="text-sm font-semibold">2 · Wall types</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pick the colours your retaining walls are drawn in. Each one
                  is highlighted on the drawing so you can confirm it before
                  measuring.
                </p>

                {palette.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Colours on this drawing
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {palette.map((c) => {
                        const picked = wallTypes.some(
                          (w) => w.color === c.color,
                        );
                        return (
                          <button
                            key={c.color}
                            type="button"
                            title={`${c.color} · ${c.count} lines`}
                            onClick={() => toggleWallColor(c.color)}
                            className={`h-7 w-7 rounded border ${
                              picked
                                ? "ring-2 ring-foreground ring-offset-1"
                                : "border-border"
                            }`}
                            style={{ background: c.color }}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                <Button
                  size="sm"
                  variant={picking ? "default" : "outline"}
                  className="mt-3 gap-1.5"
                  onClick={() => {
                    setPicking((p) => !p);
                    if (pickingPaths) setPickingPaths(false);
                    setSettingPoints(false);
                  }}
                >
                  <MousePointerClick className="h-3.5 w-3.5" />
                  {picking
                    ? "Clicking the drawing…"
                    : "Or click a wall on the drawing"}
                </Button>

                <div className="mt-3 rounded-md border border-dashed bg-muted/30 p-2.5">
                  <p className="text-[11px] font-medium">
                    Mono-colour drawing? Pick walls one by one.
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    When every wall is the same colour as the rest of the
                    linework, switch to per-wall picking. Click any wall to
                    grab the whole run; hold Alt or Shift to pick just one
                    line segment.
                  </p>
                  <Button
                    size="sm"
                    variant={pickingPaths ? "default" : "outline"}
                    className="mt-2 w-full gap-1.5"
                    onClick={() => {
                      setPickingPaths((p) => !p);
                      if (picking) setPicking(false);
                      setSettingPoints(false);
                    }}
                  >
                    <MousePointerClick className="h-3.5 w-3.5" />
                    {pickingPaths
                      ? `Picking walls… (${pickedPathIndices.size} picked)`
                      : "Pick walls one by one"}
                  </Button>
                  {pickedPathIndices.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setPickedPathIndices(new Set())}
                      className="mt-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Clear all {pickedPathIndices.size} picks
                    </button>
                  )}
                </div>

                {wallTypes.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {wallTypes.map((wt, i) => (
                      <div key={wt.color} className="flex items-center gap-2">
                        <span
                          className="h-6 w-6 shrink-0 rounded border"
                          style={{ background: wt.color }}
                          title={wt.color}
                        />
                        <Input
                          value={wt.typeLabel}
                          onChange={(e) =>
                            setWallTypes((prev) =>
                              prev.map((w, j) =>
                                j === i
                                  ? { ...w, typeLabel: e.target.value }
                                  : w,
                              ),
                            )
                          }
                          className="h-8"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setWallTypes((prev) =>
                              prev.filter((_, j) => j !== i),
                            )
                          }
                          title="Remove this wall type"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 grid gap-1.5">
                  <Label htmlFor="scaleText" className="text-xs">
                    Scale note (optional)
                  </Label>
                  <Input
                    id="scaleText"
                    value={scaleText}
                    onChange={(e) => setScaleText(e.target.value)}
                    placeholder="e.g. 1:500"
                    className="h-9"
                  />
                </div>
              </section>

              <Button
                className="w-full"
                onClick={measureAndSave}
                disabled={
                  saving ||
                  mmPerPx === null ||
                  (wallTypes.length === 0 && pickedPathIndices.size === 0)
                }
              >
                {saving
                  ? "Measuring…"
                  : pickedPathIndices.size > 0
                    ? `Measure & save ${pickedPathIndices.size} picked path${pickedPathIndices.size === 1 ? "" : "s"}`
                    : "Measure & save walls"}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={skipAndOpenReview}
                disabled={saving || mmPerPx === null}
                title={
                  mmPerPx === null
                    ? "Calibrate the scale first — the manually drawn walls still need a real length."
                    : "Save the calibration and open Review so you can draw each wall by hand."
                }
              >
                Skip — add walls manually in Review
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Use this when every wall is drawn the same colour and the
                auto-detect can't tell them apart. The scale you calibrated
                above is saved, so your manual clicks still measure in real
                metres.
              </p>
            </div>
          </div>
        )}
    </main>
  );
}

```


---

# Appendix — reference shadcn `Button` (verbatim)

Only if you prefer the real shadcn primitive over the §6 shim. Needs
`@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`.

## `src/components/ui/button.tsx`

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

```
