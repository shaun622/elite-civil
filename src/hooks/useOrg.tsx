import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getMyOrg,
  canEdit as roleCanEdit,
  canManageMembers as roleCanManage,
  type Organization,
  type OrgRole,
} from "@/lib/api/organization";
import { useAuth } from "@/hooks/useAuth";

type OrgContextValue = {
  org: Organization | null;
  role: OrgRole | null;
  loading: boolean;
  /** Role can create/edit takeoff data (owner/admin/editor). */
  canEdit: boolean;
  /** Role can manage members + invites (owner/admin). */
  canManageMembers: boolean;
  refresh: () => Promise<void>;
};

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [role, setRole] = useState<OrgRole | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setOrg(null);
      setRole(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await getMyOrg(user.id);
      setOrg(res?.org ?? null);
      setRole(res?.role ?? null);
    } catch {
      // Pre-migration or transient — treat as no org rather than crashing.
      setOrg(null);
      setRole(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  const value = useMemo<OrgContextValue>(
    () => ({
      org,
      role,
      loading,
      canEdit: roleCanEdit(role),
      canManageMembers: roleCanManage(role),
      refresh,
    }),
    [org, role, loading, refresh],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used inside an <OrgProvider />");
  return ctx;
}
