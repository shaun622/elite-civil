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

  // Mutations run against the RESOLVED project's UUID, never the raw URL
  // segment (which is a slug once the slug migration lands — feeding a slug
  // into the API helpers' .eq("id", ...) would fail on the uuid column).
  const update = useCallback(
    async (patch: ProjectUpdate) => {
      if (!project) throw new Error("Project not loaded.");
      const snapshot = project;
      // Paint the change immediately so toggles / inline edits feel instant;
      // the server echo reconciles below, and a failure rolls back.
      setProject({ ...project, ...(patch as Partial<Project>) });
      try {
        const next = await updateProject(project.id, patch);
        setProject(next);
        return next;
      } catch (err) {
        setProject(snapshot);
        throw err;
      }
    },
    [project],
  );

  const archive = useCallback(async () => {
    if (!project) throw new Error("Project not loaded.");
    const next = await archiveProject(project.id);
    setProject(next);
    return next;
  }, [project]);

  const restore = useCallback(async () => {
    if (!project) throw new Error("Project not loaded.");
    const next = await restoreProject(project.id);
    setProject(next);
    return next;
  }, [project]);

  const remove = useCallback(async () => {
    if (!project) throw new Error("Project not loaded.");
    await deleteProject(project.id);
    setProject(null);
  }, [project]);

  return { project, loading, error, refresh: load, update, archive, restore, remove };
}
