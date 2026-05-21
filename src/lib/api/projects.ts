import { supabase } from "@/lib/supabase";
import type { Project, ProjectInsert, ProjectUpdate } from "@/types/db";
import { defaultConfig, DEFAULT_PROJECT_DESCRIPTION } from "@/lib/engine/defaults";

const TABLE = "projects";

function normalize(input: ProjectInsert | ProjectUpdate): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string") {
      const trimmed = v.trim();
      out[k] = trimmed.length === 0 ? null : trimmed;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Project[];
}

export async function getProject(id: string): Promise<Project> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Project;
}

export async function createProject(
  userId: string,
  input: ProjectInsert,
): Promise<Project> {
  // Seed a fresh project with the BE Landscapes baseline config + T&Cs
  // unless the caller explicitly passed their own. Saves the user from
  // having to clone an existing project just to set up rates / margins.
  const normalized = normalize(input);
  const payload = {
    ...normalized,
    user_id: userId,
    config: normalized.config ?? defaultConfig,
    description: normalized.description ?? DEFAULT_PROJECT_DESCRIPTION,
  };
  const { data, error } = await supabase
    .from(TABLE)
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as Project;
}

export async function updateProject(
  id: string,
  patch: ProjectUpdate,
): Promise<Project> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(normalize(patch))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Project;
}

export async function archiveProject(id: string): Promise<Project> {
  return updateProject(id, { status: "archived" });
}

export async function restoreProject(id: string): Promise<Project> {
  return updateProject(id, { status: "active" });
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
