import { supabase } from "@/lib/supabase";
import type { Project, ProjectInsert, ProjectUpdate } from "@/types/db";
import {
  defaultConfig,
  zeroConfig,
  DEFAULT_PROJECT_DESCRIPTION,
} from "@/lib/engine/defaults";
import { slugify } from "@/lib/slug";

const TABLE = "projects";

/** True when the caller's organisation seeds new projects with the all-zero
 *  starter config instead of the BE template. Any error (column not migrated
 *  yet, no org row) falls back to the template, mirroring the slug/42703
 *  tolerance elsewhere in this file. RLS scopes the select to the caller's one
 *  org, the same guarantee getMyOrg relies on. */
async function orgSeedsZeroConfig(): Promise<boolean> {
  const { data, error } = await supabase
    .from("organizations")
    .select("seed_zero_config")
    .maybeSingle();
  if (error || !data) return false;
  return Boolean((data as { seed_zero_config?: boolean }).seed_zero_config);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A slug for `name` unique within the caller's org (RLS scopes the lookup).
 *  Returns null if the slug column isn't there yet (pre-migration) so project
 *  creation keeps working until the SQL is applied. */
async function generateUniqueSlug(name: string): Promise<string | null> {
  const base = slugify(name) || "project";
  const { data, error } = await supabase
    .from(TABLE)
    .select("slug")
    .ilike("slug", `${base}%`);
  if (error) return null; // slug column not migrated yet
  const taken = new Set(
    (data ?? [])
      .map((r) => (r as { slug: string | null }).slug)
      .filter((s): s is string => !!s),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

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

/** Resolve a project from its URL segment, which may be a slug (new URLs) or a
 *  raw UUID (old links, or rows created before the slug backfill). RLS scopes
 *  both lookups to the caller's org, so slugs only need to be unique per org. */
export async function getProject(idOrSlug: string): Promise<Project> {
  const column = UUID_RE.test(idOrSlug) ? "id" : "slug";
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq(column, idOrSlug)
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
  const slug = await generateUniqueSlug(String(normalized.name ?? ""));
  // New companies start from an all-zero config; existing companies keep the
  // BE template. Falls back to the template when the flag can't be read.
  const seedConfig = (await orgSeedsZeroConfig()) ? zeroConfig : defaultConfig;
  const seeded = {
    ...normalized,
    user_id: userId,
    config: normalized.config ?? seedConfig,
    description: normalized.description ?? DEFAULT_PROJECT_DESCRIPTION,
  };
  const fullPayload = slug ? { ...seeded, slug } : seeded;
  let { data, error } = await supabase
    .from(TABLE)
    .insert(fullPayload)
    .select()
    .single();

  // Slug race: another insert claimed this slug between our pre-check and the
  // insert (unique index on (org_id, slug) -> 23505). Retry once with a
  // disambiguating suffix.
  if (error && (error as { code?: string }).code === "23505" && slug) {
    ({ data, error } = await supabase
      .from(TABLE)
      .insert({ ...seeded, slug: `${slug}-${Date.now().toString(36)}` })
      .select()
      .single());
  }
  if (!error) return data as Project;

  // If the Phase-2 migration hasn't been applied yet, `config` /
  // `description` don't exist on the projects row and the insert
  // fails with Postgres code 42703 ("undefined column"). Retry with a
  // legacy payload so project creation still works — Pricing &
  // Performance and Quotation will fall back to defaultConfig until
  // the migration lands.
  const missingColumn =
    (error as { code?: string }).code === "42703" ||
    /column .* does not exist/i.test(error.message ?? "");
  if (!missingColumn) throw error;

  const legacyPayload = { ...normalized, user_id: userId };
  const { data: legacyData, error: legacyError } = await supabase
    .from(TABLE)
    .insert(legacyPayload)
    .select()
    .single();
  if (legacyError) throw legacyError;
  return legacyData as Project;
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
