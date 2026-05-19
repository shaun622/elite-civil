import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, MousePointerClick, Sparkles, X } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  extractPageVectors,
  nearestPath,
  nearestVertex,
  type PageVectors,
} from "@/lib/pdfVectors";
import { loadPdf } from "@/lib/pdfRender";
import {
  distinctVectorColors,
  extractWallsFromPdfPage,
  fuseWallSemantics,
  mmPerPxFromScaleRatio,
  saveVectorWalls,
  snapHexToColors,
  VECTOR_SCALE,
  type WallColorSpec,
} from "@/lib/vectorWalls";
import {
  analyzeDrawingPage,
  type AnalyzeLot,
  type AnalyzeRl,
} from "@/lib/api/analyzeDrawing";
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

  const [calibPoints, setCalibPoints] = useState<[number, number][]>([]);
  const [knownDist, setKnownDist] = useState("");
  const [scaleRatio, setScaleRatio] = useState("");
  const [mmPerPx, setMmPerPx] = useState<number | null>(null);
  const [snap, setSnap] = useState(true);

  const [wallTypes, setWallTypes] = useState<WallColorSpec[]>([]);
  const [picking, setPicking] = useState(false);
  const [scaleText, setScaleText] = useState("");
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiLots, setAiLots] = useState<AnalyzeLot[]>([]);
  const [aiRls, setAiRls] = useState<AnalyzeRl[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  // Load the page's PDF from storage.
  useEffect(() => {
    if (!pageId) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const { data: page, error: pageErr } = await supabase
          .from("drawing_pages")
          .select("page_number, drawing_id")
          .eq("id", pageId)
          .single();
        if (pageErr || !page) throw new Error(pageErr?.message ?? "Page not found.");

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

  // Draw the linework once the canvas has mounted (i.e. vectors are ready).
  useEffect(() => {
    if (!vectors) return;
    const highlight = new Set(wallTypes.map((w) => w.color));
    setDisplayScale(redraw(vectors, calibPoints, highlight));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vectors, calibPoints, wallTypes]);

  function redraw(
    v: PageVectors,
    points: [number, number][],
    highlight: Set<string>,
  ): number {
    const canvas = canvasRef.current;
    if (!canvas) return 1;
    const ds = Math.min(1, 1400 / v.width);
    canvas.width = Math.round(v.width * ds);
    canvas.height = Math.round(v.height * ds);
    const ctx = canvas.getContext("2d");
    if (!ctx) return ds;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // With wall types chosen, fade everything else and draw the matching
    // linework bold on top so the picked walls stand out.
    const hasHi = highlight.size > 0;
    for (const pass of [0, 1]) {
      for (const path of v.paths) {
        const match = hasHi && highlight.has(path.color.toLowerCase());
        if (hasHi && pass === 0 && match) continue;
        if (hasHi && pass === 1 && !match) continue;
        if (!hasHi && pass === 1) continue;
        ctx.strokeStyle = hasHi && !match ? "#e6e6e6" : path.color;
        ctx.lineWidth = match ? 2.5 : 0.7;
        ctx.beginPath();
        const p = path.points;
        ctx.moveTo(p[0] * ds, p[1] * ds);
        for (let k = 2; k + 1 < p.length; k += 2) {
          ctx.lineTo(p[k] * ds, p[k + 1] * ds);
        }
        ctx.stroke();
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

  function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!vectors) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / displayScale;
    const cy = (e.clientY - rect.top) / displayScale;

    if (picking) {
      // Sample the colour of the wall line nearest the click.
      const hit = nearestPath(vectors.paths, cx, cy, 12 / displayScale);
      if (hit) {
        const color = hit.color.toLowerCase();
        setWallTypes((prev) =>
          prev.some((w) => w.color === color)
            ? prev
            : [...prev, { color, typeLabel: `Wall type ${prev.length + 1}` }],
        );
      }
      return;
    }

    // Calibration click — snap onto exact drawing geometry (scale-bar
    // ticks, wall corners) so the distance is precise, not freehand.
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
    setMmPerPx(null);
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

  async function autoDetect() {
    if (!pageId || !pdfBuffer || !vectors) return;
    setError(null);
    setAnalyzing(true);
    try {
      const ai = await analyzeDrawingPage(
        pageId,
        pdfBuffer.slice(0),
        pageNumber,
      );

      const sb = ai.scale_bar;
      if (sb.found && sb.p0 && sb.p1 && sb.length_m && sb.length_m > 0) {
        const px = Math.hypot(sb.p0[0] - sb.p1[0], sb.p0[1] - sb.p1[1]);
        if (px >= 1) {
          setCalibPoints([sb.p0, sb.p1]);
          setKnownDist(String(sb.length_m));
          setMmPerPx((sb.length_m * 1000) / px);
        }
      }

      if (ai.scale_text) setScaleText(ai.scale_text);

      if (ai.wall_colors.length > 0) {
        const palette = distinctVectorColors(vectors.paths);
        const detected: WallColorSpec[] = [];
        for (const c of ai.wall_colors) {
          const snapped = snapHexToColors(c.hex, palette);
          if (snapped && !detected.some((d) => d.color === snapped)) {
            detected.push({ color: snapped, typeLabel: c.type_label });
          }
        }
        if (detected.length > 0) setWallTypes(detected);
      }

      setAiLots(ai.lots);
      setAiRls(ai.rls);
      setAiSummary(
        `Detected: ${sb.found ? "scale bar" : "no scale bar"}, ` +
          `${ai.wall_colors.length} wall colour${ai.wall_colors.length === 1 ? "" : "s"}, ` +
          `${ai.lots.length} lot${ai.lots.length === 1 ? "" : "s"}, ` +
          `${ai.rls.length} RL${ai.rls.length === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-detect failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function measureAndSave() {
    if (!pdfBuffer || !user || !pageId || !projectId) return;
    if (mmPerPx === null) {
      setError("Calibrate the scale first.");
      return;
    }
    if (wallTypes.length === 0) {
      setError("Add at least one wall type — click a wall on the drawing.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const measured = await extractWallsFromPdfPage(
        pdfBuffer.slice(0),
        pageNumber,
        { wallColors: wallTypes, mmPerPx },
      );
      if (measured.length === 0) {
        throw new Error(
          "No walls measured. Check the wall colours and calibration.",
        );
      }
      const walls = fuseWallSemantics(measured, aiLots, aiRls);
      await saveVectorWalls({
        drawingPageId: pageId,
        userId: user.id,
        walls,
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
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main className="container py-8">
        <Link
          to={`/projects/${projectId}/pages/${pageId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to review
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Measure walls from PDF
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Calibrate the scale, click a retaining wall to pick its type, then
          measure. Lengths come straight from the drawing's vector geometry.
        </p>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading drawing…
          </div>
        )}

        {!loading && vectors && (
          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
            <div>
              {picking && (
                <div className="mb-2 rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-xs text-violet-900">
                  Click any retaining wall to add its colour as a wall type.
                  Toggle "Pick wall by clicking" off when you're done.
                </div>
              )}
              <div className="overflow-auto rounded-lg border bg-white">
                <canvas
                  ref={canvasRef}
                  onClick={onCanvasClick}
                  className="block cursor-crosshair"
                />
              </div>
            </div>

            <div className="space-y-5">
              <section className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Auto-detect</h2>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={autoDetect}
                    disabled={analyzing}
                  >
                    {analyzing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {analyzing ? "Analysing…" : "Auto-detect with AI"}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reads the scale bar, legend colours, lot numbers and the
                  ground RLs off the drawing. Calibration and colours fill in
                  below; the RLs are paired to each wall when you measure.
                </p>
                {aiSummary && (
                  <p className="mt-2 text-xs text-emerald-700">{aiSummary}</p>
                )}
              </section>

              <section className="rounded-lg border bg-card p-4">
                <h2 className="text-sm font-semibold">1 · Calibrate scale</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Set the drawing's scale — type the ratio from the title
                  block, or click two points a known distance apart.
                </p>

                <div className="mt-3 grid gap-1.5">
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

                <div className="my-3 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  or click two points
                  <span className="h-px flex-1 bg-border" />
                </div>

                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={snap}
                    onChange={(e) => setSnap(e.target.checked)}
                    className="h-3.5 w-3.5 accent-violet-600"
                  />
                  Snap clicks to the nearest drawing vertex
                </label>
                <div className="mt-3 grid gap-2">
                  <Label htmlFor="dist" className="text-xs">
                    Distance (metres)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="dist"
                      value={knownDist}
                      onChange={(e) => setKnownDist(e.target.value)}
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

                {mmPerPx !== null && (
                  <p className="mt-3 text-xs text-emerald-700">
                    Calibrated: 1 px = {mmPerPx.toFixed(2)} mm
                  </p>
                )}
              </section>

              <section className="rounded-lg border bg-card p-4">
                <h2 className="text-sm font-semibold">2 · Wall types</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Click a retaining wall on the drawing to add its colour as
                  a wall type. Auto-detect pre-fills these from the legend.
                </p>
                <Button
                  size="sm"
                  variant={picking ? "default" : "outline"}
                  className="mt-3 gap-1.5"
                  onClick={() => setPicking((p) => !p)}
                >
                  <MousePointerClick className="h-3.5 w-3.5" />
                  {picking
                    ? "Click a wall on the drawing…"
                    : "Pick wall by clicking"}
                </Button>

                {wallTypes.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    No wall types yet — pick one above, or run Auto-detect.
                  </p>
                ) : (
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
                disabled={saving || mmPerPx === null}
              >
                {saving ? "Measuring…" : "Measure & save walls"}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
