import { useCallback, useEffect, useState } from "react";
import {
  deleteDrawing as apiDeleteDrawing,
  getSignedUrlsForPaths,
  listDrawingsForProject,
  uploadDrawing as apiUploadDrawing,
  type UploadProgress,
  type UploadStage,
} from "@/lib/api/drawings";
import type { DrawingWithPages } from "@/types/db";
import { useAuth } from "@/hooks/useAuth";

type State = {
  drawings: DrawingWithPages[] | null;
  loading: boolean;
  error: string | null;
};

export function useDrawings(projectId: string | undefined) {
  const { user } = useAuth();
  const [state, setState] = useState<State>({
    drawings: null,
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const drawings = await listDrawingsForProject(projectId);
      setState({ drawings, loading: false, error: null });
    } catch (err) {
      setState({
        drawings: null,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load drawings.",
      });
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !user) {
      setState({ drawings: null, loading: false, error: null });
      return;
    }
    void refresh();
  }, [projectId, user, refresh]);

  const [stage, setStage] = useState<UploadStage | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      if (!user || !projectId) throw new Error("Not ready to upload.");
      setUploadError(null);
      const onProgress: UploadProgress = (s) => setStage(s);
      try {
        const drawing = await apiUploadDrawing({
          file,
          projectId,
          userId: user.id,
          onProgress,
        });
        setState((s) => ({
          ...s,
          drawings: [drawing, ...(s.drawings ?? [])],
        }));
        setStage(null);
        return drawing;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed.";
        setUploadError(msg);
        setStage(null);
        throw err;
      }
    },
    [user, projectId],
  );

  const remove = useCallback(
    async (drawing: DrawingWithPages) => {
      await apiDeleteDrawing(drawing);
      setState((s) => ({
        ...s,
        drawings: (s.drawings ?? []).filter((d) => d.id !== drawing.id),
      }));
    },
    [],
  );

  return {
    ...state,
    refresh,
    upload,
    remove,
    uploadStage: stage,
    uploadError,
  };
}

/**
 * Resolves a set of storage paths to short-lived signed URLs. Re-fetches if
 * the input paths change.
 */
export function useSignedUrls(paths: string[]) {
  const key = paths.join("|");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (paths.length === 0) {
      setUrls({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSignedUrlsForPaths(paths)
      .then((map) => {
        if (!cancelled) setUrls(map);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to sign URLs.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { urls, loading, error };
}
