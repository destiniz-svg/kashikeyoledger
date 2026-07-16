-- ===========================================================================
-- Phase 1 · Multi-jurisdiction, MIRA compliance, immutable audit, dual currency
-- ===========================================================================
-- Applied to Supabase as four migrations (phase1_jurisdictions,
-- phase1_other_tax_rates, phase1_audit_immutable, phase1_dual_currency).
-- Idempotent — safe to re-run. Country-specific tax logic is isolated behind a
-- Jurisdiction so other countries can be added later without touching Maldives.
--
-- Existing schema this builds on: `tax_rates` (GST/TGST, effective-dated),
-- `exchange_rates`, `currencies`, `audit_log` (previously unused), and
-- `transactions.currency` + `transactions.fx_rate_to_base`.

-- ---------------------------------------------------------------------------
-- 1. Jurisdiction model
-- ---------------------------------------------------------------------------
create table if not exists public.jurisdictions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                 -- ISO-ish short code, e.g. 'MV'
  name text not null,
  tax_authority text,
  base_currency char(3) not null references public.currencies(code),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.jurisdictions (code, name, tax_authority, base_currency)
values ('MV', 'Maldives', 'Maldives Inland Revenue Authority (MIRA)', 'MVR')
on conflict (code) do nothing;

alter table public.organizations
  add column if not exists jurisdiction_id uuid references public.jurisdictions(id);
update public.organizations
  set jurisdiction_id = (select id from public.jurisdictions where code = 'MV')
  where jurisdiction_id is null;

alter table public.tax_rates
  add column if not exists jurisdiction_id uuid references public.jurisdictions(id);
update public.tax_rates
  set jurisdiction_id = (select id from public.jurisdictions where code = 'MV')
  where jurisdiction_id is null;

-- ---------------------------------------------------------------------------
-- 2. Non-GST taxes (Green Tax, Withholding) — kept out of the GST tax_category
--    enum so GST returns (MIRA 205/206) stay clean.
-- ---------------------------------------------------------------------------
create table if not exists public.other_tax_rates (
  id uuid primary key default gen_random_uuid(),
  jurisdiction_id uuid not null references public.jurisdictions(id),
  code text not null,                        -- 'GREEN_TAX', 'GREEN_TAX_GH', 'WHT'
  name text not null,
  basis text not null,                       -- 'PER_PERSON_NIGHT' | 'PERCENT'
  rate numeric not null,
  currency char(3) references public.currencies(code),
  effective_from date not null,
  effective_to date,
  source_note text,
  unique (jurisdiction_id, code, effective_from)
);

insert into public.other_tax_rates (jurisdiction_id, code, name, basis, rate, currency, effective_from, source_note)
select j.id, x.code, x.name, x.basis, x.rate, x.currency, x.eff::date, x.note
from public.jurisdictions j
cross join (values
  ('GREEN_TAX',    'Green Tax — tourist resorts/hotels/vessels', 'PER_PERSON_NIGHT', 6, 'USD', '2023-01-01', 'Maldives Tourism Act — Green Tax'),
  ('GREEN_TAX_GH', 'Green Tax — guesthouses',                    'PER_PERSON_NIGHT', 3, 'USD', '2023-01-01', 'Maldives Tourism Act — Green Tax (guesthouses)'),
  ('WHT',          'Non-resident withholding tax',               'PERCENT',         10, null,  '2020-01-01', 'Income Tax Act (Law 25/2019) — non-resident WHT')
) as x(code, name, basis, rate, currency, eff, note)
where j.code = 'MV'
on conflict (jurisdiction_id, code, effective_from) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Immutable audit trail (Tax Administration Act s.27). Every insert/update/
--    delete on a financial record is logged with actor, timestamp and full
--    before/after state; the log itself cannot be altered.
-- ---------------------------------------------------------------------------
alter table public.audit_log alter column organization_id drop not null;
alter table public.audit_log add column if not exists actor_type text not null default 'system';

-- The app sets these session GUCs per request so the real user / AI agent is
-- captured: SELECT set_config('app.actor_id', <uuid>, true), 'app.actor_type'
-- ('user'|'ai_agent'|'system'), 'app.actor_ip'. Falls back to the JWT subject.
create or replace function public.fn_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_before jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  v_actor_type text := nullif(current_setting('app.actor_type', true), '');
  v_ip inet := nullif(current_setting('app.actor_ip', true), '')::inet;
begin
  if v_actor is null then
    begin v_actor := auth.uid(); exception when others then v_actor := null; end;
  end if;
  if v_actor_type is null then
    v_actor_type := case when v_actor is not null then 'user' else 'system' end;
  end if;
  insert into public.audit_log
    (organization_id, actor_id, actor_type, action, entity_type, entity_id, before, after, ip_address)
  values (
    coalesce(v_after->>'organization_id', v_before->>'organization_id')::uuid,
    v_actor, v_actor_type, tg_op, tg_table_name,
    coalesce(v_after->>'id', v_before->>'id')::uuid,
    v_before, v_after, v_ip
  );
  return coalesce(new, old);
end $$;

create or replace function public.fn_audit_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only (Tax Administration Act s.27)';
end $$;
drop trigger if exists trg_audit_log_immutable on public.audit_log;
create trigger trg_audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public.fn_audit_immutable();
revoke update, delete on public.audit_log from anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'transactions','journal_entries','journal_lines','payments','payment_allocations',
    'ledger_accounts','bank_transactions','tax_rates','other_tax_rates'
  ] loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$s', t);
    execute format(
      'create trigger trg_audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.fn_audit()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Dual currency at the transaction level. Every money record carries its
--    transaction currency and fx_rate_to_base; the base currency is the org's
--    base_currency (MVR for Maldives). Base amounts are derived.
-- ---------------------------------------------------------------------------
create or replace function public.fn_require_fx()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_base char(3);
begin
  select coalesce(base_currency, 'MVR') into v_base from public.organizations where id = new.organization_id;
  v_base := coalesce(v_base, 'MVR');
  if new.currency = v_base then
    new.fx_rate_to_base := 1;
  elsif new.fx_rate_to_base is null or new.fx_rate_to_base <= 0 or new.fx_rate_to_base = 1 then
    raise exception 'fx_rate_to_base must be set to the % -> % rate for foreign-currency records',
      new.currency, v_base;
  end if;
  return new;
end $$;

drop trigger if exists trg_fx_transactions on public.transactions;
create trigger trg_fx_transactions before insert or update on public.transactions
  for each row execute function public.fn_require_fx();
drop trigger if exists trg_fx_payments on public.payments;
create trigger trg_fx_payments before insert or update on public.payments
  for each row execute function public.fn_require_fx();

alter table public.transactions
  add column if not exists grand_total_base numeric generated always as (round(grand_total * fx_rate_to_base, 2)) stored;
alter table public.transactions
  add column if not exists tax_total_base numeric generated always as (round(tax_total * fx_rate_to_base, 2)) stored;
alter table public.payments
  add column if not exists amount_base numeric generated always as (round(amount * fx_rate_to_base, 2)) stored;
