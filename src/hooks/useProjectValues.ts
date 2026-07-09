import { useEffect, useMemo, useState } from "react";
import { listAllWalls } from "@/lib/api/walls";
import { calculateBundle } from "@/lib/engine/adapter";
import type { Project, WallSegment } from "@/types/db";

/**
 * Per-project customer quote total (ex GST) for the projects table. Fetches
 * every wall in one query, groups by project, and computes each project's
 * quote total the same way the Quotation page does (engine lines with
 * rate/qty overrides, minus hidden lines, plus custom lines + extra-over
 * items). Display-only — doesn't touch the engine outputs elsewhere.
 *
 * Cheap enough for tens of projects (one network call + pure compute); if it
 * ever gets slow we'd denormalise a cached total onto the project row.
 */
export function useProjectValues(projects: Project[] | null): {
  values: Map<string, number>;
  loading: boolean;
} {
  const [walls, setWalls] = useState<WallSegment[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAllWalls()
      .then((w) => {
        if (!cancelled) setWalls(w);
      })
      .catch(() => {
        if (!cancelled) setWalls([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const values = useMemo(() => {
    const map = new Map<string, number>();
    if (!walls || !projects) return map;

    const byProject = new Map<string, WallSegment[]>();
    for (const w of walls) {
      if (!w.project_id) continue;
      const arr = byProject.get(w.project_id) ?? [];
      arr.push(w);
      byProject.set(w.project_id, arr);
    }

    for (const p of projects) {
      const pw = byProject.get(p.id) ?? [];
      try {
        const bundle = calculateBundle(pw, p);
        const lineOv = p.quote_overrides?.lines ?? {};
        const engineTotal = bundle.quotationLines
          .filter((l) => !lineOv[l.key]?.hidden)
          .reduce((s, l) => s + l.total, 0);
        const customTotal = (p.quote_overrides?.customLines ?? []).reduce(
          (s, c) => s + c.qty * c.rate,
          0,
        );
        const extrasTotal = (p.extra_over_items ?? []).reduce(
          (s, i) => s + i.qty * i.rate,
          0,
        );
        map.set(p.id, engineTotal + customTotal + extrasTotal);
      } catch {
        map.set(p.id, 0);
      }
    }
    return map;
  }, [walls, projects]);

  return { values, loading: loading && walls === null };
}
