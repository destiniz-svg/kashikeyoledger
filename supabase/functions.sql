-- Ledger functions used by the Kashikeyo Ledger HTTP service.
-- Applied to the Supabase project as migration
-- `kashikeyo_ledger_post_and_trial_balance_fns`. Kept here for reference and
-- so the schema additions live alongside the code.

-- Atomically post a balanced journal entry for an organization.
-- p_lines is a JSON array of { account_code, debit, credit } objects.
create or replace function public.post_journal_entry(
  p_org uuid,
  p_date date,
  p_memo text,
  p_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_currency char(3);
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_count int;
  v_line jsonb;
  v_account_id uuid;
  v_debit numeric;
  v_credit numeric;
begin
  if p_org is null then
    raise exception 'organization id is required';
  end if;

  select base_currency into v_currency from organizations where id = p_org;
  if v_currency is null then
    raise exception 'organization % not found', p_org;
  end if;

  v_count := jsonb_array_length(coalesce(p_lines, '[]'::jsonb));
  if v_count < 2 then
    raise exception 'a journal entry needs at least two lines, got %', v_count;
  end if;

  -- Validate each line and accumulate totals.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_debit := round(coalesce((v_line->>'debit')::numeric, 0), 2);
    v_credit := round(coalesce((v_line->>'credit')::numeric, 0), 2);
    if v_debit < 0 or v_credit < 0 then
      raise exception 'debit and credit must be non-negative';
    end if;
    if (v_debit > 0) = (v_credit > 0) then
      raise exception 'each line must have exactly one of debit or credit greater than zero';
    end if;
    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  end loop;

  if v_total_debit <> v_total_credit then
    raise exception 'entry does not balance: debits % <> credits %', v_total_debit, v_total_credit;
  end if;

  insert into journal_entries (organization_id, entry_date, memo)
  values (p_org, p_date, p_memo)
  returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    select id into v_account_id
    from ledger_accounts
    where organization_id = p_org and code = (v_line->>'account_code');
    if v_account_id is null then
      raise exception 'unknown account code % for this organization', (v_line->>'account_code');
    end if;
    v_debit := round(coalesce((v_line->>'debit')::numeric, 0), 2);
    v_credit := round(coalesce((v_line->>'credit')::numeric, 0), 2);
    insert into journal_lines (journal_entry_id, organization_id, ledger_account_id, debit, credit, currency)
    values (v_entry_id, p_org, v_account_id, v_debit, v_credit, v_currency);
  end loop;

  return v_entry_id;
end;
$$;

-- Per-account debit/credit totals and net balance (debit-positive) for an org.
create or replace function public.org_trial_balance(p_org uuid)
returns table(code text, name text, account_type text, debit numeric, credit numeric, balance numeric)
language sql
security definer
set search_path = public
as $$
  select a.code, a.name, a.account_type,
         coalesce(sum(l.debit), 0)  as debit,
         coalesce(sum(l.credit), 0) as credit,
         coalesce(sum(l.debit), 0) - coalesce(sum(l.credit), 0) as balance
  from ledger_accounts a
  left join journal_lines l
    on l.ledger_account_id = a.id and l.organization_id = p_org
  where a.organization_id = p_org
  group by a.code, a.name, a.account_type
  order by a.code;
$$;

grant execute on function public.post_journal_entry(uuid, date, text, jsonb) to authenticated, service_role;
grant execute on function public.org_trial_balance(uuid) to anon, authenticated, service_role;
