/* ============================================================
 * Engine compute types — derived from wall + config, not stored on
 * a DB row. Mirrors the calculation outputs in BE Landscapes'
 * `app/src/types/index.ts`.
 * ============================================================ */

import type {
  WallType,
  WallDesign,
  WallPosition,
} from "@/types/db";

/**
 * A wall the way the BE engine wants to see it — units in metres, classified.
 * In this app it's adapted from `WallSegment` at the engine boundary.
 */
export interface WallEntry {
  id: string;
  /** The DB WallSegment id this entry came from. Differs from `id` when a
   *  wall auto-splits into per-pricing-band sections (id gets `::s<n>`). */
  sourceId?: string;
  lot: string;
  type: WallType;
  wallDesign: WallDesign;
  position: WallPosition;
  /** Linear metres along the wall. */
  lengthLM: number;
  /** Wall height in metres (un-rounded; engine rounds up to 0.2 m). */
  height: number;
}

/** A WallEntry with every derived quantity the engine produces. */
export interface WallCalculated extends WallEntry {
  concreteM3: number;
  gravelM3: number;
  m2: number;
  numberOfHoles: number;
  timeToBuildHrs: number;
  drillTimeHrs: number;
  pfcLength: number;
  pfcQty: number;
  ucLength: number;
  ucQty: number;
  sleeperQty: number;
  superSupports: number;
  wedges: number;
  fenceBrackets: number;
  baySize: number;
  bays: number;
  postSize: string;
  holeDepth: number;
}

export interface CostBreakdown {
  drilling: { labour: number; machine: number; total: number };
  posting: {
    labour: number;
    concrete: number;
    steel: number;
    total: number;
  };
  wallBuilding: {
    labour: number;
    concreteSleepers: number;
    superSleepers: number;
    total: number;
  };
  backfill: {
    geofab: number;
    agLine: number;
    gravel: number;
    labourAndMachine: number;
    total: number;
  };
  engineering: { form15: number; form12: number; total: number };
  misc: number;
  costTotal: number;
  markup: number;
  marginAmount: number;
  totalExGST: number;
  totalWithGST: number;
  projectedProfit: number;
  totalM2: number;
  pricePerM2: number;
  costPerM2: number;
}

/** How a per-m² quotation rate was built, for an in-app "how is this
 *  calculated?" breakdown:
 *  rate = directCostPerM2 × (1+markup) × (1+margin) × (1+bandMultiplier). */
export interface RateBreakdown {
  directCostPerM2: number;
  markup: number;
  margin: number;
  bandMultiplier: number;
}

export interface QuotationLineItem {
  /** Stable key for a manual rate/qty override (cost_overrides["quote_rate:<key>"]
   *  / ["quote_qty:<key>"]). */
  key: string;
  description: string;
  qty: number;
  /** The engine-computed qty, before any manual quote_qty override. */
  qtyEstimated: number;
  unit: string;
  rate: number;
  total: number;
  /** Present on the per-m² wall lines (not flat-rate lines like Form 15). */
  rateBreakdown?: RateBreakdown;
  /** True when this line's rate came from a manual override, not the engine. */
  rateOverridden?: boolean;
  /** True when this line's qty came from a manual override, not the engine. */
  qtyOverridden?: boolean;
}

export type MaterialCategory =
  | "Concrete"
  | "Steel"
  | "Fence Brackets"
  | "Sleepers"
  | "Geofabric"
  | "Ag Line"
  | "Gravel";

export interface MaterialOrderLine {
  category: MaterialCategory;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
  /** Lot this line belongs to (steel posts only), for per-lot delivery bundling. */
  lot?: string;
  /** Toggled off: total is forced to 0. Line is kept (dimmed) so it stays
   *  re-includable in the UI. */
  excluded?: boolean;
}

export interface MaterialsOrder {
  lines: MaterialOrderLine[];
  grandTotal: number;
}

export type CostCategory =
  | "Drilling"
  | "Posting"
  | "Wall Building"
  | "Backfill & Gravel"
  | "Engineering"
  | "Other";

export interface CostDetailLine {
  id: string;
  category: CostCategory;
  description: string;
  qtyEstimated: number;
  qtyOverride?: number;
  unit: string;
  rate: number;
  total: number;
  /** Toggled off: total is 0 while excluded; qty/rate are retained so the UI
   *  can show the forgone amount and the line stays re-includable. */
  excluded?: boolean;
}

export interface CostBreakdownDetail {
  lines: CostDetailLine[];
  categoryTotals: Record<string, number>;
  grandTotal: number;
}

/** Per-project manual overrides for cost-breakdown line quantities,
 *  keyed by `CostDetailLine.id`. */
export type CostOverrides = Record<string, number>;
