import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Image as ImageIcon,
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
  distinctVectorColors,
  extractWallsFromPdfPage,
  fuseWallSemantics,
  measurePickedWalls,
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
  // 1.0 = "fit full sheet to viewport", anything > 1 enlarges the canvas so
  // the user can pan around it via the scroll container.
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
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
  const suppressClickRef = useRef(false);

  const [calibPoints, setCalibPoints] = useState<[number, number][]>([]);
  const [knownDist, setKnownDist] = useState("");
  const [scaleRatio, setScaleRatio] = useState("");
  const [mmPerPx, setMmPerPx] = useState<number | null>(null);
  const [snap, setSnap] = useState(true);
  // Click-two-points distance calibration is the default (most accurate).
  // The scale-ratio input is a fallback, revealed by `showRatio`.
  const [showRatio, setShowRatio] = useState(false);
  // Live cursor position (vector coords) while placing the second
  // calibration point — drives the rubber-band preview line.
  const [calibCursor, setCalibCursor] = useState<[number, number] | null>(null);

  const [wallTypes, setWallTypes] = useState<WallColorSpec[]>([]);
  const [picking, setPicking] = useState(false);
  const [scaleText, setScaleText] = useState("");
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiLots, setAiLots] = useState<AnalyzeLot[]>([]);
  const [aiRls, setAiRls] = useState<AnalyzeRl[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

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

  /** Release the pointer and, if the user actually dragged, suppress the
   *  follow-up click on the canvas so a pan past a wall doesn't pick it. */
  function onPanPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag?.moved) suppressClickRef.current = true;
    dragRef.current = null;
    setDragging(false);
    const el = scrollRef.current;
    if (el && el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
  }

  function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (suppressClickRef.current) {
      // The user just dragged — eat this click so they don't accidentally
      // pick a wall colour or drop a calibration point.
      suppressClickRef.current = false;
      return;
    }
    if (!vectors) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // Click in vector coords: the canvas renders the full sheet at
    // `displayScale`, origin at (0,0), so undoing the scale is enough.
    const cx = (e.clientX - rect.left) / displayScale;
    const cy = (e.clientY - rect.top) / displayScale;

    if (picking) {
      // Sample the colour of the wall line nearest the click.
      const hit = nearestPath(vectors.paths, cx, cy, 12 / displayScale);
      if (hit) addWallColor(hit.color.toLowerCase());
      return;
    }
    if (pickingPaths) {
      // Find the path nearest the click, then either pick the whole
      // connected run (default) or just this single path (Alt / Shift).
      const idx = nearestPathIndex(
        vectors.paths,
        cx,
        cy,
        12 / displayScale,
      );
      if (idx < 0) return;
      const singleOnly = e.altKey || e.shiftKey;
      togglePathPick(idx, singleOnly);
      return;
    }

    // Default action: distance calibration. Snap onto exact drawing
    // geometry (scale-bar ticks, wall corners) so the distance is precise,
    // not freehand.
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

  /** Track the cursor for the rubber-band preview line, but only while the
   *  user is placing the second calibration point (one point down so far,
   *  and not in a colour / path picking mode). */
  function onCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (picking || pickingPaths || calibPoints.length !== 1) {
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
                  onWheel={(e) => {
                    // Ctrl + wheel zooms (matches PDF readers / browsers).
                    if (!e.ctrlKey && !e.metaKey) return;
                    e.preventDefault();
                    const delta = e.deltaY > 0 ? 1 / 1.15 : 1.15;
                    setZoom((z) =>
                      Math.max(0.25, Math.min(8, +(z * delta).toFixed(3))),
                    );
                  }}
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
                    onClick={onCanvasClick}
                    onMouseMove={onCanvasMouseMove}
                    onMouseLeave={() => setCalibCursor(null)}
                    // Crosshair while picking, or while the scale isn't
                    // calibrated yet (clicking sets it). Once calibrated,
                    // the wrapper's grab cursor returns for panning.
                    className={
                      picking || pickingPaths || mmPerPx === null
                        ? "block cursor-crosshair"
                        : "block"
                    }
                  />
                </div>
              </div>
            </div>

            <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
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
                  Click two points a known distance apart on the drawing (a
                  scale bar is ideal), then enter that distance — the most
                  accurate way to calibrate.
                </p>

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
