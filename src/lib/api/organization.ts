import { supabase } from "@/lib/supabase";

export type OrgRole = "owner" | "admin" | "editor" | "viewer";

export type Organization = {
  id: string;
  name: string;
  owner_id: string;
  company_name: string | null;
  company_address: string | null;
  company_logo_url: string | null;
  created_at: string;
};

export type OrgMember = {
  user_id: string;
  email: string | null;
  role: OrgRole;
  created_at: string;
};

export type OrgInvite = {
  id: string;
  org_id: string;
  email: string;
  role: Exclude<OrgRole, "owner">;
  token: string;
  invited_by: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

/** The signed-in user's organization + their role in it (one org per user).
 *  Must filter to the caller's own membership — RLS lets a member read every
 *  membership row in their org, so an unfiltered maybeSingle() would error. */
export async function getMyOrg(userId: string): Promise<{
  org: Organization;
  role: OrgRole;
} | null> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organizations(*)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.organizations) return null;
  return {
    role: data.role as OrgRole,
    org: data.organizations as unknown as Organization,
  };
}

/** All members of the caller's org, with email (via the org_members RPC). */
export async function listOrgMembers(): Promise<OrgMember[]> {
  const { data, error } = await supabase.rpc("org_members");
  if (error) throw error;
  return (data ?? []) as OrgMember[];
}

/** Pending (unaccepted) invites for the caller's org. Owner/Admin only (RLS). */
export async function listPendingInvites(): Promise<OrgInvite[]> {
  const { data, error } = await supabase
    .from("organization_invites")
    .select("*")
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OrgInvite[];
}

export async function inviteMember(
  orgId: string,
  invitedBy: string,
  email: string,
  role: Exclude<OrgRole, "owner">,
): Promise<OrgInvite> {
  const clean = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from("organization_invites")
    .upsert(
      {
        org_id: orgId,
        email: clean,
        role,
        invited_by: invitedBy,
        accepted_at: null,
      },
      { onConflict: "org_id,email" },
    )
    .select()
    .single();
  if (error) throw error;
  return data as OrgInvite;
}

export async function updateMemberRole(
  userId: string,
  role: OrgRole,
): Promise<void> {
  const { error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("user_id", userId);
  if (error) throw error;
}

export async function removeMember(userId: string): Promise<void> {
  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
}

export async function cancelInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from("organization_invites")
    .delete()
    .eq("id", inviteId);
  if (error) throw error;
}

export async function updateOrgBranding(
  orgId: string,
  patch: {
    company_name?: string | null;
    company_address?: string | null;
    company_logo_url?: string | null;
  },
): Promise<Organization> {
  const clean = Object.fromEntries(
    Object.entries(patch).map(([k, v]) => [
      k,
      typeof v === "string" && v.trim() === "" ? null : v,
    ]),
  );
  const { data, error } = await supabase
    .from("organizations")
    .update(clean)
    .eq("id", orgId)
    .select()
    .single();
  if (error) throw error;
  return data as Organization;
}

export type ProjectVisibility = "org" | "restricted";

/** A project's visibility + the user_ids explicitly granted access. */
export async function getProjectAccess(projectId: string): Promise<{
  visibility: ProjectVisibility;
  memberIds: string[];
}> {
  const { data: proj, error: e1 } = await supabase
    .from("projects")
    .select("visibility")
    .eq("id", projectId)
    .single();
  if (e1) throw e1;
  const { data: pm, error: e2 } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId);
  if (e2) throw e2;
  return {
    visibility: ((proj as { visibility?: string })?.visibility ??
      "org") as ProjectVisibility,
    memberIds: (pm ?? []).map((r) => (r as { user_id: string }).user_id),
  };
}

export async function setProjectVisibility(
  projectId: string,
  visibility: ProjectVisibility,
): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .update({ visibility })
    .eq("id", projectId);
  if (error) throw error;
}

export async function addProjectMember(
  projectId: string,
  userId: string,
  addedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from("project_members")
    .upsert(
      { project_id: projectId, user_id: userId, added_by: addedBy },
      { onConflict: "project_id,user_id" },
    );
  if (error) throw error;
}

export async function removeProjectMember(
  projectId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** True if the role can create/edit takeoff data. */
export function canEdit(role: OrgRole | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

/** True if the role can manage members + invites (not billing). */
export function canManageMembers(role: OrgRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}
