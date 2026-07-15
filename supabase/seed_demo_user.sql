-- Seed a demo login user (email/password) and make them an OWNER of the demo
-- org, so the web app can sign in and authorize writes. Run once.
-- Login: owner@kashikeyo.local / kashikeyo-demo   (change the password!)
--
-- Prefer creating users via the Supabase dashboard (Authentication -> Add user,
-- "auto confirm"); this SQL is the equivalent for a scripted setup.
do $$
declare v_id uuid; v_org uuid := '94349aa5-ed47-474f-9a07-c726e63d925f';
begin
  select id into v_id from auth.users where email = 'owner@kashikeyo.local';
  if v_id is null then
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      -- GoTrue scans these as non-null strings; NULL breaks login ("Database
      -- error querying schema"), so seed them as empty strings.
      confirmation_token, recovery_token, email_change, email_change_token_new)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'owner@kashikeyo.local', extensions.crypt('kashikeyo-demo', extensions.gen_salt('bf')),
      now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      '', '', '', '');
    insert into auth.identities (provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at)
    values (v_id::text, v_id,
      jsonb_build_object('sub', v_id::text, 'email', 'owner@kashikeyo.local', 'email_verified', true),
      'email', now(), now(), now());
  end if;
  insert into profiles (id, full_name, email)
  values (v_id, 'Demo Owner', 'owner@kashikeyo.local') on conflict (id) do nothing;
  insert into organization_members (organization_id, user_id, role)
  values (v_org, v_id, 'OWNER') on conflict do nothing;
end $$;
