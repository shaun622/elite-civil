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
