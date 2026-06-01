import { useCallback, useEffect, useState } from "react";
import {
  addWallSegment,
  deleteWallSegment,
  loadExtractionBundle,
  lockReview,
  rescaleExtractionByDistance,
  rescaleExtractionWalls,
  unlockReview,
  updateWallSegment,
} from "@/lib/api/review";
import { getSignedUrlsForPaths } from "@/lib/api/drawings";
import { reorderWalls } from "@/lib/api/walls";
import type {
  ExtractionBundle,
  WallSegment,
  WallSegmentUpdate,
} from "@/types/db";
import { useAuth } from "@/hooks/useAuth";

type State = {
  bundle: ExtractionBundle | null;
  imageUrl: string | null;
  loading: boolean;
  error: string | null;
};

export function useReview(drawingPageId: string | undefined) {
  const { user } = useAuth();
  const [state, setState] = useState<State>({
    bundle: null,
    imageUrl: null,
    loading: true,
    error: null,
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rescaling, setRescaling] = useState(false);

  const load = useCallback(async () => {
    if (!drawingPageId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const bundle = await loadExtractionBundle(drawingPageId);
      const urls = await getSignedUrlsForPaths([bundle.page.image_path]);
      setState({
        bundle,
        imageUrl: urls[bundle.page.image_path] ?? null,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState({
        bundle: null,
        imageUrl: null,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load review.",
      });
    }
  }, [drawingPageId]);

  useEffect(() => {
    if (!drawingPageId || !user) {
      setState({ bundle: null, imageUrl: null, loading: false, error: null });
      return;
    }
    void load();
  }, [drawingPageId, user, load]);

  function applySegment(updated: WallSegment) {
    setState((s) => {
      if (!s.bundle) return s;
      const segments = s.bundle.segments.some((sg) => sg.id === updated.id)
        ? s.bundle.segments.map((sg) => (sg.id === updated.id ? updated : sg))
        : [...s.bundle.segments, updated];
      return { ...s, bundle: { ...s.bundle, segments } };
    });
  }

  const saveSegment = useCallback(
    async (segment: WallSegment, patch: WallSegmentUpdate) => {
      setActionError(null);
      setSavingId(segment.id);
      try {
        const updated = await updateWallSegment(segment, patch);
        applySegment(updated);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Save failed.");
      } finally {
        setSavingId(null);
      }
    },
    [],
  );

  const addSegment = useCallback(
    async (patch: WallSegmentUpdate): Promise<WallSegment | undefined> => {
      if (!state.bundle || !user) return undefined;
      setActionError(null);
      try {
        const created = await addWallSegment(
          state.bundle.extraction.id,
          user.id,
          patch,
        );
        applySegment(created);
        return created;
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Add segment failed.",
        );
        return undefined;
      }
    },
    [state.bundle, user],
  );

  const removeSegment = useCallback(async (id: string) => {
    setActionError(null);
    try {
      await deleteWallSegment(id);
      setState((s) => {
        if (!s.bundle) return s;
        return {
          ...s,
          bundle: {
            ...s.bundle,
            segments: s.bundle.segments.filter((sg) => sg.id !== id),
          },
        };
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed.");
    }
  }, []);

  /**
   * Persist a drag-reorder / regroup. Applies the new sort_order + lot
   * locally first (so the list snaps immediately), then writes to the DB;
   * on failure it reloads to resync. `updates` carries one entry per wall
   * whose order or lot changed.
   */
  const reorderSegments = useCallback(
    async (
      updates: { id: string; sortOrder: number; lot?: string | null }[],
    ) => {
      if (updates.length === 0) return;
      setActionError(null);
      const patchById = new Map(updates.map((u) => [u.id, u]));
      setState((s) => {
        if (!s.bundle) return s;
        const segments = s.bundle.segments
          .map((sg) => {
            const u = patchById.get(sg.id);
            if (!u) return sg;
            return {
              ...sg,
              sort_order: u.sortOrder,
              lot:
                u.lot !== undefined ? (u.lot?.trim() ? u.lot.trim() : null) : sg.lot,
            };
          })
          .sort((a, b) => {
            const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
            const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
            if (ao !== bo) return ao - bo;
            return a.created_at.localeCompare(b.created_at);
          });
        return { ...s, bundle: { ...s.bundle, segments } };
      });
      try {
        await reorderWalls(updates);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Reorder failed.");
        void load();
      }
    },
    [load],
  );

  const confirmReview = useCallback(async () => {
    if (!state.bundle || !user) return;
    setActionError(null);
    try {
      const updated = await lockReview(state.bundle.extraction.id, user.id);
      setState((s) =>
        s.bundle
          ? {
              ...s,
              bundle: {
                ...s.bundle,
                extraction: updated,
                page: { ...s.bundle.page, extraction_status: "reviewed" },
              },
            }
          : s,
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Confirm failed.");
    }
  }, [state.bundle, user]);

  const reopen = useCallback(async () => {
    if (!state.bundle) return;
    setActionError(null);
    try {
      const updated = await unlockReview(state.bundle.extraction.id);
      setState((s) =>
        s.bundle
          ? {
              ...s,
              bundle: {
                ...s.bundle,
                extraction: updated,
                page: { ...s.bundle.page, extraction_status: "extracted" },
              },
            }
          : s,
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Reopen failed.");
    }
  }, [state.bundle]);

  const rescale = useCallback(
    async (newRatio: number) => {
      if (!state.bundle) return;
      setActionError(null);
      setRescaling(true);
      try {
        const { extraction, segments } = await rescaleExtractionWalls(
          state.bundle.extraction,
          state.bundle.segments,
          newRatio,
        );
        setState((s) =>
          s.bundle
            ? { ...s, bundle: { ...s.bundle, extraction, segments } }
            : s,
        );
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Rescale failed.");
      } finally {
        setRescaling(false);
      }
    },
    [state.bundle],
  );

  const recalibrateByDistance = useCallback(
    async (
      p0: [number, number],
      p1: [number, number],
      distanceMetres: number,
    ) => {
      if (!state.bundle) return;
      setActionError(null);
      setRescaling(true);
      try {
        const { extraction, segments } = await rescaleExtractionByDistance(
          state.bundle.extraction,
          state.bundle.segments,
          p0,
          p1,
          distanceMetres,
        );
        setState((s) =>
          s.bundle
            ? { ...s, bundle: { ...s.bundle, extraction, segments } }
            : s,
        );
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Recalibrate failed.",
        );
      } finally {
        setRescaling(false);
      }
    },
    [state.bundle],
  );

  return {
    ...state,
    savingId,
    actionError,
    rescaling,
    refresh: load,
    saveSegment,
    addSegment,
    removeSegment,
    reorderSegments,
    confirmReview,
    reopen,
    rescale,
    recalibrateByDistance,
  };
}
