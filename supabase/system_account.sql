-- A "system" service-account used to attribute records the backend creates
-- (e.g. API-recorded POS sales), since transactions.created_by references a
-- real user (profiles -> auth.users) and is NOT NULL.
--
-- Run once. Idempotent. A handle_new_user trigger may auto-create the profile
-- from the auth.users insert, so the profiles insert is guarded with ON CONFLICT.
do $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = 'system@kashikeyo.local';
  if v_id is null then
    v_id := gen_random_uuid();
    insert into auth.users (id, email, created_at, updated_at)
    values (v_id, 'system@kashikeyo.local', now(), now());
  end if;
  insert into profiles (id, full_name, email)
  values (v_id, 'Kashikeyo System', 'system@kashikeyo.local')
  on conflict (id) do nothing;
end $$;

select id, email from profiles where email = 'system@kashikeyo.local';
