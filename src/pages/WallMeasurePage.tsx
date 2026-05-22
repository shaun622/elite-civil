import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Maximize2,
  MousePointerClick,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
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
  // 1.0 = "fit page to viewport", anything > 1 enlarges the canvas so the
  // user can pan around it via the scroll container.
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [calibPoints, setCalibPoints] = useState<[number, number][]>([]);
  const [knownDist, setKnownDist] = useState("");
  const [scaleRatio, setScaleRatio] = useState("");
  const [mmPerPx, setMmPerPx] = useState<number | null>(null);
  const [snap, setSnap] = useState(true);
  const [showDistance, setShowDistance] = useState(false);

  const [wallTypes, setWallTypes] = useState<WallColorSpec[]>([]);
  const [picking, setPicking] = useState(false);
  const [scaleText, setScaleText] = useState("");
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiLots, setAiLots] = useState<AnalyzeLot[]>([]);
  const [aiRls, setAiRls] = useState<AnalyzeRl[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  // Bounding box of all drawn vector content, in vector coordinates. The
  // canvas is sized to this bbox rather than the full sheet so the empty
  // paper margins (often most of the page) don't fill the viewport.
  const contentBbox = useMemo(() => {
    if (!vectors) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const path of vectors.paths) {
      const p = path.points;
      for (let i = 0; i + 1 < p.length; i += 2) {
        if (p[i] < minX) minX = p[i];
        if (p[i] > maxX) maxX = p[i];
        if (p[i + 1] < minY) minY = p[i + 1];
        if (p[i + 1] > maxY) maxY = p[i + 1];
      }
    }
    if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null;
    const pad = 24;
    const bMinX = Math.max(0, minX - pad);
    const bMinY = Math.max(0, minY - pad);
    const bMaxX = Math.min(vectors.width, maxX + pad);
    const bMaxY = Math.min(vectors.height, maxY + pad);
    return {
      minX: bMinX,
      minY: bMinY,
      maxX: bMaxX,
      maxY: bMaxY,
      width: bMaxX - bMinX,
      height: bMaxY - bMinY,
    };
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
    setDisplayScale(
      redraw(vectors, calibPoints, highlight, picking, zoom, contentBbox),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vectors, calibPoints, wallTypes, picking, zoom, contentBbox]);

  function redraw(
    v: PageVectors,
    points: [number, number][],
    highlight: Set<string>,
    picking: boolean,
    zoomFactor: number,
    bbox: { minX: number; minY: number; width: number; height: number } | null,
  ): number {
    const canvas = canvasRef.current;
    if (!canvas) return 1;
    // Render the content bbox rather than the full page so blank paper
    // margins don't fill the viewport. Falls back to the full sheet if
    // we couldn't compute a bbox (e.g. empty page).
    const renderW = bbox ? bbox.width : v.width;
    const renderH = bbox ? bbox.height : v.height;
    const ox = bbox ? bbox.minX : 0;
    const oy = bbox ? bbox.minY : 0;
    // Base fit: shrink wide content to ~1400 px so it fits a default
    // viewport. Zoom is applied on top — the canvas itself grows so lines
    // stay crisp at any zoom level (no CSS upscaling blur).
    const ds = Math.min(1, 1400 / renderW) * zoomFactor;
    canvas.width = Math.round(renderW * ds);
    canvas.height = Math.round(renderH * ds);
    const ctx = canvas.getContext("2d");
    if (!ctx) return ds;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
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
      ctx.moveTo((p[0] - ox) * ds, (p[1] - oy) * ds);
      for (let k = 2; k + 1 < p.length; k += 2) {
        ctx.lineTo((p[k] - ox) * ds, (p[k + 1] - oy) * ds);
      }
      ctx.stroke();
    };

    // Picked wall colours draw bold. While picking, the rest keeps its true
    // colour so every wall is visible to aim at; once picking is off, the
    // rest fades so the chosen walls can be verified at a glance.
    const hasHi = highlight.size > 0;
    const fade = hasHi && !picking;
    for (const path of v.paths) {
      if (hasHi && highlight.has(path.color.toLowerCase())) continue;
      drawPath(path, fade ? "#e6e6e6" : path.color, 0.7);
    }
    if (hasHi) {
      for (const path of v.paths) {
        if (highlight.has(path.color.toLowerCase())) {
          drawPath(path, path.color, 2.5);
        }
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
      ctx.moveTo((points[0][0] - ox) * ds, (points[0][1] - oy) * ds);
      ctx.lineTo((points[1][0] - ox) * ds, (points[1][1] - oy) * ds);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    points.forEach(([x, y]) => {
      const px = (x - ox) * ds;
      const py = (y - oy) * ds;
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
    // Click in vector coords: undo the canvas display scale, then add
    // back the bbox offset (the canvas content is translated so the
    // bbox origin sits at canvas (0,0)).
    const ox = contentBbox?.minX ?? 0;
    const oy = contentBbox?.minY ?? 0;
    const cx = (e.clientX - rect.left) / displayScale + ox;
    const cy = (e.clientY - rect.top) / displayScale + oy;

    if (picking) {
      // Sample the colour of the wall line nearest the click.
      const hit = nearestPath(vectors.paths, cx, cy, 12 / displayScale);
      if (hit) addWallColor(hit.color.toLowerCase());
      return;
    }
    if (!showDistance) return;

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
          // Don't auto-commit the scale here — the user must hit Set on the
          // ratio or distance below, so a wrong scale-bar read never ships.
        }
      }

      if (ai.scale_text) {
        setScaleText(ai.scale_text);
        // Pre-fill the Scale ratio field from the AI's reading so the user
        // can just confirm it with Set.
        const m = ai.scale_text.match(/1\s*[:=]\s*(\d+)/);
        if (m) setScaleRatio(`1:${m[1]}`);
      }

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
              <div className="relative">
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
                    title="Fit drawing to viewport (skips empty paper margins)"
                    onClick={() => {
                      const fit = computeFitZoom(vectors, scrollRef.current);
                      if (fit) {
                        setZoom(fit.zoom);
                        // After the canvas grows, scroll the content
                        // bbox into view so the user lands on the drawing,
                        // not on the white margins above it.
                        requestAnimationFrame(() => {
                          const el = scrollRef.current;
                          if (!el) return;
                          el.scrollLeft = fit.scrollLeft;
                          el.scrollTop = fit.scrollTop;
                        });
                      }
                    }}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div
                  ref={scrollRef}
                  onWheel={(e) => {
                    // Ctrl + wheel zooms (matches PDF readers / browsers).
                    if (!e.ctrlKey && !e.metaKey) return;
                    e.preventDefault();
                    const delta = e.deltaY > 0 ? 1 / 1.15 : 1.15;
                    setZoom((z) =>
                      Math.max(0.25, Math.min(8, +(z * delta).toFixed(3))),
                    );
                  }}
                  className="max-h-[78vh] overflow-auto rounded-lg border bg-white"
                >
                  <canvas
                    ref={canvasRef}
                    onClick={onCanvasClick}
                    className="block cursor-crosshair"
                  />
                </div>
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
                  Type the scale ratio from the title block — it's exact and
                  the quickest way to calibrate.
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

                <button
                  type="button"
                  onClick={() => setShowDistance((s) => !s)}
                  className="mt-3 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  {showDistance
                    ? "Hide distance calibration"
                    : "No ratio on the sheet? Calibrate by clicking a distance"}
                </button>

                {showDistance && (
                  <div className="mt-3 rounded-md border border-dashed bg-muted/30 p-3">
                    <p className="text-[11px] text-muted-foreground">
                      Failsafe — prefer the scale ratio above, it's exact. Use
                      this only when the sheet has no ratio: click two points
                      a known distance apart, then enter that distance.
                    </p>
                    <label className="mt-2.5 flex items-center gap-2 text-xs text-muted-foreground">
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
                  onClick={() => setPicking((p) => !p)}
                >
                  <MousePointerClick className="h-3.5 w-3.5" />
                  {picking
                    ? "Clicking the drawing…"
                    : "Or click a wall on the drawing"}
                </Button>

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
                disabled={saving || mmPerPx === null}
              >
                {saving ? "Measuring…" : "Measure & save walls"}
              </Button>
            </div>
          </div>
        )}
    </main>
  );
}

/**
 * Walk every path's points to find the bounding box of the actual drawn
 * content (in vector coordinates), then work out a zoom factor + scroll
 * offset that fits that box snugly inside the scroll container. Returns
 * null if there's no content or no container yet.
 */
function computeFitZoom(
  v: PageVectors | null,
  container: HTMLDivElement | null,
): { zoom: number; scrollLeft: number; scrollTop: number } | null {
  if (!v || !container) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of v.paths) {
    const p = path.points;
    for (let i = 0; i + 1 < p.length; i += 2) {
      const x = p[i];
      const y = p[i + 1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null;

  // Padding around the content so the user doesn't end up flush against
  // the wall of the viewport.
  const padX = (maxX - minX) * 0.05;
  const padY = (maxY - minY) * 0.05;
  const bboxW = maxX - minX + padX * 2;
  const bboxH = maxY - minY + padY * 2;

  const baseDs = Math.min(1, 1400 / v.width);
  // viewport size in vector-pixel space (assuming the redraw applies
  // baseDs * zoom). We want bbox to fill the viewport in vector pixels.
  const viewportVecW = container.clientWidth / baseDs;
  const viewportVecH = container.clientHeight / baseDs;
  const zoom = Math.min(
    8,
    Math.max(1, Math.min(viewportVecW / bboxW, viewportVecH / bboxH)),
  );

  // Where to scroll so the content bbox is centred. Coordinates are in
  // displayed-canvas pixels (vector * baseDs * zoom).
  const scale = baseDs * zoom;
  const cx = (minX - padX + bboxW / 2) * scale;
  const cy = (minY - padY + bboxH / 2) * scale;
  return {
    zoom,
    scrollLeft: Math.max(0, cx - container.clientWidth / 2),
    scrollTop: Math.max(0, cy - container.clientHeight / 2),
  };
}
