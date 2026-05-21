import { useCallback, useEffect, useState } from "react";
import {
  addProjectWall,
  deleteProjectWall,
  listProjectWalls,
  updateProjectWall,
} from "@/lib/api/walls";
import type { WallSegment, WallSegmentUpdate } from "@/types/db";
import { useAuth } from "@/hooks/useAuth";

type State = {
  walls: WallSegment[];
  loading: boolean;
  error: string | null;
};

/**
 * Lists every wall belonging to a project — manual and PDF-measured.
 * Used by the Take Off / Pricing / Cost Breakdown / Quotation pages,
 * which all need a project-wide wall list rather than a per-page one.
 */
export function useProjectWalls(projectId: string | undefined) {
  const { user } = useAuth();
  const [state, setState] = useState<State>({
    walls: [],
    loading: true,
    error: null,
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const walls = await listProjectWalls(projectId);
      setState({ walls, loading: false, error: null });
    } catch (err) {
      setState({
        walls: [],
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load walls.",
      });
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !user) {
      setState({ walls: [], loading: false, error: null });
      return;
    }
    void refresh();
  }, [projectId, user, refresh]);

  const addWall = useCallback(
    async (patch: WallSegmentUpdate): Promise<WallSegment | undefined> => {
      if (!projectId || !user) return undefined;
      setActionError(null);
      try {
        const created = await addProjectWall(projectId, user.id, patch);
        setState((s) => ({ ...s, walls: [...s.walls, created] }));
        return created;
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Add wall failed.");
        return undefined;
      }
    },
    [projectId, user],
  );

  const updateWall = useCallback(
    async (id: string, patch: WallSegmentUpdate) => {
      setActionError(null);
      setSavingId(id);
      try {
        const updated = await updateProjectWall(id, patch);
        setState((s) => ({
          ...s,
          walls: s.walls.map((w) => (w.id === id ? updated : w)),
        }));
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Save failed.");
      } finally {
        setSavingId(null);
      }
    },
    [],
  );

  const removeWall = useCallback(async (id: string) => {
    setActionError(null);
    try {
      await deleteProjectWall(id);
      setState((s) => ({ ...s, walls: s.walls.filter((w) => w.id !== id) }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed.");
    }
  }, []);

  return {
    ...state,
    savingId,
    actionError,
    refresh,
    addWall,
    updateWall,
    removeWall,
  };
}
