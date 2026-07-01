-- ============================================================================
-- Company/team accounts — Team UI support (RPCs).
--
-- The Members screen needs to list teammates WITH their email, but profiles
-- are private (RLS: viewable only by their owner). Rather than broaden profile
-- visibility, expose a narrow SECURITY DEFINER function that returns just the
-- caller's own org's members + email. Also an accept-invite RPC for users who
-- already have an account (new signups are handled by handle_new_user).
--
-- Re-runnable (create or replace). No table changes.
-- ============================================================================

-- Members of the caller's org, with email. Scoped to current_org_id() so it
-- can only ever return the caller's own company.
create or replace function public.org_members()
returns table (
  user_id uuid,
  email text,
  role text,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.email, m.role, m.created_at
  from public.organization_members m
  join public.profiles p on p.id = m.user_id
  where m.org_id = public.current_org_id()
  order by
    case m.role
      when 'owner' then 0 when 'admin' then 1
      when 'editor' then 2 else 3 end,
    p.email;
$$;

revoke execute on function public.org_members() from public;
grant execute on function public.org_members() to authenticated;

-- Accept an invite by token for an ALREADY-EXISTING signed-in user. New
-- signups auto-join via handle_new_user; this covers a user who made an
-- account first and is invited afterwards. Moves their single membership into
-- the inviting org with the invited role. Never lets someone become 'owner'
-- via an invite (invites are admin/editor/viewer only, enforced by the table
-- check + the guard below).
create or replace function public.accept_org_invite(invite_token uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_invite public.organization_invites%rowtype;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select email into v_email from public.profiles where id = auth.uid();

  select * into v_invite
  from public.organization_invites
  where token = invite_token
    and accepted_at is null
    and expires_at > now();

  if v_invite.id is null then
    raise exception 'invite not found, already used, or expired';
  end if;
  if lower(v_invite.email) <> lower(coalesce(v_email, '')) then
    raise exception 'this invite was issued to a different email';
  end if;
  if v_invite.role = 'owner' then
    raise exception 'invites cannot grant owner';
  end if;

  -- Move the user's single membership into the inviting org.
  insert into public.organization_members (org_id, user_id, role)
  values (v_invite.org_id, auth.uid(), v_invite.role)
  on conflict (user_id)
  do update set org_id = excluded.org_id, role = excluded.role;

  update public.organization_invites set accepted_at = now() where id = v_invite.id;
end;
$$;

revoke execute on function public.accept_org_invite(uuid) from public;
grant execute on function public.accept_org_invite(uuid) to authenticated;
