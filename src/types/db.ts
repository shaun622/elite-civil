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
