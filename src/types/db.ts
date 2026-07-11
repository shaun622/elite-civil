export type ProjectStatus = "draft" | "active" | "archived";

/** Where a project sits in the takeoff → quote → won/lost workflow. */
export type TakeoffStatus =
  | "not_started"
  | "in_progress"
  | "quoted"
  | "won"
  | "lost";

export interface Project {
  id: string;
  user_id: string;
  name: string;
  /** URL slug derived from the name, unique within the organisation. Null on
   *  legacy rows created before the slug migration + backfill. */
  slug: string | null;
  client_name: string | null;
  site_address: string | null;
  status: ProjectStatus;
  notes: string | null;
  /** BE Landscapes estimator fields. */
  quote_number: string | null;
  contact_name: string | null;
  contact_email: string | null;
  description: string | null;
  /** Full project config (rates, materials, post sizes, admin / markup).
   *  Null until seeded — engine falls back to `defaultConfig` if null. */
  config: ProjectConfig | null;
  /** End-of-month log rows used by the Tracking page. */
  tracking_entries: TrackingEntry[];
  /** Custom quote line items added during quote review. */
  extra_over_items: ExtraOverItem[];
  /** Per-cost-line manual overrides — keyed by `CostDetailLine.id`. Also holds
   *  the quote's numeric per-line overrides ("quote_rate:" / "quote_qty:"). */
  cost_overrides: Record<string, number>;
  /** Display-only overrides for the customer-facing Quotation (custom line
   *  text / hidden / added lines, editable summary + boilerplate). Never feeds
   *  the engine. */
  quote_overrides: QuoteOverrides;
  /** Optional target/due date for the takeoff (ISO date), shown on the
   *  projects table. Nullable. */
  due_date: string | null;
  /** Takeoff workflow status; null = not started. */
  takeoff_status: TakeoffStatus | null;
  /** Structured site address (site_address holds the street line). */
  site_city: string | null;
  site_state: string | null;
  site_postcode: string | null;
  created_at: string;
  updated_at: string;
}

/** A user-added Quotation line rendered inside the pricing schedule (separate
 *  from Extra Over items). Display-only. */
export interface QuoteCustomLine {
  id: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
}

/** Everything non-numeric the estimator can override on the Quotation. All
 *  optional; an unset field falls back to the engine value / hardcoded default. */
export interface QuoteOverrides {
  /** Per engine-line overrides, keyed by `QuotationLineItem.key`. */
  lines?: Record<string, { description?: string; hidden?: boolean }>;
  /** User-added rows shown in the main pricing schedule. */
  customLines?: QuoteCustomLine[];
  /** The blurb under "Pricing schedule". */
  scheduleDescription?: string;
  /** Text overrides for the Wall summary stats. */
  summary?: { totalM2?: string; lots?: string; segments?: string };
  /** Long boilerplate sections (plain text); unset = hardcoded default layout. */
  designParams?: string;
  terms?: string;
  inclusions?: string;
  exclusions?: string;
}

export type ProjectInsert = {
  name: string;
  client_name?: string | null;
  site_address?: string | null;
  site_city?: string | null;
  site_state?: string | null;
  site_postcode?: string | null;
  notes?: string | null;
  quote_number?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  description?: string | null;
  due_date?: string | null;
  config?: ProjectConfig | null;
};

export type ProjectUpdate = Partial<{
  name: string;
  client_name: string | null;
  site_address: string | null;
  site_city: string | null;
  site_state: string | null;
  site_postcode: string | null;
  notes: string | null;
  status: ProjectStatus;
  quote_number: string | null;
  contact_name: string | null;
  contact_email: string | null;
  description: string | null;
  config: ProjectConfig;
  tracking_entries: TrackingEntry[];
  extra_over_items: ExtraOverItem[];
  cost_overrides: Record<string, number>;
  quote_overrides: QuoteOverrides;
  due_date: string | null;
  takeoff_status: TakeoffStatus | null;
}>;

/* ============================================================
 * BE Landscapes estimator types — ProjectConfig and side data.
 * Mirrors `Be Landscapes/app/src/types/index.ts`.
 * ============================================================ */

export type CrewType = "Employee Crew" | "Subbie Crew";

export interface MachineRate {
  name: string;
  rate: number;
  unit: string;
}

export interface PostSizeRange {
  postSize: string;
  heightMin: number;
  heightMax: number;
  pricePerMetre: number;
  lengthPerUnit: number;
  pricePerUnit: number;
  postingLabourPerM2: number;
}

export interface MaterialPrices {
  superSleeper: number;
  superSupport: number;
  wedges: number;
  concreteSleeper: number;
  concreteRate: number;
  gravelRate: number;
  geo1mX50m: number;
  geo2mX50m: number;
  geo1mX100m: number;
  geo2mX100m: number;
  agLine100mmX100m: number;
  fenceBracket: number;
  fenceBracketLabour: number;
}

export interface LabourRates {
  subbieDrill: number;
  subbiePost: number;
  subbieBuild: number;
  subbieBackfill: number;
  subbieMachine: number;
  employeeBuild: number;
  employeePost: number;
  employeeBackfill: number;
  employeeDrill: number;
}

export interface PerformanceParams {
  timeToDrill1LM: number;
  timeToInstall1Sleeper: number;
  buildCrewM2PerDay: number;
  workHours: number;
  breakTime: number;
  maxPostingPerDay: number;
}

export interface EngineeringParams {
  holeSize: number;
  /** @deprecated No longer used — hole depth is now embedment + holeDepthOverEmbedmentM. */
  heightPlusFactor: number;
  postSizeRanges: PostSizeRange[];
  heightBelowThreshold: number;
  sleeperLengthBelow: number;
  heightAboveThreshold: number;
  sleeperLengthAbove: number;
  defaultSleeperLength: number;
  /** Round wall height UP to the next increment for post embedment (the
   *  200 mm sleeper module). Optional for back-compat: undefined = on. */
  embedmentRoundUp?: boolean;
  /** The round-up step in metres (default 0.2). Optional for back-compat. */
  embedmentIncrementM?: number;
  /** Steel post in-ground embedment as a ratio of the retained height.
   *  1 = 1:1 (post length = 2× height). Optional for back-compat: undefined = 1. */
  postEmbedmentRatio?: number;
  /** Concrete post-hole depth over the in-ground embedment, in metres
   *  (holeDepth = embedment + this). Optional for back-compat: undefined = 0.2. */
  holeDepthOverEmbedmentM?: number;
}

export interface AdminCosts {
  engineering: number;
  formPerLot: number;
  mobeAndDemobe: number;
  markup: number;
  margin: number;
}

export interface ExtraOverBand {
  label: string;
  heightMin: number;
  heightMax: number;
  multiplier: number;
  /** Custom text printed on the Quotation for this band. When blank, the
   *  auto range ("Height 1.6-2.2m - Single Tier") is used. `label` is kept
   *  for tier detection + config-editor identity and is unaffected. */
  quoteLabel?: string;
}

export interface ProjectConfig {
  crewType: CrewType;
  machineRates: MachineRate[];
  materialPrices: MaterialPrices;
  labourRates: LabourRates;
  performance: PerformanceParams;
  engineering: EngineeringParams;
  admin: AdminCosts;
  extraOverBands: ExtraOverBand[];
  /** Reporting-only: ascending height band edges (m) for the "Summary by
   *  height band" breakdown on Review + Dashboard. Shared across the team.
   *  Optional for back-compat: undefined = default 0–1.6 / 1.6–3.0 / 3.0+. */
  heightBandEdges?: number[];
}

export type TrackingPhase =
  | "Drilling"
  | "Posting"
  | "Wall Building"
  | "Backfill & Gravel";

export interface TrackingEntry {
  id: string;
  date: string;
  phase: TrackingPhase;
  crew: string;
  machine: string;
  hours: number;
  quantity: number;
  notes: string;
}

export interface ExtraOverItem {
  id: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
}

export type ViewType = "plan" | "elevation" | "section" | "unknown";

export type ExtractionStatus =
  | "pending"
  | "extracting"
  | "extracted"
  | "reviewed"
  | "failed";

export interface Drawing {
  id: string;
  project_id: string;
  user_id: string;
  original_filename: string;
  file_path: string;
  page_count: number;
  created_at: string;
}

export interface DrawingPage {
  id: string;
  drawing_id: string;
  user_id: string;
  page_number: number;
  image_path: string;
  image_width: number;
  image_height: number;
  view_type: ViewType;
  extraction_status: ExtractionStatus;
  extraction_error: string | null;
  created_at: string;
}

export type DrawingWithPages = Drawing & { pages: DrawingPage[] };

export type Units = "mm" | "m" | "ft" | "in" | "unknown";

// Bounding boxes and polyline points are in image-pixel coordinates
// (0..image_width, 0..image_height). Extractions made before 2026-05-17
// used a normalized 0-1000 space — re-extract those pages.
export type Bbox = [number, number, number, number];
export type Point = [number, number];

/** A reduced-level station on a wall: top-of-wall and bottom-of-wall RLs in
 *  metres. A wall's height is the average of (top - bottom) over its pairs. */
export type RlPair = { top: number; bottom: number };

export interface Extraction {
  id: string;
  drawing_page_id: string;
  user_id: string;
  raw_response: unknown;
  scale_text: string | null;
  scale_bbox: Bbox | null;
  units: Units;
  view_type: ViewType;
  overall_confidence: number | null;
  warnings: string[];
  reviewed: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DimensionLabel {
  id: string;
  extraction_id: string;
  user_id: string;
  source_id: string;
  text_raw: string;
  value_normalized_mm: number | null;
  bbox: Bbox;
  confidence: number;
  applies_to_segment_id: string | null;
  created_at: string;
}

/** BE Landscapes wall classification. Used on the Take Off form and
 *  feeds the engine's quotation / cost-breakdown logic. */
export type WallType = "Single" | "Upper" | "Lower";
export type WallDesign = "Super Sleeper" | "Concrete";
export type WallPosition = "Left" | "Right" | "Rear" | "Front";

export interface WallSegment {
  id: string;
  /** The extraction this wall was measured from. Nullable: walls added
   *  manually on the Take Off page (no PDF source) carry only project_id. */
  extraction_id: string | null;
  /** The owning project. Always set: backfilled from the extraction chain
   *  for legacy rows, set directly for manual rows. */
  project_id: string | null;
  user_id: string;
  source_id: string;
  label: string | null;
  length_mm: number | null;
  height_mm: number | null;
  thickness_mm: number | null;
  rl_pairs: RlPair[];
  polyline: Point[];
  label_bbox: Bbox | null;
  source_dimension_ids: string[];
  confidence: number;
  notes: string | null;
  user_edited: boolean;
  original_values: Record<string, unknown> | null;
  user_added: boolean;
  confirmed: boolean;
  /** BE Landscapes per-wall estimator fields. Nullable on PDF-measured
   *  walls until the user fills them in on the Take Off table. */
  lot: string | null;
  wall_type: WallType | null;
  wall_design: WallDesign | null;
  position: WallPosition | null;
  /** Explicit display order (lower = earlier), set by drag-reordering on
   *  the Review page and honoured on Take Off / Quotation. Null walls fall
   *  back to created_at order. */
  sort_order: number | null;
  /** Manual height override in mm. When set, the app uses it as the
   *  effective `height_mm`; when null, `height_mm` tracks the RL-pair
   *  average. The RL average stays computed from `rl_pairs` for reference. */
  height_override_mm: number | null;
  created_at: string;
  updated_at: string;
}

export type WallSegmentUpdate = Partial<{
  label: string | null;
  length_mm: number | null;
  height_mm: number | null;
  height_override_mm: number | null;
  thickness_mm: number | null;
  notes: string | null;
  polyline: Point[];
  rl_pairs: RlPair[];
  user_added: boolean;
  confirmed: boolean;
  lot: string | null;
  wall_type: WallType | null;
  wall_design: WallDesign | null;
  position: WallPosition | null;
  sort_order: number | null;
}>;

export interface ExtractionBundle {
  page: DrawingPage;
  extraction: Extraction;
  dimensions: DimensionLabel[];
  segments: WallSegment[];
}
