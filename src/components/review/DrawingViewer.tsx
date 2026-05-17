import { useEffect, useMemo, useRef, useState } from "react";
import { Image as KonvaImage, Layer, Line, Rect, Stage, Text } from "react-konva";
import type Konva from "konva";
import { Maximize2, Minus, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bboxToPixels, pointsToPixels } from "@/lib/coord";
import type {
  Bbox,
  DimensionLabel,
  Extraction,
  WallSegment,
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
  onSelectSegment: (id: string | null) => void;
  onHoverSegment: (id: string | null) => void;
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
  onSelectSegment,
  onHoverSegment,
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

  useEffect(() => {
    fitToContainer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitZoom]);

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

  function onDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    setOrigin({ x: e.target.x(), y: e.target.y() });
  }

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
        style={{ background: "#1f2937" }}
        onMouseDown={(e) => {
          if (e.target === stageRef.current) onSelectSegment(null);
        }}
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
            segments.map((seg) => {
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
                  onClick={() => onSelectSegment(seg.id)}
                  onHoverEnter={() => onHoverSegment(seg.id)}
                  onHoverLeave={() => onHoverSegment(null)}
                />
              );
            })}
        </Layer>
      </Stage>

      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute right-3 top-3 flex flex-col gap-2">
          <div className="flex gap-1 rounded-md border bg-background/95 p-1 shadow-sm">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => zoomBy(1 / 1.25)}
              title="Zoom out"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => zoomBy(1.25)}
              title="Zoom in"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={fitToContainer}
              title="Fit to view"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => zoomTo(1)}
              title="Actual size (100%)"
            >
              <RefreshCw className="h-4 w-4" />
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
        className="h-3 w-3"
      />
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: color }}
      />
      <span>{label}</span>
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

function SegmentOverlay({
  segment,
  polylinePx,
  imageWidth,
  imageHeight,
  color,
  selected,
  hovered,
  onClick,
  onHoverEnter,
  onHoverLeave,
}: {
  segment: WallSegment;
  polylinePx: number[];
  imageWidth: number;
  imageHeight: number;
  color: string;
  selected: boolean;
  hovered: boolean;
  onClick: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
}) {
  const emphasized = selected || hovered;
  // Idle polylines render thin + faint — an approximate guide, not a
  // precise CAD trace. The hovered/selected wall pops bold at full opacity.
  const minEdge = Math.min(imageWidth, imageHeight);
  const strokeWidth = emphasized
    ? Math.max(minEdge / 280, 4)
    : Math.max(minEdge / 850, 1.5);
  return (
    <>
      {polylinePx.length >= 4 && (
        <Line
          points={polylinePx}
          stroke={color}
          strokeWidth={strokeWidth}
          opacity={emphasized ? 1 : 0.45}
          lineCap="round"
          lineJoin="round"
          onClick={onClick}
          onTap={onClick}
          onMouseEnter={onHoverEnter}
          onMouseLeave={onHoverLeave}
          hitStrokeWidth={Math.max(strokeWidth * 3, 16)}
        />
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
