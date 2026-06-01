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

/** Every wall on a project — manual + PDF-measured, in display order
 *  (sort_order asc, nulls last, then creation order). */
export async function listProjectWalls(
  projectId: string,
): Promise<WallSegment[]> {
  const { data, error } = await supabase
    .from("wall_segments")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WallSegment[];
}

/**
 * Persist a drag-reorder / regroup: each entry sets a wall's new
 * `sort_order` and (when moved into another lot group) its `lot`.
 * Updates run in parallel — a drag only ever touches a handful of rows.
 */
export async function reorderWalls(
  updates: { id: string; sortOrder: number; lot?: string | null }[],
): Promise<void> {
  const results = await Promise.all(
    updates.map((u) => {
      const patch: Record<string, unknown> = { sort_order: u.sortOrder };
      if (u.lot !== undefined) {
        const trimmed = u.lot?.trim();
        patch.lot = trimmed ? trimmed : null;
      }
      return supabase.from("wall_segments").update(patch).eq("id", u.id);
    }),
  );
  for (const r of results) {
    if (r.error) throw r.error;
  }
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

/**
 * Self-heal for walls that were measured via the PDF path before
 * `wall_segments.project_id` was wired up everywhere — those rows live
 * under the project's drawings/extractions but have a null project_id,
 * so the Take Off query (which filters by project_id) skips them.
 *
 * Walks the extraction chain to find orphan walls and updates them in
 * place. Returns the count of rows backfilled. RLS ensures we can only
 * touch our own rows.
 */
export async function backfillProjectWalls(projectId: string): Promise<number> {
  const { data: drawings, error: dErr } = await supabase
    .from("drawings")
    .select("id")
    .eq("project_id", projectId);
  if (dErr || !drawings || drawings.length === 0) return 0;

  const { data: pages, error: pErr } = await supabase
    .from("drawing_pages")
    .select("id")
    .in(
      "drawing_id",
      drawings.map((d) => d.id as string),
    );
  if (pErr || !pages || pages.length === 0) return 0;

  const { data: extractions, error: eErr } = await supabase
    .from("extractions")
    .select("id")
    .in(
      "drawing_page_id",
      pages.map((p) => p.id as string),
    );
  if (eErr || !extractions || extractions.length === 0) return 0;

  const { data, error } = await supabase
    .from("wall_segments")
    .update({ project_id: projectId })
    .in(
      "extraction_id",
      extractions.map((e) => e.id as string),
    )
    .is("project_id", null)
    .select("id");
  if (error) return 0;
  return data?.length ?? 0;
}
