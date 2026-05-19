import { z } from "https://esm.sh/zod@3.23.8";

const point = z.tuple([z.number(), z.number()]);

// Two ticks on the graphic scale bar plus their real-world distance — used
// to calibrate mm-per-pixel for the client-side vector measurement.
export const ScaleBarSchema = z.object({
  found: z.boolean(),
  p0: point.nullable(),
  p1: point.nullable(),
  length_m: z.number().nullable(),
});

// A retaining-wall type from the legend. `hex` is the model's best guess at
// the legend swatch colour; the client snaps it to the PDF's real colours.
export const WallColorSchema = z.object({
  type_label: z.string(),
  hex: z.string(),
});

// A lot number + the approximate pixel centre of that lot's area.
export const LotSchema = z.object({
  name: z.string(),
  x: z.number(),
  y: z.number(),
});

export const AnalyzeResultSchema = z.object({
  scale_bar: ScaleBarSchema,
  scale_text: z.string().nullable(),
  wall_colors: z.array(WallColorSchema),
  lots: z.array(LotSchema),
  warnings: z.array(z.string()),
});

export type AnalyzeResult = z.infer<typeof AnalyzeResultSchema>;
