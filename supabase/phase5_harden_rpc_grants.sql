-- ===========================================================================
-- Phase 5 · Security hardening — lock the org RPCs to the service role.
-- ===========================================================================
-- Applied to Supabase as migrations `phase5_harden_rpc_grants` /
-- `phase5_harden_rpc_grants_v2`. Idempotent.
--
-- Postgres grants EXECUTE on functions to PUBLIC by default, and anon /
-- authenticated inherit that — so every SECURITY DEFINER RPC was callable
-- straight through PostgREST with the public anon key, bypassing the Node API's
-- write-auth guard (and, because each takes an `org` argument, reachable across
-- orgs). The app only ever calls these via the Node API with the service_role
-- key, so we revoke EXECUTE from PUBLIC/anon/authenticated and re-grant to
-- service_role. Trigger-only functions are revoked outright (triggers fire
-- regardless of the caller's EXECUTE grant).

do $$
declare fn text;
begin
  foreach fn in array array[
    'post_journal_entry(uuid, date, text, jsonb)',
    'record_sale(uuid, date, character, text, jsonb)',
    'set_bank_recon(uuid, uuid, text, uuid)',
    'set_transaction_status(uuid, uuid, text)',
    'import_bank_statement(uuid, uuid, text, jsonb)',
    'update_org_settings(uuid, jsonb)',
    'org_gst_filings(uuid)',
    'org_revenue(uuid, date, date)',
    'org_tax_filings(uuid, text, text)',
    'org_trial_balance(uuid)',
    'org_vendors(uuid)'
  ] loop
    begin
      execute format('revoke execute on function public.%s from public, anon, authenticated', fn);
      execute format('grant execute on function public.%s to service_role', fn);
    exception when undefined_function then null;
    end;
  end loop;

  foreach fn in array array['fn_audit()', 'fn_require_fx()', 'fn_audit_immutable()', 'rls_auto_enable()'] loop
    begin
      execute format('revoke execute on function public.%s from public, anon, authenticated', fn);
    exception when undefined_function then null;
    end;
  end loop;
end $$;

alter function public.fn_audit_immutable() set search_path = public;
