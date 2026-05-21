export type ProjectStatus = "draft" | "active" | "archived";

export interface Project {
  id: string;
  user_id: string;
  name: string;
  client_name: string | null;
  site_address: string | null;
  status: ProjectStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectInsert = {
  name: string;
  client_name?: string | null;
  site_address?: string | null;
  notes?: string | null;
};

export type ProjectUpdate = Partial<{
  name: string;
  client_name: string | null;
  site_address: string | null;
  notes: string | null;
  status: ProjectStatus;
}>;

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

export interface WallSegment {
  id: string;
  extraction_id: string;
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
  created_at: string;
  updated_at: string;
}

export type WallSegmentUpdate = Partial<{
  label: string | null;
  length_mm: number | null;
  height_mm: number | null;
  thickness_mm: number | null;
  notes: string | null;
  polyline: Point[];
  rl_pairs: RlPair[];
  user_added: boolean;
}>;

export interface ExtractionBundle {
  page: DrawingPage;
  extraction: Extraction;
  dimensions: DimensionLabel[];
  segments: WallSegment[];
}
