/* ============================================================
 * Project-scoped wall_segments helpers — the Take Off page lists
 * every wall on a project (manual + PDF-measured) and edits / adds
 * them directly without going through a PDF extraction.
 *
 * The existing `review.ts` keeps the PDF-flow helpers (loadExtraction-
 * Bundle, rescaling, etc.); this module is just the project-wide list
 * + add + update + delete.
 * ============================================================ */

import { supabase } from "@/lib/supabase";
import type { WallSegment, WallSegmentUpdate } from "@/types/db";

function normalizeUpdate(patch: WallSegmentUpdate): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === "string") {
      const trimmed = v.trim();
      out[k] = trimmed.length === 0 ? null : trimmed;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Every wall on a project — manual + PDF-measured, in creation order. */
export async function listProjectWalls(
  projectId: string,
): Promise<WallSegment[]> {
  const { data, error } = await supabase
    .from("wall_segments")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WallSegment[];
}

/** Add a manual wall to a project (no PDF source). */
export async function addProjectWall(
  projectId: string,
  userId: string,
  patch: WallSegmentUpdate,
): Promise<WallSegment> {
  const sourceId = `manual_${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await supabase
    .from("wall_segments")
    .insert({
      project_id: projectId,
      user_id: userId,
      source_id: sourceId,
      ...normalizeUpdate(patch),
      confidence: 1.0,
      user_added: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as WallSegment;
}

/** Update any wall by id — same as the review version but doesn't carry
 *  the original_values rollback bookkeeping (manual walls have no
 *  PDF-measured baseline to revert to). */
export async function updateProjectWall(
  id: string,
  patch: WallSegmentUpdate,
): Promise<WallSegment> {
  const { data, error } = await supabase
    .from("wall_segments")
    .update(normalizeUpdate(patch))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as WallSegment;
}

export async function deleteProjectWall(id: string): Promise<void> {
  const { error } = await supabase.from("wall_segments").delete().eq("id", id);
  if (error) throw error;
}
