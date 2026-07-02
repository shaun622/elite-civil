import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
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

// ---------------------------------------------------------------------------
// Shared projects-list store. Every consumer of useProjects() (the sidebar,
// the dashboard grid, the New Project dialog) reads from ONE store, so a
// create/delete/refresh anywhere is reflected everywhere immediately — no
// page reload needed. (useProject(), for a single project by id, is separate.)
// ---------------------------------------------------------------------------

type ListState = {
  projects: Project[] | null;
  loading: boolean;
  error: string | null;
};

let listState: ListState = { projects: null, loading: true, error: null };
let loadedForUser: string | null = null;
let inFlight = false;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function setListState(patch: Partial<ListState>) {
  listState = { ...listState, ...patch };
  emit();
}

function subscribeList(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getListSnapshot(): ListState {
  return listState;
}

async function loadProjects() {
  if (inFlight) return;
  inFlight = true;
  setListState({ loading: true, error: null });
  try {
    const projects = await listProjects();
    setListState({ projects, loading: false, error: null });
  } catch (err) {
    setListState({
      projects: null,
      loading: false,
      error: err instanceof Error ? err.message : "Failed to load projects.",
    });
  } finally {
    inFlight = false;
  }
}

export function useProjects() {
  const { user } = useAuth();
  const state = useSyncExternalStore(subscribeList, getListSnapshot);

  useEffect(() => {
    const uid = user?.id ?? null;
    if (!uid) {
      // Logged out — clear the shared list so the next user starts fresh.
      loadedForUser = null;
      setListState({ projects: null, loading: false, error: null });
      return;
    }
    // Fetch once per signed-in user; cached across component mounts.
    if (loadedForUser !== uid) {
      loadedForUser = uid;
      void loadProjects();
    }
  }, [user]);

  const refresh = useCallback(async () => {
    await loadProjects();
  }, []);

  const create = useCallback(
    async (input: ProjectInsert) => {
      if (!user) throw new Error("Not signed in.");
      const next = await createProject(user.id, input);
      // Prepend to the shared list so every consumer sees it at once.
      setListState({ projects: [next, ...(listState.projects ?? [])] });
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
