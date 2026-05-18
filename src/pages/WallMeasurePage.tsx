import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { extractPageVectors, type PageVectors } from "@/lib/pdfVectors";
import { loadPdf } from "@/lib/pdfRender";
import {
  extractWallsFromPdfPage,
  saveVectorWalls,
  VECTOR_SCALE,
  type WallColorSpec,
} from "@/lib/vectorWalls";

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
  const [mmPerPx, setMmPerPx] = useState<number | null>(null);

  const [colorText, setColorText] = useState(
    "#dd6e00 Type 1\n#ff00bf Type 2\n#b80000 Type 3",
  );
  const [scaleText, setScaleText] = useState("");
  const [saving, setSaving] = useState(false);

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

  // Render the page's vectors once the PDF is loaded.
  useEffect(() => {
    if (!pdfBuffer) return;
    let active = true;
    (async () => {
      try {
        const pdf = await loadPdf(pdfBuffer.slice(0));
        const v = await extractPageVectors(pdf, pageNumber, VECTOR_SCALE);
        if (!active) return;
        setVectors(v);
        setDisplayScale(redraw(v, []));
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

  function redraw(v: PageVectors, points: [number, number][]): number {
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
    for (const path of v.paths) {
      ctx.strokeStyle = path.color;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      const p = path.points;
      ctx.moveTo(p[0] * ds, p[1] * ds);
      for (let k = 2; k + 1 < p.length; k += 2) {
        ctx.lineTo(p[k] * ds, p[k + 1] * ds);
      }
      ctx.stroke();
    }
    ctx.fillStyle = "#7c3aed";
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 1.5;
    points.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x * ds, y * ds, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    if (points.length === 2) {
      ctx.beginPath();
      ctx.moveTo(points[0][0] * ds, points[0][1] * ds);
      ctx.lineTo(points[1][0] * ds, points[1][1] * ds);
      ctx.stroke();
    }
    return ds;
  }

  function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!vectors) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / displayScale;
    const y = (e.clientY - rect.top) / displayScale;
    const next: [number, number][] =
      calibPoints.length >= 2 ? [[x, y]] : [...calibPoints, [x, y]];
    setCalibPoints(next);
    setMmPerPx(null);
    redraw(vectors, next);
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

  function parseColorSpecs(): WallColorSpec[] {
    const specs: WallColorSpec[] = [];
    for (const line of colorText.split("\n")) {
      const m = line.trim().match(/^(#[0-9a-fA-F]{6})\s+(.+)$/);
      if (m) specs.push({ color: m[1].toLowerCase(), typeLabel: m[2].trim() });
    }
    return specs;
  }

  async function measureAndSave() {
    if (!pdfBuffer || !user || !pageId || !projectId) return;
    if (mmPerPx === null) {
      setError("Calibrate the scale first.");
      return;
    }
    const wallColors = parseColorSpecs();
    if (wallColors.length === 0) {
      setError("Add at least one wall colour line (e.g. '#dd6e00 Type 1').");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const walls = await extractWallsFromPdfPage(
        pdfBuffer.slice(0),
        pageNumber,
        { wallColors, mmPerPx },
      );
      if (walls.length === 0) {
        throw new Error(
          "No walls measured. Check the wall colours and calibration.",
        );
      }
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
          Calibrate the scale by clicking two points a known distance apart
          (the scale bar is ideal), confirm the wall colours, then measure.
          Lengths come straight from the drawing's vector geometry.
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
            <div className="overflow-auto rounded-lg border bg-white">
              <canvas
                ref={canvasRef}
                onClick={onCanvasClick}
                className="block cursor-crosshair"
              />
            </div>

            <div className="space-y-5">
              <section className="rounded-lg border bg-card p-4">
                <h2 className="text-sm font-semibold">1 · Calibrate scale</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Click two points on the drawing, then enter the real
                  distance between them.
                </p>
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
                  {mmPerPx !== null && (
                    <p className="text-xs text-emerald-700">
                      Calibrated: 1 px = {mmPerPx.toFixed(2)} mm
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-lg border bg-card p-4">
                <h2 className="text-sm font-semibold">2 · Wall colours</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  One per line: hex colour, then the type label.
                </p>
                <Textarea
                  value={colorText}
                  onChange={(e) => setColorText(e.target.value)}
                  rows={4}
                  className="mt-2 font-mono text-xs"
                />
                <div className="mt-3 grid gap-1.5">
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
