import { z } from "https://esm.sh/zod@3.23.8";

const bbox = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const point = z.tuple([z.number(), z.number()]);

export const DimensionLabelSchema = z.object({
  id: z.string(),
  text_raw: z.string(),
  value_normalized_mm: z.number().nullable(),
  bbox,
  confidence: z.number(),
});

export const WallSegmentSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  length_mm: z.number().nullable(),
  height_mm: z.number().nullable(),
  thickness_mm: z.number().nullable(),
  polyline: z.array(point),
  label_bbox: bbox.nullable(),
  source_dimension_ids: z.array(z.string()),
  confidence: z.number(),
  notes: z.string().nullable(),
});

export const ExtractionResultSchema = z.object({
  view_type: z.enum(["plan", "elevation", "section", "unknown"]),
  scale_text: z.string().nullable(),
  scale_bbox: bbox.nullable(),
  units: z.enum(["mm", "m", "ft", "in", "unknown"]),
  overall_confidence: z.number(),
  dimension_labels: z.array(DimensionLabelSchema),
  wall_segments: z.array(WallSegmentSchema),
  warnings: z.array(z.string()),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
export type DimensionLabelOut = z.infer<typeof DimensionLabelSchema>;
export type WallSegmentOut = z.infer<typeof WallSegmentSchema>;
