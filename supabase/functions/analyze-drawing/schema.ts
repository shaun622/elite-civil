import { z } from "https://esm.sh/zod@3.23.8";

const point = z.tuple([z.number(), z.number()]);

export const ScaleBarSchema = z.object({
  found: z.boolean(),
  p0: point.nullable(),
  p1: point.nullable(),
  length_m: z.number().nullable(),
});

export const WallColorSchema = z.object({
  type_label: z.string(),
  hex: z.string(),
});

export const LotSchema = z.object({
  name: z.string(),
  x: z.number(),
  y: z.number(),
});

/** A ground reduced level (spot height) and its pixel position. */
export const RlSchema = z.object({
  value: z.number(),
  x: z.number(),
  y: z.number(),
});

/** Whole-page pass: scale bar, legend colours and lot numbers. */
export const PageResultSchema = z.object({
  scale_bar: ScaleBarSchema,
  scale_text: z.string().nullable(),
  wall_colors: z.array(WallColorSchema),
  lots: z.array(LotSchema),
  warnings: z.array(z.string()),
});

/** Per-tile pass: RL spot levels read at full resolution. */
export const TileResultSchema = z.object({
  rls: z.array(RlSchema),
  warnings: z.array(z.string()),
});

export type PageResult = z.infer<typeof PageResultSchema>;
export type TileResult = z.infer<typeof TileResultSchema>;
