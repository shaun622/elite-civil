import { useCallback, useEffect, useState } from "react";
import {
  archiveProject,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  restoreProject,
  updateProject,
} from "@/lib/api/projects";
import type { Project, ProjectInsert, ProjectUpdate } from "@/types/db";
import { useAuth } from "@/hooks/useAuth";

type State = {
  projects: Project[] | null;
  loading: boolean;
  error: string | null;
};

export function useProjects() {
  const { user } = useAuth();
  const [state, setState] = useState<State>({
    projects: null,
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const projects = await listProjects();
      setState({ projects, loading: false, error: null });
    } catch (err) {
      setState({
        projects: null,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load projects.",
      });
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setState({ projects: null, loading: false, error: null });
      return;
    }
    void refresh();
  }, [user, refresh]);

  const create = useCallback(
    async (input: ProjectInsert) => {
      if (!user) throw new Error("Not signed in.");
      const next = await createProject(user.id, input);
      setState((s) => ({
        ...s,
        projects: [next, ...(s.projects ?? [])],
      }));
      return next;
    },
    [user],
  );

  return { ...state, refresh, create };
}

export function useProject(id: string | undefined) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setProject(await getProject(id));
    } catch (err) {
      setProject(null);
      setError(err instanceof Error ? err.message : "Failed to load project.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) {
      setProject(null);
      setLoading(false);
      return;
    }
    void load();
  }, [id, load]);

  const update = useCallback(
    async (patch: ProjectUpdate) => {
      if (!id) throw new Error("No project id.");
      const next = await updateProject(id, patch);
      setProject(next);
      return next;
    },
    [id],
  );

  const archive = useCallback(async () => {
    if (!id) throw new Error("No project id.");
    const next = await archiveProject(id);
    setProject(next);
    return next;
  }, [id]);

  const restore = useCallback(async () => {
    if (!id) throw new Error("No project id.");
    const next = await restoreProject(id);
    setProject(next);
    return next;
  }, [id]);

  const remove = useCallback(async () => {
    if (!id) throw new Error("No project id.");
    await deleteProject(id);
    setProject(null);
  }, [id]);

  return { project, loading, error, refresh: load, update, archive, restore, remove };
}
