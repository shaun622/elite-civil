import { useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
} from "react-konva";
import type Konva from "konva";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bboxToPixels, pointsToPixels } from "@/lib/coord";
import type {
  Bbox,
  DimensionLabel,
  Extraction,
  WallSegment,
  WallSegmentUpdate,
} from "@/types/db";

const COLOR_DIM = "#10b981"; // green
const COLOR_WALL = "#3b82f6"; // blue
const COLOR_SCALE = "#eab308"; // yellow
const COLOR_WARN = "#ef4444"; // red
const COLOR_USER = "#a855f7"; // purple

type LayerToggle = {
  dimensions: boolean;
  walls: boolean;
  scale: boolean;
};

type Props = {
  imageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  extraction: Extraction;
  dimensions: DimensionLabel[];
  segments: WallSegment[];
  selectedSegmentId: string | null;
  hoveredSegmentId: string | null;
  locked: boolean;
  calibrating: boolean;
  calibPoints: [number, number][];
  onSelectSegment: (id: string | null) => void;
  onHoverSegment: (id: string | null) => void;
  onSaveSegment: (
    segment: WallSegment,
    patch: WallSegmentUpdate,
  ) => Promise<void>;
  onCalibrateClick: (point: [number, number]) => void;
  drawingWall: boolean;
  wallPoints: [number, number][];
  onWallPointClick: (point: [number, number]) => void;
};

export function DrawingViewer({
  imageUrl,
  imageWidth,
  imageHeight,
  extraction,
  dimensions,
  segments,
  selectedSegmentId,
  hoveredSegmentId,
  locked,
  calibrating,
  calibPoints,
  onSelectSegment,
  onHoverSegment,
  onSaveSegment,
  onCalibrateClick,
  drawingWall,
  wallPoints,
  onWallPointClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [layers, setLayers] = useState<LayerToggle>({
    dimensions: true,
    walls: true,
    scale: true,
  });
  // Preview of where the second draw-wall click would land, so the user
  // sees the wall they're about to place rather than aiming blind.
  const [previewEnd, setPreviewEnd] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => setImage(img);
    img.onerror = () => setImage(null);
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [imageUrl]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const obs = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    });
    obs.observe(el);
    const rect = el.getBoundingClientRect();
    setContainerSize({ width: rect.width, height: rect.height });
    return () => obs.disconnect();
  }, []);

  const fitZoom = useMemo(() => {
    if (
      containerSize.width === 0 ||
      containerSize.height === 0 ||
      imageWidth === 0 ||
      imageHeight === 0
    ) {
      return 1;
    }
    return Math.min(
      containerSize.width / imageWidth,
      containerSize.height / imageHeight,
    );
  }, [containerSize, imageWidth, imageHeight]);

  // Auto-fit ONCE per image, the first time the container has a real
  // size — not on every fitZoom change. Re-fitting on each container
  // resize meant that anything nudging the layout (e.g. the "Add a
  // wall" / calibration banner appearing above the canvas, or a
  // scrollbar flickering in) would yank the user's zoom + pan back to
  // fit mid-task. The explicit "Fit to viewport" button still calls
  // fitToContainer directly.
  const fittedForRef = useRef<string>("");
  useEffect(() => {
    if (containerSize.width === 0 || containerSize.height === 0) return;
    if (imageWidth === 0 || imageHeight === 0) return;
    const key = `${imageWidth}x${imageHeight}`;
    if (fittedForRef.current === key) return;
    fittedForRef.current = key;
    fitToContainer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerSize, imageWidth, imageHeight]);

  // Click a wall row in the table -> pan the drawing to it, but only when
  // the wall is currently off-screen (so a click on the drawing itself
  // doesn't trigger an unwanted jump).
  useEffect(() => {
    if (!selectedSegmentId) return;
    if (containerSize.width === 0 || containerSize.height === 0) return;
    const seg = segments.find((s) => s.id === selectedSegmentId);
    if (!seg) return;
    const px = pointsToPixels(seg.polyline, imageWidth, imageHeight);
    if (px.length < 2) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i + 1 < px.length; i += 2) {
      if (px[i] < minX) minX = px[i];
      if (px[i] > maxX) maxX = px[i];
      if (px[i + 1] < minY) minY = px[i + 1];
      if (px[i + 1] > maxY) maxY = px[i + 1];
    }
    const viewMinX = -origin.x / zoom;
    const viewMinY = -origin.y / zoom;
    const viewMaxX = (containerSize.width - origin.x) / zoom;
    const viewMaxY = (containerSize.height - origin.y) / zoom;
    const overlaps = !(
      maxX < viewMinX ||
      minX > viewMaxX ||
      maxY < viewMinY ||
      minY > viewMaxY
    );
    if (overlaps) return;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setOrigin(
      clampOrigin({
        x: containerSize.width / 2 - cx * zoom,
        y: containerSize.height / 2 - cy * zoom,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSegmentId]);

  function fitToContainer() {
    setZoom(fitZoom);
    setOrigin({
      x: (containerSize.width - imageWidth * fitZoom) / 2,
      y: (containerSize.height - imageHeight * fitZoom) / 2,
    });
  }

  function zoomBy(factor: number) {
    setZoom((z) => Math.max(fitZoom * 0.5, Math.min(z * factor, 8)));
  }

  function zoomTo(value: number) {
    setZoom(value);
  }

  function onWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const factor = e.evt.deltaY < 0 ? 1.15 : 1 / 1.15;
    const oldScale = zoom;
    const newScale = Math.max(fitZoom * 0.5, Math.min(oldScale * factor, 8));
    const mousePointTo = {
      x: (pointer.x - origin.x) / oldScale,
      y: (pointer.y - origin.y) / oldScale,
    };
    setZoom(newScale);
    setOrigin({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }

  /**
   * Keep at least 80 px of image visible in every direction so the user
   * can never accidentally fling the drawing completely off-screen and
   * be left staring at the dark background with no way back.
   */
  function clampOrigin(o: { x: number; y: number }) {
    const margin = 80;
    const minX = containerSize.width - imageWidth * zoom - margin;
    const maxX = margin;
    const minY = containerSize.height - imageHeight * zoom - margin;
    const maxY = margin;
    // If the image is smaller than the viewport in this axis, lock to the
    // viewport edges so it can't be dragged outside it.
    return {
      x:
        imageWidth * zoom <= containerSize.width
          ? Math.max(0, Math.min(maxX, o.x))
          : Math.max(minX, Math.min(maxX, o.x)),
      y:
        imageHeight * zoom <= containerSize.height
          ? Math.max(0, Math.min(maxY, o.y))
          : Math.max(minY, Math.min(maxY, o.y)),
    };
  }

  function onDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    // Only the Stage's own pan moves the origin. Drag-end events bubble, so a
    // wall endpoint handle's drag also fires this — ignore those, or the
    // origin jumps to the handle's coords and flings the drawing off-screen.
    if (e.target !== stageRef.current) return;
    const next = clampOrigin({ x: e.target.x(), y: e.target.y() });
    // Snap the Konva stage to the clamped position so the on-screen view
    // matches what we just stored in React state.
    e.target.position(next);
    setOrigin(next);
  }

  const mmPerPx = readMmPerPx(extraction.raw_response);
  // Render the selected segment last so its drag handles sit above the
  // other walls' linework.
  const orderedSegments = useMemo(
    () =>
      [...segments].sort(
        (a, b) =>
          (a.id === selectedSegmentId ? 1 : 0) -
          (b.id === selectedSegmentId ? 1 : 0),
      ),
    [segments, selectedSegmentId],
  );

  if (containerSize.width === 0) {
    return (
      <div ref={containerRef} className="h-full min-h-[400px] w-full" />
    );
  }

  return (
    <div className="relative h-full w-full" ref={containerRef}>
      {!image && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {imageUrl ? "Loading drawing…" : "No image available"}
        </div>
      )}

      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
        x={origin.x}
        y={origin.y}
        scaleX={zoom}
        scaleY={zoom}
        draggable
        onWheel={onWheel}
        onDragEnd={onDragEnd}
        style={{
          background: "#1f2937",
          cursor: calibrating || drawingWall ? "crosshair" : undefined,
        }}
        onClick={(e) => {
          // Calibration / draw-wall clicks always do their own thing.
          if (calibrating || drawingWall) {
            const pointer = stageRef.current?.getPointerPosition();
            if (!pointer) return;
            const p: [number, number] = [
              (pointer.x - origin.x) / zoom,
              (pointer.y - origin.y) / zoom,
            ];
            if (calibrating) onCalibrateClick(p);
            else onWallPointClick(p);
            return;
          }
          // Plain click on empty drawing area deselects the open wall.
          // Doing this on `onClick` (post-mouseup) rather than `onMouseDown`
          // means a drag-pan doesn't race with the deselect's React render
          // and leave the Konva stage stuck at a stale origin — which used
          // to fling the drawing off-screen and show only the dark
          // background.
          if (e.target === stageRef.current) onSelectSegment(null);
        }}
        onMouseMove={() => {
          if (!drawingWall || wallPoints.length !== 1) {
            if (previewEnd !== null) setPreviewEnd(null);
            return;
          }
          const pointer = stageRef.current?.getPointerPosition();
          if (!pointer) return;
          setPreviewEnd([
            (pointer.x - origin.x) / zoom,
            (pointer.y - origin.y) / zoom,
          ]);
        }}
        onMouseLeave={() => setPreviewEnd(null)}
      >
        <Layer listening={false}>
          {image && (
            <KonvaImage image={image} width={imageWidth} height={imageHeight} />
          )}
        </Layer>

        <Layer>
          {layers.scale && extraction.scale_bbox && (
            <BboxRect
              bbox={extraction.scale_bbox}
              imageWidth={imageWidth}
              imageHeight={imageHeight}
              stroke={COLOR_SCALE}
              dash={[8, 4]}
            />
          )}

          {layers.dimensions &&
            dimensions.map((dim) => (
              <BboxRect
                key={dim.id}
                bbox={dim.bbox}
                imageWidth={imageWidth}
                imageHeight={imageHeight}
                stroke={COLOR_DIM}
                opacity={0.85}
              />
            ))}

          {layers.walls &&
            orderedSegments.map((seg) => {
              const selected = seg.id === selectedSegmentId;
              const hovered = seg.id === hoveredSegmentId;
              const color = seg.user_added ? COLOR_USER : COLOR_WALL;
              const polylinePx = pointsToPixels(
                seg.polyline,
                imageWidth,
                imageHeight,
              );
              return (
                <SegmentOverlay
                  key={seg.id}
                  segment={seg}
                  polylinePx={polylinePx}
                  imageWidth={imageWidth}
                  imageHeight={imageHeight}
                  color={color}
                  selected={selected}
                  hovered={hovered}
                  editable={selected && !locked && !calibrating && !drawingWall}
                  zoom={zoom}
                  mmPerPx={mmPerPx}
                  onClick={() => {
                    if (!calibrating && !drawingWall) onSelectSegment(seg.id);
                  }}
                  onHoverEnter={() => onHoverSegment(seg.id)}
                  onHoverLeave={() => onHoverSegment(null)}
                  onSaveGeometry={(polyline, lengthMm) =>
                    void onSaveSegment(seg, {
                      polyline,
                      length_mm: lengthMm,
                    })
                  }
                />
              );
            })}

          {calibrating && calibPoints.length === 2 && (
            <Line
              points={[
                calibPoints[0][0],
                calibPoints[0][1],
                calibPoints[1][0],
                calibPoints[1][1],
              ]}
              stroke="#7c3aed"
              strokeWidth={1.5 / zoom}
              dash={[6 / zoom, 4 / zoom]}
              listening={false}
            />
          )}
          {calibrating &&
            calibPoints.map(([cx, cy], i) => {
              // A thin full-height tick so the click can be aligned exactly
              // against a scale-bar mark — far more precise than a dot.
              const half = 30 / zoom;
              return (
                <Group key={`cal-${i}`} listening={false}>
                  <Line
                    points={[cx, cy - half, cx, cy + half]}
                    stroke="#ffffff"
                    strokeWidth={4 / zoom}
                  />
                  <Line
                    points={[cx, cy - half, cx, cy + half]}
                    stroke="#7c3aed"
                    strokeWidth={1.5 / zoom}
                  />
                </Group>
              );
            })}

          {drawingWall &&
            wallPoints.map(([px, py], i) => (
              <Circle
                key={`wp-${i}`}
                x={px}
                y={py}
                radius={6 / zoom}
                fill={COLOR_USER}
                stroke="#ffffff"
                strokeWidth={2 / zoom}
                listening={false}
              />
            ))}
          {drawingWall && wallPoints.length === 1 && previewEnd && (
            <Line
              points={[
                wallPoints[0][0],
                wallPoints[0][1],
                previewEnd[0],
                previewEnd[1],
              ]}
              stroke={COLOR_USER}
              strokeWidth={2 / zoom}
              dash={[8 / zoom, 6 / zoom]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute right-3 top-3 flex flex-col gap-2">
          <div className="flex items-center gap-1 rounded-md border bg-background/95 p-1 shadow-sm backdrop-blur-sm">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => zoomBy(1 / 1.25)}
              title="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <button
              type="button"
              onClick={() => zoomTo(1)}
              title="Reset to 100%"
              className="min-w-[3rem] rounded px-1.5 text-xs font-medium tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {Math.round(zoom * 100)}%
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => zoomBy(1.25)}
              title="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <span className="mx-1 h-4 w-px bg-border" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={fitToContainer}
              title="Fit drawing to viewport"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="rounded-md border bg-background/95 p-2 text-xs shadow-sm">
            <p className="mb-1.5 font-medium">Layers</p>
            <LayerCheckbox
              label="Dimensions"
              color={COLOR_DIM}
              checked={layers.dimensions}
              onChange={(v) =>
                setLayers((s) => ({ ...s, dimensions: v }))
              }
            />
            <LayerCheckbox
              label="Walls"
              color={COLOR_WALL}
              checked={layers.walls}
              onChange={(v) => setLayers((s) => ({ ...s, walls: v }))}
            />
            <LayerCheckbox
              label="Scale"
              color={COLOR_SCALE}
              checked={layers.scale}
              onChange={(v) => setLayers((s) => ({ ...s, scale: v }))}
            />
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
          {Math.round(zoom * 100)}%
        </div>
      </div>
    </div>
  );
}

function LayerCheckbox({
  label,
  color,
  checked,
  onChange,
}: {
  label: string;
  color: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-0.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer"
      />
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: color, opacity: checked ? 1 : 0.3 }}
      />
      <span
        className={
          checked ? "font-medium text-foreground" : "text-muted-foreground"
        }
      >
        {label}
      </span>
    </label>
  );
}

function BboxRect({
  bbox,
  imageWidth,
  imageHeight,
  stroke,
  dash,
  opacity = 1,
}: {
  bbox: Bbox;
  imageWidth: number;
  imageHeight: number;
  stroke: string;
  dash?: number[];
  opacity?: number;
}) {
  const r = bboxToPixels(bbox, imageWidth, imageHeight);
  return (
    <Rect
      x={r.x}
      y={r.y}
      width={r.width}
      height={r.height}
      stroke={stroke}
      strokeWidth={Math.max(2, Math.min(imageWidth, imageHeight) / 600)}
      dash={dash}
      opacity={opacity}
    />
  );
}

function clampNum(v: number, max: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(max, v));
}

/** Total length of a flat [x0,y0,x1,y1,...] point array, in pixels. */
function flatPolylineLength(pts: number[]): number {
  let total = 0;
  for (let k = 2; k + 1 < pts.length; k += 2) {
    total += Math.hypot(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]);
  }
  return total;
}

function flatToPairs(flat: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k + 1 < flat.length; k += 2) {
    out.push([flat[k], flat[k + 1]]);
  }
  return out;
}

/** Insert a vertex on the polyline at the point on it nearest (px,py). */
function insertPointInPolyline(
  flat: number[],
  px: number,
  py: number,
): number[] {
  if (flat.length < 4) return flat.slice();
  let bestAfter = 0;
  let bestD = Infinity;
  let bestX = px;
  let bestY = py;
  for (let k = 0; k + 3 < flat.length; k += 2) {
    const ax = flat[k];
    const ay = flat[k + 1];
    const bx = flat[k + 2];
    const by = flat[k + 3];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    if (d < bestD) {
      bestD = d;
      bestAfter = k / 2;
      bestX = cx;
      bestY = cy;
    }
  }
  const out = flat.slice();
  out.splice((bestAfter + 1) * 2, 0, bestX, bestY);
  return out;
}

/** The vector pipeline records mm-per-pixel on the extraction, so a dragged
 *  wall's length can be recomputed exactly from its new geometry. */
function readMmPerPx(raw: unknown): number | null {
  if (raw && typeof raw === "object" && "mm_per_px" in raw) {
    const v = (raw as Record<string, unknown>).mm_per_px;
    if (typeof v === "number" && v > 0) return v;
  }
  return null;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A thin sighting crosshair drawn at a wall endpoint while it is dragged —
 *  an open centre so the exact target pixel stays visible. */
function Crosshair({ x, y, zoom }: { x: number; y: number; zoom: number }) {
  const gap = 3 / zoom;
  const arm = 15 / zoom;
  const segs = [
    [x - gap - arm, y, x - gap, y],
    [x + gap, y, x + gap + arm, y],
    [x, y - gap - arm, x, y - gap],
    [x, y + gap, x, y + gap + arm],
  ];
  return (
    <>
      {segs.map((pts, i) => (
        <Line
          key={`h${i}`}
          points={pts}
          stroke="#ffffff"
          strokeWidth={4 / zoom}
          listening={false}
        />
      ))}
      {segs.map((pts, i) => (
        <Line
          key={`c${i}`}
          points={pts}
          stroke="#7c3aed"
          strokeWidth={1.5 / zoom}
          listening={false}
        />
      ))}
    </>
  );
}

function SegmentOverlay({
  segment,
  polylinePx,
  imageWidth,
  imageHeight,
  color,
  selected,
  hovered,
  editable,
  zoom,
  mmPerPx,
  onClick,
  onHoverEnter,
  onHoverLeave,
  onSaveGeometry,
}: {
  segment: WallSegment;
  polylinePx: number[];
  imageWidth: number;
  imageHeight: number;
  color: string;
  selected: boolean;
  hovered: boolean;
  editable: boolean;
  zoom: number;
  mmPerPx: number | null;
  onClick: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onSaveGeometry: (
    polyline: [number, number][],
    lengthMm: number | null,
  ) => void;
}) {
  const emphasized = selected || hovered;
  // While an endpoint is dragged we preview the new polyline locally; once
  // the saved geometry round-trips back via `segment.polyline` we drop it.
  const [drag, setDrag] = useState<number[] | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  useEffect(() => {
    setDrag(null);
  }, [segment.polyline]);

  const livePx = drag ?? polylinePx;
  const minEdge = Math.min(imageWidth, imageHeight);
  const strokeWidth = emphasized
    ? Math.max(minEdge / 280, 4)
    : Math.max(minEdge / 620, 2.2);
  const handleRadius = 7 / zoom;

  function commitGeometry(next: number[]) {
    setDrag(next);
    const newPxLen = flatPolylineLength(next);
    let lengthMm: number | null;
    if (mmPerPx != null) {
      lengthMm = Math.round(newPxLen * mmPerPx);
    } else if (segment.length_mm != null) {
      const oldPxLen = flatPolylineLength(polylinePx);
      lengthMm =
        oldPxLen > 0
          ? Math.round(segment.length_mm * (newPxLen / oldPxLen))
          : segment.length_mm;
    } else {
      lengthMm = null;
    }
    onSaveGeometry(flatToPairs(next), lengthMm);
  }

  function commitDrag(index: number, x: number, y: number) {
    const next = [...polylinePx];
    next[index * 2] = clampNum(x, imageWidth);
    next[index * 2 + 1] = clampNum(y, imageHeight);
    commitGeometry(next);
  }

  /** Double-click the wall line to add a vertex there. */
  function insertVertex(px: number, py: number) {
    commitGeometry(
      insertPointInPolyline(
        polylinePx,
        clampNum(px, imageWidth),
        clampNum(py, imageHeight),
      ),
    );
  }

  /** Double-click a handle to remove that vertex (a wall keeps ≥ 2). */
  function deleteVertex(index: number) {
    if (polylinePx.length <= 4) return;
    const next = polylinePx.slice();
    next.splice(index * 2, 2);
    commitGeometry(next);
  }

  // When editable, fade the line toward its ends so the wall underneath
  // stays visible where the handles are; solid through the middle.
  const gradStart = { x: livePx[0], y: livePx[1] };
  const gradEnd = {
    x: livePx[livePx.length - 2],
    y: livePx[livePx.length - 1],
  };
  const [cr, cg, cb] = hexToRgb(color);
  const coloredStops = editable
    ? [
        0, `rgba(${cr},${cg},${cb},0.1)`,
        0.22, `rgba(${cr},${cg},${cb},1)`,
        0.78, `rgba(${cr},${cg},${cb},1)`,
        1, `rgba(${cr},${cg},${cb},0.1)`,
      ]
    : undefined;
  const haloStops = editable
    ? [
        0, "rgba(255,255,255,0)",
        0.22, "rgba(255,255,255,0.9)",
        0.78, "rgba(255,255,255,0.9)",
        1, "rgba(255,255,255,0)",
      ]
    : undefined;

  const dragPoint =
    draggingIndex != null && livePx.length >= (draggingIndex + 1) * 2
      ? { x: livePx[draggingIndex * 2], y: livePx[draggingIndex * 2 + 1] }
      : null;

  return (
    <>
      {livePx.length >= 4 && (
        <>
          <Line
            points={livePx}
            stroke="#ffffff"
            opacity={editable ? 1 : emphasized ? 0.95 : 0.6}
            strokeLinearGradientStartPoint={editable ? gradStart : undefined}
            strokeLinearGradientEndPoint={editable ? gradEnd : undefined}
            strokeLinearGradientColorStops={haloStops}
            strokeWidth={strokeWidth + (emphasized ? 5 : 3)}
            lineCap="butt"
            lineJoin="round"
            listening={false}
          />
          <Line
            points={livePx}
            stroke={color}
            opacity={editable ? 1 : emphasized ? 1 : 0.9}
            strokeLinearGradientStartPoint={editable ? gradStart : undefined}
            strokeLinearGradientEndPoint={editable ? gradEnd : undefined}
            strokeLinearGradientColorStops={coloredStops}
            strokeWidth={strokeWidth}
            lineCap="butt"
            lineJoin="round"
            onClick={onClick}
            onTap={onClick}
            onDblClick={(e) => {
              if (!editable) return;
              const p = e.target.getRelativePointerPosition();
              if (p) insertVertex(p.x, p.y);
            }}
            onMouseEnter={onHoverEnter}
            onMouseLeave={onHoverLeave}
            hitStrokeWidth={Math.max(strokeWidth * 3, 16)}
          />
          {editable &&
            flatToPairs(livePx).map(([hx, hy], i) => (
              <Circle
                key={i}
                x={hx}
                y={hy}
                radius={handleRadius}
                fill="#ffffff"
                stroke={color}
                strokeWidth={2 / zoom}
                opacity={draggingIndex === i ? 0.55 : 1}
                draggable
                onMouseDown={(e) => {
                  e.cancelBubble = true;
                }}
                onDblClick={(e) => {
                  e.cancelBubble = true;
                  deleteVertex(i);
                }}
                onDragStart={() => setDraggingIndex(i)}
                onDragMove={(e) => {
                  const next = [...livePx];
                  next[i * 2] = e.target.x();
                  next[i * 2 + 1] = e.target.y();
                  setDrag(next);
                }}
                onDragEnd={(e) => {
                  commitDrag(i, e.target.x(), e.target.y());
                  setDraggingIndex(null);
                }}
              />
            ))}
          {dragPoint && (
            <Crosshair x={dragPoint.x} y={dragPoint.y} zoom={zoom} />
          )}
        </>
      )}
      {segment.label_bbox && (
        <>
          <BboxRect
            bbox={segment.label_bbox}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            stroke={color}
            opacity={emphasized ? 1 : 0.4}
          />
          {segment.label && (
            <SegmentLabelText
              bbox={segment.label_bbox}
              imageWidth={imageWidth}
              imageHeight={imageHeight}
              text={segment.label}
              color={color}
            />
          )}
        </>
      )}
    </>
  );
}

function SegmentLabelText({
  bbox,
  imageWidth,
  imageHeight,
  text,
  color,
}: {
  bbox: Bbox;
  imageWidth: number;
  imageHeight: number;
  text: string;
  color: string;
}) {
  const r = bboxToPixels(bbox, imageWidth, imageHeight);
  const size = Math.max(
    12,
    Math.min(28, Math.min(imageWidth, imageHeight) / 60),
  );
  return (
    <Text
      x={r.x}
      y={r.y - size - 2}
      text={text}
      fontSize={size}
      fontStyle="bold"
      fill={color}
      shadowColor="#000"
      shadowBlur={3}
      shadowOpacity={0.6}
    />
  );
}

// Re-export to keep the warnings-colour constant accessible to consumers that
// want to colour-match warnings/UI elements.
export const REVIEW_COLORS = {
  dim: COLOR_DIM,
  wall: COLOR_WALL,
  scale: COLOR_SCALE,
  warn: COLOR_WARN,
  user: COLOR_USER,
};

export type { LayerToggle };
