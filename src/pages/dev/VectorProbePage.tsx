import { useRef, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  bucketPaths,
  extractPdfPageVectors,
  measureWallRuns,
  pathDimensions,
  probePdfVectors,
  type PageVectors,
  type PathBucket,
  type VectorPath,
  type VectorProbeResult,
  type WallRun,
} from "@/lib/pdfVectors";

/**
 * Dev-only PDF vector-extraction tool: render a page's vector linework,
 * inspect the wall-coloured paths by line weight + paint op, calibrate the
 * scale, then group paths into runs and read their real lengths.
 */
type Calibration = {
  points: [number, number][];
  mmPerPx: number | null;
};

export function VectorProbePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  const [pageNum, setPageNum] = useState("6");
  const [isolate, setIsolate] = useState("#dd6e00,#ff00bf,#b80000");
  const [widthFilter, setWidthFilter] = useState("");
  const [minPiece, setMinPiece] = useState("1.5");
  const [minThickness, setMinThickness] = useState("0.1");
  const [maxGap, setMaxGap] = useState("5");

  const [vectors, setVectors] = useState<PageVectors | null>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const [buckets, setBuckets] = useState<PathBucket[] | null>(null);
  const [calib, setCalib] = useState<Calibration>({ points: [], mmPerPx: null });
  const [calibMode, setCalibMode] = useState(false);
  const [knownDist, setKnownDist] = useState("");
  const [runs, setRuns] = useState<WallRun[] | null>(null);
  const [thicknessHist, setThicknessHist] = useState<
    { label: string; count: number }[] | null
  >(null);

  const widthNum = widthFilter.trim() === "" ? null : Number(widthFilter);

  function pathMatches(p: VectorPath, isolated: Set<string>): boolean {
    if (!isolated.has(p.color.toLowerCase())) return false;
    if (widthNum !== null && Math.round(p.lineWidth) !== widthNum) return false;
    return true;
  }

  async function onPickFile(f: File) {
    setFile(f);
    setError(null);
    setReport(null);
    setVectors(null);
    setRuns(null);
    setBuckets(null);
    setCalib({ points: [], mmPerPx: null });
    setBusy(true);
    try {
      setReport(formatReport(await probePdfVectors(f, f.name)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Probe failed.");
    } finally {
      setBusy(false);
    }
  }

  async function renderPage() {
    if (!file) return;
    setError(null);
    setBusy(true);
    setRuns(null);
    try {
      const n = Math.max(1, parseInt(pageNum, 10) || 1);
      const v = await extractPdfPageVectors(file, n, 2);
      setVectors(v);
      setBuckets(bucketPaths(v.paths, parseIsolate(isolate)));
      const reset = { points: [], mmPerPx: null };
      setCalib(reset);
      setDisplayScale(redraw(v, parseIsolate(isolate), reset));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Render failed.");
    } finally {
      setBusy(false);
    }
  }

  function redraw(
    v: PageVectors,
    isolated: Set<string>,
    calibration: Calibration,
  ): number {
    const canvas = canvasRef.current;
    if (!canvas) return 1;
    const maxW = 1400;
    const ds = Math.min(1, maxW / v.width);
    canvas.width = Math.round(v.width * ds);
    canvas.height = Math.round(v.height * ds);
    const ctx = canvas.getContext("2d");
    if (!ctx) return ds;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const hasIso = isolated.size > 0;
    for (const pass of [0, 1]) {
      for (const path of v.paths) {
        const match = pathMatches(path, isolated);
        if (hasIso && pass === 0 && match) continue;
        if (hasIso && pass === 1 && !match) continue;
        if (!hasIso && pass === 1) continue;
        const faint = hasIso && !match;
        ctx.strokeStyle = faint ? "#e6e6e6" : path.color;
        ctx.lineWidth = faint ? 0.5 : match ? 2.5 : 0.7;
        ctx.beginPath();
        const p = path.points;
        ctx.moveTo(p[0] * ds, p[1] * ds);
        for (let k = 2; k + 1 < p.length; k += 2) {
          ctx.lineTo(p[k] * ds, p[k + 1] * ds);
        }
        ctx.stroke();
      }
    }

    ctx.fillStyle = "#7c3aed";
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 1.5;
    calibration.points.forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(dx * ds, dy * ds, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    if (calibration.points.length === 2) {
      ctx.beginPath();
      ctx.moveTo(calibration.points[0][0] * ds, calibration.points[0][1] * ds);
      ctx.lineTo(calibration.points[1][0] * ds, calibration.points[1][1] * ds);
      ctx.stroke();
    }
    return ds;
  }

  function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!calibMode || !vectors) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - rect.left) / displayScale;
    const dy = (e.clientY - rect.top) / displayScale;
    const next: Calibration = {
      points:
        calib.points.length >= 2 ? [[dx, dy]] : [...calib.points, [dx, dy]],
      mmPerPx: null,
    };
    setCalib(next);
    redraw(vectors, parseIsolate(isolate), next);
  }

  function applyCalibration() {
    if (calib.points.length !== 2) return;
    const distMm = parseFloat(knownDist) * 1000;
    if (!Number.isFinite(distMm) || distMm <= 0) {
      setError("Enter the real distance in metres (e.g. 20).");
      return;
    }
    const [a, b] = calib.points;
    const px = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (px < 1) {
      setError("The two calibration points are too close together.");
      return;
    }
    setError(null);
    setCalib({ ...calib, mmPerPx: distMm / px });
    setCalibMode(false);
  }

  function measure() {
    if (!vectors) return;
    if (calib.mmPerPx === null) {
      setError("Calibrate the scale first (click the scale bar's two ends).");
      return;
    }
    setError(null);
    const isolated = parseIsolate(isolate);
    const filtered = vectors.paths.filter((p) => pathMatches(p, isolated));
    const minPieceM = parseFloat(minPiece);
    const minPiecePx =
      Number.isFinite(minPieceM) && minPieceM > 0
        ? (minPieceM * 1000) / calib.mmPerPx
        : 0;
    const minThickM = parseFloat(minThickness);
    const minThickPx =
      Number.isFinite(minThickM) && minThickM > 0
        ? (minThickM * 1000) / calib.mmPerPx
        : 0;
    const maxGapM = parseFloat(maxGap);
    const maxGapPx =
      Number.isFinite(maxGapM) && maxGapM > 0
        ? (maxGapM * 1000) / calib.mmPerPx
        : 0;
    const measured = measureWallRuns(
      filtered,
      isolated,
      minPiecePx,
      minThickPx,
      maxGapPx,
    );
    setRuns(measured);
    drawRuns(vectors, measured);

    // Thickness histogram of pieces that pass the length filter — helps
    // pick the thickness threshold (walls vs setback lines).
    const mmPerPx = calib.mmPerPx;
    const dims = pathDimensions(filtered, isolated).filter(
      (d) => d.lengthPx >= minPiecePx,
    );
    const bands = [0.03, 0.06, 0.1, 0.15, 0.2, 0.3, 0.5];
    const hist = bands.map((hi, i) => ({
      lo: i === 0 ? 0 : bands[i - 1],
      hi,
      count: 0,
    }));
    let overflow = 0;
    for (const d of dims) {
      const wM = (d.widthPx * mmPerPx) / 1000;
      const bucket = hist.find((b) => wM < b.hi);
      if (bucket) bucket.count++;
      else overflow++;
    }
    const histLabels = hist.map((b) => ({
      label: `${b.lo.toFixed(2)}–${b.hi.toFixed(2)} m`,
      count: b.count,
    }));
    histLabels.push({ label: "0.50 m +", count: overflow });
    setThicknessHist(histLabels);
  }

  /** Recolour the canvas so each measured run gets a distinct hue. */
  function drawRuns(v: PageVectors, measured: WallRun[]) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ds = displayScale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Everything faint first.
    ctx.strokeStyle = "#ededed";
    ctx.lineWidth = 0.5;
    for (const path of v.paths) {
      ctx.beginPath();
      const p = path.points;
      ctx.moveTo(p[0] * ds, p[1] * ds);
      for (let k = 2; k + 1 < p.length; k += 2) {
        ctx.lineTo(p[k] * ds, p[k + 1] * ds);
      }
      ctx.stroke();
    }

    // Each run in its own hue (golden-angle spread).
    measured.forEach((run, i) => {
      ctx.strokeStyle = `hsl(${(i * 137.5) % 360} 80% 42%)`;
      ctx.lineWidth = 2.5;
      for (const path of run.paths) {
        ctx.beginPath();
        const p = path.points;
        ctx.moveTo(p[0] * ds, p[1] * ds);
        for (let k = 2; k + 1 < p.length; k += 2) {
          ctx.lineTo(p[k] * ds, p[k + 1] * ds);
        }
        ctx.stroke();
      }
    });
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main className="container py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          Vector probe (dev)
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Render a page's vector linework, inspect the wall-coloured paths by
          line weight + paint op, calibrate the scale, then group paths into
          runs and read real lengths.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickFile(f);
              e.target.value = "";
            }}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? "Working…" : file ? "Choose another PDF" : "Choose PDF"}
          </Button>
          {file && (
            <span className="text-sm text-muted-foreground">{file.name}</span>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="mt-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {file && (
          <div className="mt-6 space-y-4 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pageNum" className="text-xs">
                  Page
                </Label>
                <Input
                  id="pageNum"
                  value={pageNum}
                  onChange={(e) => setPageNum(e.target.value)}
                  className="h-9 w-20"
                />
              </div>
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="isolate" className="text-xs">
                  Isolate colours (comma-separated hex)
                </Label>
                <Input
                  id="isolate"
                  value={isolate}
                  onChange={(e) => setIsolate(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="width" className="text-xs">
                  Line width (blank = any)
                </Label>
                <Input
                  id="width"
                  value={widthFilter}
                  onChange={(e) => setWidthFilter(e.target.value)}
                  placeholder="any"
                  className="h-9 w-32"
                />
              </div>
              <Button onClick={renderPage} disabled={busy}>
                Render page
              </Button>
            </div>

            {buckets && buckets.length > 0 && (
              <BucketTable buckets={buckets} mmPerPx={calib.mmPerPx} />
            )}

            {vectors && (
              <div className="flex flex-wrap items-end gap-3 border-t pt-3">
                <Button
                  variant={calibMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setCalibMode((m) => !m);
                    if (!calibMode) {
                      const reset = { points: [], mmPerPx: null };
                      setCalib(reset);
                      redraw(vectors, parseIsolate(isolate), reset);
                    }
                  }}
                >
                  {calibMode
                    ? "Calibrating… click 2 points"
                    : "Calibrate scale"}
                </Button>
                <div className="grid gap-1.5">
                  <Label htmlFor="dist" className="text-xs">
                    Real distance between the 2 points (metres)
                  </Label>
                  <Input
                    id="dist"
                    value={knownDist}
                    onChange={(e) => setKnownDist(e.target.value)}
                    placeholder="e.g. 20"
                    className="h-9 w-40"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={applyCalibration}
                  disabled={calib.points.length !== 2}
                >
                  Set calibration
                </Button>
                <div className="grid gap-1.5">
                  <Label htmlFor="minPiece" className="text-xs">
                    Min piece length (m)
                  </Label>
                  <Input
                    id="minPiece"
                    value={minPiece}
                    onChange={(e) => setMinPiece(e.target.value)}
                    className="h-9 w-28"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="minThick" className="text-xs">
                    Min thickness (m)
                  </Label>
                  <Input
                    id="minThick"
                    value={minThickness}
                    onChange={(e) => setMinThickness(e.target.value)}
                    className="h-9 w-28"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="maxGap" className="text-xs">
                    Max dash gap (m)
                  </Label>
                  <Input
                    id="maxGap"
                    value={maxGap}
                    onChange={(e) => setMaxGap(e.target.value)}
                    className="h-9 w-28"
                  />
                </div>
                <Button size="sm" onClick={measure}>
                  Measure walls
                </Button>
                {runs && (
                  <span className="text-xs text-muted-foreground">
                    Canvas is colour-by-run — each wall a distinct hue.
                  </span>
                )}
              </div>
            )}

            {calib.mmPerPx !== null && (
              <p className="text-xs text-emerald-700">
                Calibrated: 1 px = {calib.mmPerPx.toFixed(2)} mm
              </p>
            )}
            {calibMode && (
              <p className="text-xs text-muted-foreground">
                Click two points a known distance apart (the scale bar is
                ideal), enter that distance, then Set calibration.
              </p>
            )}

            <div className="overflow-auto rounded-md border bg-white">
              <canvas
                ref={canvasRef}
                onClick={onCanvasClick}
                className="block"
                style={{ cursor: calibMode ? "crosshair" : "default" }}
              />
            </div>

            {thicknessHist && (
              <div className="border-t pt-3">
                <p className="text-xs font-semibold">
                  Wall-piece thickness distribution (pieces past the length
                  filter) — pick a Min wall thickness between the setback-line
                  spike and the wall spike.
                </p>
                <div className="mt-2 space-y-0.5">
                  {thicknessHist.map((h) => (
                    <div key={h.label} className="flex items-center gap-2 text-xs">
                      <span className="w-24 tabular-nums text-muted-foreground">
                        {h.label}
                      </span>
                      <span
                        className="inline-block h-3 bg-foreground/70"
                        style={{ width: `${Math.min(400, h.count * 3)}px` }}
                      />
                      <span className="tabular-nums">{h.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {runs && <RunSummary runs={runs} mmPerPx={calib.mmPerPx} />}
          </div>
        )}

        {report && (
          <textarea
            readOnly
            value={report}
            className="mt-6 h-[32vh] w-full rounded-md border bg-card p-3 font-mono text-xs"
            onFocus={(e) => e.target.select()}
          />
        )}
      </main>
    </div>
  );
}

function BucketTable({
  buckets,
  mmPerPx,
}: {
  buckets: PathBucket[];
  mmPerPx: number | null;
}) {
  const fmt = (px: number) =>
    mmPerPx === null
      ? `${px.toFixed(0)} px`
      : `${((px * mmPerPx) / 1000).toFixed(1)} m`;
  return (
    <div className="border-t pt-3">
      <p className="text-xs font-semibold">
        Path breakdown (isolated colours) — colour × line weight × paint op
      </p>
      <div className="mt-2 overflow-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-3">Colour</th>
              <th className="py-1 pr-3">Width</th>
              <th className="py-1 pr-3">Paint op</th>
              <th className="py-1 pr-3 text-right">Paths</th>
              <th className="py-1 pr-3 text-right">Total length</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b, i) => (
              <tr key={i} className="border-t">
                <td className="py-1 pr-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-3 w-3 rounded-sm border"
                      style={{ background: b.color }}
                    />
                    {b.color}
                  </span>
                </td>
                <td className="py-1 pr-3">{b.lineWidth}</td>
                <td className="py-1 pr-3">{b.paintOp}</td>
                <td className="py-1 pr-3 text-right">{b.count}</td>
                <td className="py-1 pr-3 text-right">{fmt(b.lengthPx)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Set the "Line width" field above to one of these values and re-render
        to isolate just that bucket.
      </p>
    </div>
  );
}

function RunSummary({
  runs,
  mmPerPx,
}: {
  runs: WallRun[];
  mmPerPx: number | null;
}) {
  const byColor = new Map<string, WallRun[]>();
  for (const r of runs) {
    const list = byColor.get(r.color) ?? [];
    list.push(r);
    byColor.set(r.color, list);
  }
  const fmt = (px: number) =>
    mmPerPx === null
      ? `${px.toFixed(0)} px`
      : `${((px * mmPerPx) / 1000).toFixed(2)} m`;

  return (
    <div className="space-y-3 border-t pt-3 text-sm">
      {!mmPerPx && (
        <p className="text-xs text-amber-700">
          Not calibrated — lengths in pixels.
        </p>
      )}
      {[...byColor.entries()].map(([color, colorRuns]) => {
        const total = colorRuns.reduce((s, r) => s + r.lengthPx, 0);
        return (
          <div key={color}>
            <div className="flex items-center gap-2 font-medium">
              <span
                className="inline-block h-3 w-3 rounded-sm border"
                style={{ background: color }}
              />
              <span>{color}</span>
              <span className="text-muted-foreground">
                — {colorRuns.length} runs, total {fmt(total)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {colorRuns.slice(0, 80).map((r, i) => (
                <span
                  key={i}
                  className="rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums"
                >
                  {fmt(r.lengthPx)}
                </span>
              ))}
              {colorRuns.length > 80 && (
                <span className="text-xs text-muted-foreground">
                  +{colorRuns.length - 80} more
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function parseIsolate(text: string): Set<string> {
  return new Set(
    text
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^#[0-9a-f]{6}$/.test(s)),
  );
}

function formatReport(result: VectorProbeResult): string {
  const lines: string[] = [];
  lines.push(`=== VECTOR PROBE: ${result.fileName} ===`);
  lines.push(`Pages: ${result.pageCount}`);
  lines.push("");
  for (const page of result.pages) {
    lines.push(
      `--- Page ${page.pageNumber} (${page.pageWidthPt} x ${page.pageHeightPt} pt) ---`,
    );
    if (page.error) {
      lines.push(`  ERROR: ${page.error}`);
      lines.push("");
      continue;
    }
    lines.push(
      `  stroked: ${page.strokedPathCount} | filled: ${page.filledPathCount}`,
    );
    lines.push(`  stroke colours:`);
    for (const c of page.strokeColors) {
      lines.push(`    ${c.color}: ${c.strokedPaths}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
