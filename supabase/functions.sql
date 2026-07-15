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

-- ---------------------------------------------------------------------------
-- Sales / revenue (migration kashikeyo_ledger_record_sale_and_revenue_fns)
-- Revenue lives in `transactions` (there is no INCOME ledger account type).
-- ---------------------------------------------------------------------------

-- Record a POS sale as a transaction + line items, computing tax and totals.
-- p_lines: [{ description, quantity?, unit_price, tax_category?, tax_rate_percent? }]
create or replace function public.record_sale(
  p_org uuid,
  p_date date,
  p_currency char(3),
  p_notes text,
  p_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn_id uuid;
  v_user uuid;
  v_currency char(3);
  v_line jsonb;
  v_qty numeric;
  v_price numeric;
  v_subtotal numeric;
  v_taxrate numeric;
  v_taxamt numeric;
  v_sum_sub numeric := 0;
  v_sum_tax numeric := 0;
  v_i int := 0;
begin
  if p_org is null then
    raise exception 'organization id is required';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) < 1 then
    raise exception 'a sale needs at least one line item';
  end if;

  select id into v_user from profiles where email = 'system@kashikeyo.local';
  if v_user is null then
    raise exception 'system account (system@kashikeyo.local) not found';
  end if;

  v_currency := coalesce(p_currency, 'MVR');

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if coalesce(v_line->>'description', '') = '' then
      raise exception 'each line item needs a description';
    end if;
    v_qty := coalesce((v_line->>'quantity')::numeric, 1);
    v_price := (v_line->>'unit_price')::numeric;
    v_taxrate := coalesce((v_line->>'tax_rate_percent')::numeric, 0);
    if v_price is null then
      raise exception 'each line item needs a unit_price';
    end if;
    if v_qty <= 0 or v_price < 0 or v_taxrate < 0 then
      raise exception 'quantity must be > 0, and unit_price / tax_rate_percent >= 0';
    end if;
    v_subtotal := round(v_qty * v_price, 2);
    v_taxamt := round(v_subtotal * v_taxrate / 100, 2);
    v_sum_sub := v_sum_sub + v_subtotal;
    v_sum_tax := v_sum_tax + v_taxamt;
  end loop;

  insert into transactions
    (organization_id, type, transaction_date, currency, subtotal, tax_total, grand_total, created_by, notes)
  values
    (p_org, 'POS_SALE', p_date, v_currency, v_sum_sub, v_sum_tax, v_sum_sub + v_sum_tax, v_user, p_notes)
  returning id into v_txn_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_i := v_i + 1;
    v_qty := coalesce((v_line->>'quantity')::numeric, 1);
    v_price := (v_line->>'unit_price')::numeric;
    v_taxrate := coalesce((v_line->>'tax_rate_percent')::numeric, 0);
    v_subtotal := round(v_qty * v_price, 2);
    v_taxamt := round(v_subtotal * v_taxrate / 100, 2);
    insert into transaction_line_items
      (transaction_id, organization_id, description, quantity, unit_price,
       line_subtotal, tax_category, tax_rate_percent, tax_amount, sort_order)
    values
      (v_txn_id, p_org, v_line->>'description', v_qty, v_price,
       v_subtotal, coalesce(v_line->>'tax_category', 'OUT_OF_SCOPE')::tax_category,
       v_taxrate, v_taxamt, v_i);
  end loop;

  return v_txn_id;
end;
$$;

-- Revenue totals over POS sales in a date range.
create or replace function public.org_revenue(p_org uuid, p_from date, p_to date)
returns table(sales_count bigint, subtotal numeric, tax_total numeric, grand_total numeric)
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint,
         coalesce(sum(subtotal), 0),
         coalesce(sum(tax_total), 0),
         coalesce(sum(grand_total), 0)
  from transactions
  where organization_id = p_org and type = 'POS_SALE'
    and transaction_date >= p_from and transaction_date <= p_to;
$$;

grant execute on function public.record_sale(uuid, date, char, text, jsonb) to authenticated, service_role;
grant execute on function public.org_revenue(uuid, date, date) to anon, authenticated, service_role;
