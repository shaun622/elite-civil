import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DrawingViewer } from "@/components/review/DrawingViewer";
import { MeasurementTable } from "@/components/review/MeasurementTable";
import { HeightBandSummary } from "@/components/review/HeightBandSummary";
import { ExtractionMeta } from "@/components/review/ExtractionMeta";
import { WarningsPanel } from "@/components/review/WarningsPanel";
import { useReview } from "@/hooks/useReview";

export function ReviewPage() {
  const { projectId, pageId } = useParams<{
    projectId: string;
    pageId: string;
  }>();
  const review = useReview(pageId);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    null,
  );
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(
    null,
  );
  const [calibrating, setCalibrating] = useState(false);
  const [calibPoints, setCalibPoints] = useState<[number, number][]>([]);
  const [calibDistance, setCalibDistance] = useState("");
  const [drawingWall, setDrawingWall] = useState(false);
  const [wallPoints, setWallPoints] = useState<[number, number][]>([]);

  function startCalibration() {
    setCalibPoints([]);
    setCalibDistance("");
    setCalibrating(true);
  }
  function cancelCalibration() {
    setCalibrating(false);
    setCalibPoints([]);
  }
  function addCalibPoint(p: [number, number]) {
    setCalibPoints((prev) => (prev.length >= 2 ? [p] : [...prev, p]));
  }
  async function applyCalibration() {
    if (calibPoints.length !== 2) return;
    const metres = parseFloat(calibDistance);
    if (!Number.isFinite(metres) || metres <= 0) return;
    await review.recalibrateByDistance(calibPoints[0], calibPoints[1], metres);
    setCalibrating(false);
    setCalibPoints([]);
  }

  // Add a wall by hand — click two points on the drawing to place it.
  // Corners and refinements come afterwards via the vertex tools
  // (double-click the line to insert one, a handle to remove it).
  async function toggleAddWall() {
    setDrawingWall((d) => !d);
    setWallPoints([]);
  }

  async function addWallPoint(p: [number, number]) {
    if (wallPoints.length === 0) {
      setWallPoints([p]);
      return;
    }
    const p0 = wallPoints[0];
    setDrawingWall(false);
    setWallPoints([]);

    // Compute the length at placement time from the calibrated mm/px so the
    // new wall arrives with a real length, not a placeholder dash.
    const lengthPx = Math.hypot(p[0] - p0[0], p[1] - p0[1]);
    const raw = review.bundle?.extraction.raw_response;
    let lengthMm: number | null = null;
    if (raw && typeof raw === "object" && "mm_per_px" in raw) {
      const mm = (raw as Record<string, unknown>).mm_per_px;
      if (typeof mm === "number" && mm > 0) {
        lengthMm = Math.round(lengthPx * mm);
      }
    }

    const created = await review.addSegment({
      label: "New wall",
      polyline: [p0, p],
      length_mm: lengthMm,
    });
    if (created) setSelectedSegmentId(created.id);
  }

  // Keyboard shortcuts. Ignored while typing in a field, on a locked page,
  // or with a Ctrl/Cmd/Alt modifier held (so the browser's own shortcuts
  // still work normally).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!review.bundle || review.bundle.extraction.reviewed) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }

      // N — toggle add-a-wall draw mode.
      if (e.key === "n" || e.key === "N") {
        if (calibrating) return;
        e.preventDefault();
        setDrawingWall((d) => !d);
        setWallPoints([]);
        return;
      }

      // Delete / Backspace — same confirm + remove as the trash icon.
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!selectedSegmentId) return;
        if (calibrating || drawingWall) return;
        const seg = review.bundle.segments.find(
          (s) => s.id === selectedSegmentId,
        );
        if (!seg) return;
        e.preventDefault();
        if (confirm(`Delete segment "${seg.label ?? "(unlabeled)"}"?`)) {
          void review.removeSegment(selectedSegmentId);
          setSelectedSegmentId(null);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    selectedSegmentId,
    review.bundle,
    review.removeSegment,
    calibrating,
    drawingWall,
  ]);

  if (!projectId || !pageId) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main className="flex flex-1 flex-col px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            to={`/projects/${projectId}/drawings`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Drawings
          </Link>
          <Link
            to={`/projects/${projectId}/takeoff`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Done — back to Take Off →
          </Link>
        </div>

        {review.loading && (
          <div className="mt-6 h-[60vh] animate-pulse rounded-lg border bg-card" />
        )}

        {!review.loading && review.error && (
          <Alert variant="destructive" className="mt-6">
            <AlertDescription>{review.error}</AlertDescription>
          </Alert>
        )}

        {!review.loading && review.bundle && (
          <>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Page {review.bundle.page.page_number}
                </h1>
                <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {review.bundle.segments.length} wall segment
                    {review.bundle.segments.length === 1 ? "" : "s"}
                  </span>
                  <span>·</span>
                  <span>
                    {review.bundle.dimensions.length} dimension label
                    {review.bundle.dimensions.length === 1 ? "" : "s"}
                  </span>
                  {review.bundle.extraction.reviewed && (
                    <>
                      <span>·</span>
                      <Badge>Reviewed</Badge>
                    </>
                  )}
                </p>
              </div>

              {review.bundle.extraction.reviewed ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={review.reopen}
                >
                  <Unlock className="h-4 w-4" />
                  Reopen review
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="gap-2"
                  onClick={review.confirmReview}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Confirm &amp; lock
                </Button>
              )}
            </div>

            {review.actionError && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{review.actionError}</AlertDescription>
              </Alert>
            )}

            <div className="mt-4 grid flex-1 grid-cols-1 gap-4 lg:grid-cols-5">
              <div className="lg:col-span-3 lg:sticky lg:top-4 lg:self-start">
                {calibrating && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 p-3 text-xs">
                    <span className="font-medium text-violet-900">
                      {calibPoints.length < 2
                        ? `Click two points a known distance apart on the drawing — ${calibPoints.length}/2`
                        : "Enter the real distance between the two points:"}
                    </span>
                    {calibPoints.length === 2 && (
                      <>
                        <Input
                          value={calibDistance}
                          onChange={(e) => setCalibDistance(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void applyCalibration();
                          }}
                          placeholder="metres"
                          className="h-8 w-24"
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-8"
                          disabled={review.rescaling}
                          onClick={() => void applyCalibration()}
                        >
                          {review.rescaling ? "Applying…" : "Apply & rescale"}
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={cancelCalibration}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
                {drawingWall && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-purple-300 bg-purple-50 p-3 text-xs text-purple-900">
                    <span className="font-medium">
                      {wallPoints.length === 0
                        ? "Click the start of the wall on the drawing."
                        : "Now click the end of the wall."}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() => void toggleAddWall()}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
                <div className="h-[78vh] min-h-[480px] overflow-hidden rounded-lg border bg-[#1f2937]">
                  <DrawingViewer
                    imageUrl={review.imageUrl}
                    imageWidth={review.bundle.page.image_width}
                    imageHeight={review.bundle.page.image_height}
                    extraction={review.bundle.extraction}
                    dimensions={review.bundle.dimensions}
                    segments={review.bundle.segments}
                    selectedSegmentId={selectedSegmentId}
                    hoveredSegmentId={hoveredSegmentId}
                    locked={review.bundle.extraction.reviewed}
                    calibrating={calibrating}
                    calibPoints={calibPoints}
                    onSelectSegment={setSelectedSegmentId}
                    onHoverSegment={setHoveredSegmentId}
                    onSaveSegment={review.saveSegment}
                    onCalibrateClick={addCalibPoint}
                    drawingWall={drawingWall}
                    wallPoints={wallPoints}
                    onWallPointClick={addWallPoint}
                  />
                </div>
              </div>

              <div className="space-y-4 lg:col-span-2">
                <ExtractionMeta
                  extraction={review.bundle.extraction}
                  segmentCount={review.bundle.segments.length}
                  locked={review.bundle.extraction.reviewed}
                  rescaling={review.rescaling}
                  onRescale={review.rescale}
                  onCalibrate={startCalibration}
                />
                <WarningsPanel warnings={review.bundle.extraction.warnings} />
                {review.bundle.extraction.reviewed && (
                  <Alert>
                    <Lock className="h-4 w-4" />
                    <AlertDescription>
                      This page is locked. Reopen to edit measurements.
                    </AlertDescription>
                  </Alert>
                )}
                <MeasurementTable
                  segments={review.bundle.segments}
                  selectedSegmentId={selectedSegmentId}
                  hoveredSegmentId={hoveredSegmentId}
                  savingId={review.savingId}
                  locked={review.bundle.extraction.reviewed}
                  onSelect={setSelectedSegmentId}
                  onHover={setHoveredSegmentId}
                  onSave={review.saveSegment}
                  onAdd={toggleAddWall}
                  drawingWall={drawingWall}
                  onDelete={review.removeSegment}
                />
                <HeightBandSummary
                  segments={review.bundle.segments}
                  projectId={projectId}
                />
              </div>
            </div>
          </>
        )}
    </main>
  );
}
