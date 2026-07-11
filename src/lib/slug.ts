/**
 * Turn a project name into a URL-safe slug: strip accents, lowercase, collapse
 * every run of non-alphanumerics into a single hyphen, trim hyphens, and cap
 * the length. Returns "" for names with no usable characters (callers fall back
 * to "project"). Mirrors the SQL backfill in 20260711000000_project_slug.sql.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop combining accent marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, ""); // slice may leave a trailing hyphen
}
