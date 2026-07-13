import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Lock,
  MousePointerClick,
  Printer,
  Unlock,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DrawingViewer } from "@/components/review/DrawingViewer";
import { MeasurementTable } from "@/components/review/MeasurementTable";
import {
  HeightBandSummary,
  BandSummaryTable,
} from "@/components/review/HeightBandSummary";
import { ExtractionMeta } from "@/components/review/ExtractionMeta";
import { WarningsPanel } from "@/components/review/WarningsPanel";
import { useReview } from "@/hooks/useReview";
import { useProject } from "@/hooks/useProjects";
import { getEffectiveConfig } from "@/lib/engine/adapter";
import {
  BAND_COLORS,
  bandColor,
  bandLabel,
  computeHeightBands,
  resolveBandEdges,
} from "@/lib/engine/heightBands";
import { embedmentOpts } from "@/lib/engine/calculations";
import { expandSegmentsByPricingBands } from "@/lib/engine/wallSections";
import { readRlsFromCrop } from "@/lib/api/readRls";
import type { RlPair } from "@/types/db";

export function ReviewPage() {
  const { projectId, pageId } = useParams<{
    projectId: string;
    pageId: string;
  }>();
  const review = useReview(pageId);
  const { project } = useProject(projectId);
  const config = getEffectiveConfig(project);
  // Client-facing drawing view toggles (ephemeral — not persisted).
  const [bandColorsOn, setBandColorsOn] = useState(false);
  const [sectionsOn, setSectionsOn] = useState(true);
  const [badgesOn, setBadgesOn] = useState(false);
  const [bwDrawingOn, setBwDrawingOn] = useState(false);
  const [printSnapshot, setPrintSnapshot] = useState<string | null>(null);
  const snapshotFnRef = useRef<(() => string | null) | null>(null);
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
  // Lot the wall being drawn should join (set by a group's "Add a wall").
  const [pendingAddLot, setPendingAddLot] = useState<string | null>(null);
  // "Grab RLs" marquee mode + the OCR result awaiting confirmation.
  const [grabbingRls, setGrabbingRls] = useState(false);
  const [rlReading, setRlReading] = useState(false);
  // Every number the OCR read in the box, and the (up to two) the user has
  // chosen as the top/bottom pair. When the box reads exactly two we
  // pre-select both; when it reads more, the user picks which two.
  const [rlNumbers, setRlNumbers] = useState<number[] | null>(null);
  const [rlSelected, setRlSelected] = useState<number[]>([]);
  // Default assigns the higher number as top; swap flips it for the times the
  // top-of-wall RL is actually the lower figure.
  const [rlSwap, setRlSwap] = useState(false);
  // Append the pair (default) or replace the wall's existing RLs.
  const [rlReplace, setRlReplace] = useState(false);
  const [rlError, setRlError] = useState<string | null>(null);

  /** Top/bottom from the two picked numbers, honouring the swap toggle. */
  function rlTopBottom(): { top: number; bottom: number } | null {
    if (rlSelected.length !== 2) return null;
    const hi = Math.max(rlSelected[0], rlSelected[1]);
    const lo = Math.min(rlSelected[0], rlSelected[1]);
    return rlSwap ? { top: lo, bottom: hi } : { top: hi, bottom: lo };
  }

  function resetRlGrab() {
    setRlNumbers(null);
    setRlSelected([]);
    setRlSwap(false);
    setRlReplace(false);
    setRlError(null);
  }

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
  function toggleAddWall(lot: string | null = null) {
    if (drawingWall) {
      setDrawingWall(false);
    } else {
      setPendingAddLot(lot);
      setDrawingWall(true);
    }
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
      lot: pendingAddLot,
    });
    if (created) setSelectedSegmentId(created.id);
  }

  // --- "Grab RLs" — OCR a boxed region for the selected wall's RLs -------
  function toggleGrabRls() {
    resetRlGrab();
    setDrawingWall(false);
    setCalibrating(false);
    setGrabbingRls((g) => !g);
  }

  /** A marquee crop arrived from the viewer — OCR it and stage the numbers. */
  async function onRlCrop(base64: string) {
    setGrabbingRls(false);
    resetRlGrab();
    setRlReading(true);
    try {
      const numbers = await readRlsFromCrop(base64);
      if (numbers.length < 2) {
        setRlError(
          numbers.length === 1
            ? `Only read one number (${numbers[0]}). Box both the top and bottom RL.`
            : "Couldn't read two numbers in that box. Try again, tighter around the two RLs.",
        );
        return;
      }
      setRlNumbers(numbers);
      // Exactly two read → auto-select both. More → let the user pick which two.
      setRlSelected(numbers.length === 2 ? [...numbers] : []);
    } catch (err) {
      setRlError(err instanceof Error ? err.message : "Couldn't read the RLs.");
    } finally {
      setRlReading(false);
    }
  }

  /** Toggle a read number in/out of the chosen top/bottom pair (max two —
   *  choosing a third drops the oldest). */
  function toggleRlPick(n: number) {
    setRlSelected((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= 2) return [prev[1], n];
      return [...prev, n];
    });
  }

  /** Apply the chosen RL pair to the selected wall — appended, or replacing
   *  the wall's existing RLs when "Replace" is ticked. */
  async function applyRlPair() {
    const tb = rlTopBottom();
    if (!tb || !review.bundle) return;
    const seg = review.bundle.segments.find((s) => s.id === selectedSegmentId);
    if (!seg) return;
    const newPair: RlPair = { top: tb.top, bottom: tb.bottom };
    const pairs: RlPair[] = rlReplace
      ? [newPair]
      : [...(seg.rl_pairs ?? []), newPair];
    // Effective height tracks the RL average unless a manual override is set.
    const avgMm =
      pairs.length > 0
        ? Math.round(
            (pairs.reduce((s, p) => s + (p.top - p.bottom), 0) / pairs.length) *
              1000,
          )
        : null;
    const heightMm = seg.height_override_mm ?? avgMm;
    await review.saveSegment(seg, { rl_pairs: pairs, height_mm: heightMm });
    resetRlGrab();
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
        if (drawingWall) {
          setDrawingWall(false);
        } else {
          setPendingAddLot(null);
          setDrawingWall(true);
        }
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

  // Name of the wall the RL grab will be applied to, for the panel's labels.
  const selectedWallName =
    review.bundle?.segments
      .find((s) => s.id === selectedSegmentId)
      ?.label?.trim() || "this wall";

  const edges = useMemo(() => resolveBandEdges(config), [config]);
  const roundOpts = useMemo(() => embedmentOpts(config), [config]);
  const bandView = bandColorsOn
    ? { edges, roundOpts, colors: BAND_COLORS, sections: sectionsOn }
    : null;

  const segments = review.bundle?.segments ?? [];
  // Band table for the printout — counts sections when the sections toggle is
  // on, so the printed summary matches exactly what the drawing shows.
  const printBands = useMemo(
    () =>
      computeHeightBands(
        sectionsOn ? expandSegmentsByPricingBands(segments, config) : segments,
        edges,
        roundOpts,
      ),
    [segments, sectionsOn, config, edges, roundOpts],
  );

  function handlePrintSummary() {
    setPrintSnapshot(snapshotFnRef.current?.() ?? "");
  }
  // Once the snapshot is captured (and rendered into the print section), fire
  // the browser print dialog, then clear it when printing finishes.
  useEffect(() => {
    if (printSnapshot == null) return;
    const done = () => setPrintSnapshot(null);
    window.addEventListener("afterprint", done);
    const t = window.setTimeout(() => window.print(), 150);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [printSnapshot]);

  return (
    <>
    <main className="flex flex-1 flex-col px-6 py-6 print:hidden">
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
            Done. Back to Take Off →
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

              <div className="flex flex-wrap items-center gap-2">
                {/* Failsafe save-and-leave. Everything autosaves, but clicking
                    this first blurs (and so commits) any focused field, then
                    navigates to Take Off. */}
                <Button
                  asChild
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Link to={`/projects/${projectId}/takeoff`}>
                    Save &amp; go to Take Off
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>

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
                        ? `Click two points a known distance apart on the drawing (${calibPoints.length}/2)`
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
                    <span className="flex flex-wrap items-center gap-1.5 font-medium">
                      {pendingAddLot && (
                        <span className="rounded bg-purple-200 px-1.5 py-0.5">
                          Adding to {pendingAddLot}
                        </span>
                      )}
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

                {/* Grab RLs — available once a wall is selected (and the page
                    isn't locked). Box the two level numbers for one wall end;
                    we OCR the crop and stage the pair for confirmation. */}
                {selectedSegmentId &&
                  !review.bundle.extraction.reviewed &&
                  !calibrating &&
                  !drawingWall && (
                    <div className="mb-2 space-y-2">
                      {!grabbingRls && !rlReading && !rlNumbers && !rlError && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5"
                            onClick={toggleGrabRls}
                          >
                            <MousePointerClick className="h-3.5 w-3.5" />
                            Grab RLs from drawing
                          </Button>
                          <span className="text-[11px] text-muted-foreground">
                            Box the top + bottom level numbers for this wall.
                            We read them and set the height.
                          </span>
                        </div>
                      )}

                      {grabbingRls && (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 p-3 text-xs text-violet-900">
                          <span className="font-medium">
                            Drag a box over the two RL numbers (top &amp; bottom)
                            for this wall.
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8"
                            onClick={() => setGrabbingRls(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}

                      {rlReading && (
                        <div className="flex items-center gap-2 rounded-lg border bg-card p-3 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Reading the numbers…
                        </div>
                      )}

                      {rlError && !rlReading && (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                          <span>{rlError}</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8"
                            onClick={toggleGrabRls}
                          >
                            Try again
                          </Button>
                          <button
                            type="button"
                            onClick={() => setRlError(null)}
                            className="text-amber-700 hover:text-amber-900"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                      {rlNumbers && !rlReading && (
                        <div className="space-y-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">
                              {rlNumbers.length > 2
                                ? "Pick the two levels (top & bottom):"
                                : "Read:"}
                            </span>
                            {rlNumbers.map((n, i) => {
                              const on = rlSelected.includes(n);
                              return (
                                <button
                                  key={`${n}-${i}`}
                                  type="button"
                                  onClick={() => toggleRlPick(n)}
                                  className={`rounded border px-2 py-0.5 tabular-nums transition-colors ${
                                    on
                                      ? "border-emerald-600 bg-emerald-600 text-white"
                                      : "border-emerald-300 bg-white text-emerald-900 hover:border-emerald-500"
                                  }`}
                                >
                                  {n}
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {(() => {
                              const tb = rlTopBottom();
                              if (!tb) {
                                return (
                                  <span className="text-emerald-700">
                                    Select two numbers.
                                  </span>
                                );
                              }
                              const h = tb.top - tb.bottom;
                              return (
                                <>
                                  <span>
                                    top {tb.top}, bottom {tb.bottom}, height{" "}
                                    <span
                                      className={`font-semibold ${h < 0 ? "text-amber-700" : ""}`}
                                    >
                                      {h.toFixed(2)} m
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setRlSwap((s) => !s)}
                                    className="rounded border border-emerald-300 bg-white px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:border-emerald-500"
                                  >
                                    Swap top/bottom
                                  </button>
                                  {h < 0 && (
                                    <span className="text-[11px] text-amber-700">
                                      negative, swap?
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          </div>

                          <label className="flex items-center gap-2 border-y border-emerald-200 py-2.5">
                            <input
                              type="checkbox"
                              checked={rlReplace}
                              onChange={(e) => setRlReplace(e.target.checked)}
                              className="h-3.5 w-3.5 accent-emerald-600"
                            />
                            Replace {selectedWallName} RLs
                          </label>

                          <div className="flex items-center gap-2 pt-0.5">
                            <Button
                              type="button"
                              size="sm"
                              className="h-8"
                              disabled={rlSelected.length !== 2}
                              onClick={() => void applyRlPair()}
                            >
                              {rlReplace ? "Apply (replace)" : "Apply (add)"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8"
                              onClick={() => {
                                resetRlGrab();
                                setGrabbingRls(true);
                              }}
                            >
                              Redo
                            </Button>
                            <button
                              type="button"
                              onClick={resetRlGrab}
                              className="text-emerald-700 hover:text-emerald-900"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                <div className="h-[60vh] min-h-[360px] overflow-hidden rounded-lg border bg-[#1f2937] sm:h-[78vh] sm:min-h-[480px]">
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
                    grabbingRls={grabbingRls}
                    onRlCrop={onRlCrop}
                    bandView={bandView}
                    badges={badgesOn}
                    grayscale={bwDrawingOn}
                    snapshotFnRef={snapshotFnRef}
                    bandMeta={{ edges, roundOpts }}
                    toolbar={
                      <>
                        <ToggleChip
                          active={bandColorsOn}
                          onClick={() => setBandColorsOn((v) => !v)}
                        >
                          Height colours
                        </ToggleChip>
                        <ToggleChip
                          active={sectionsOn}
                          disabled={!bandColorsOn}
                          onClick={() => setSectionsOn((v) => !v)}
                        >
                          Sections
                        </ToggleChip>
                        <ToggleChip
                          active={badgesOn}
                          onClick={() => setBadgesOn((v) => !v)}
                        >
                          Badges · length &amp; m²
                        </ToggleChip>
                        <ToggleChip
                          active={bwDrawingOn}
                          onClick={() => setBwDrawingOn((v) => !v)}
                        >
                          B&amp;W drawing
                        </ToggleChip>
                        <span className="mx-0.5 h-4 w-px bg-border" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1.5 px-2 text-xs"
                          onClick={handlePrintSummary}
                        >
                          <Printer className="h-3.5 w-3.5" />
                          Print summary
                        </Button>
                      </>
                    }
                  />
                </div>

                {bandColorsOn && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground print:hidden">
                    <span className="font-medium text-foreground">Height:</span>
                    {Array.from({ length: edges.length + 1 }, (_, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5">
                        {/* SVG chip (not a CSS background) so it also prints. */}
                        <svg
                          viewBox="0 0 10 10"
                          className="h-2.5 w-2.5"
                          aria-hidden
                        >
                          <rect width="10" height="10" rx="2" fill={bandColor(i)} />
                        </svg>
                        {bandLabel(i, edges)}
                      </span>
                    ))}
                    {sectionsOn && (
                      <span className="italic">
                        walls that span bands are shown in parts
                      </span>
                    )}
                  </div>
                )}
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
                  config={config}
                  selectedSegmentId={selectedSegmentId}
                  hoveredSegmentId={hoveredSegmentId}
                  savingId={review.savingId}
                  locked={review.bundle.extraction.reviewed}
                  onSelect={setSelectedSegmentId}
                  onHover={setHoveredSegmentId}
                  onSave={review.saveSegment}
                  onAdd={toggleAddWall}
                  onReorder={review.reorderSegments}
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

    {/* Print-only client summary: the drawing as framed + the band table. */}
    {review.bundle && (
      <div className="hidden p-6 print:block">
        <div className="text-xl font-bold">
          {project?.name ?? "Retaining walls"}
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Page {review.bundle.page.page_number}: walls by height
          {project?.client_name ? ` · ${project.client_name}` : ""}
        </p>
        {printSnapshot && (
          <img
            src={printSnapshot}
            alt="Drawing with walls coloured by height"
            className="mb-4 w-full rounded border"
          />
        )}
        <h2 className="mb-1 text-base font-semibold">
          Summary by height band
        </h2>
        <BandSummaryTable
          bands={printBands.bands}
          noHeight={printBands.noHeight}
          totals={printBands.totals}
          colors={BAND_COLORS}
        />
        {printBands.noHeight.count > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {printBands.noHeight.count} wall
            {printBands.noHeight.count === 1 ? "" : "s"} without a set height
            are excluded from the area totals.
          </p>
        )}
      </div>
    )}
    </>
  );
}

function ToggleChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        disabled ? "cursor-not-allowed opacity-40 " : ""
      }${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
