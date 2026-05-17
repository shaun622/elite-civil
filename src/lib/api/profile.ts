import { supabase } from "@/lib/supabase";

export type ProfileRow = {
  id: string;
  email: string | null;
  company_name: string | null;
  company_logo_url: string | null;
  company_address: string | null;
  created_at: string;
  updated_at: string;
};

export async function getProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as ProfileRow) ?? null;
}

export async function updateProfile(
  userId: string,
  patch: Partial<
    Pick<ProfileRow, "company_name" | "company_address" | "company_logo_url">
  >,
): Promise<ProfileRow> {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === "string") {
      const t = v.trim();
      cleaned[k] = t.length === 0 ? null : t;
    } else {
      cleaned[k] = v;
    }
  }
  const { data, error } = await supabase
    .from("profiles")
    .update(cleaned)
    .eq("id", userId)
    .select()
    .single();
  if (error) throw error;
  return data as ProfileRow;
}

export async function changePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
