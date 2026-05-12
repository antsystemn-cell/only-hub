-- Fix infinite recursion in user_roles RLS by using a SECURITY DEFINER helper
create or replace function public.is_merchant_owner(_user_id uuid, _merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and merchant_id = _merchant_id
      and role = 'merchant_owner'::app_role
  )
$$;

drop policy if exists "user_roles owner manage merchant staff" on public.user_roles;

create policy "user_roles owner manage merchant staff"
on public.user_roles
for all
using (merchant_id is not null and public.is_merchant_owner(auth.uid(), merchant_id))
with check (merchant_id is not null and public.is_merchant_owner(auth.uid(), merchant_id));