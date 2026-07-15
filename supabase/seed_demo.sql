-- Seed a demo organization and a starter chart of accounts.
-- Run once against the Supabase project; note the returned organization_id and
-- set it as KASHIKEYO_ORG_ID for the service.
--
-- account_type values must be one of the DB-allowed types:
--   ASSET, LIABILITY, EXPENSE, COGS, TAX, BANK, FX
-- (there is no EQUITY or INCOME type in this schema).

with org as (
  insert into organizations (name, sector, base_currency)
  values ('Kashikeyo Demo Co', 'GENERAL', 'MVR')
  returning id
)
insert into ledger_accounts (organization_id, code, name, account_type)
select org.id, v.code, v.name, v.account_type
from org, (values
  ('1000','Cash on Hand','ASSET'),
  ('1010','Business Bank Account','BANK'),
  ('1100','Accounts Receivable','ASSET'),
  ('1200','Inventory','ASSET'),
  ('2000','Accounts Payable','LIABILITY'),
  ('2100','GST Payable','TAX'),
  ('5000','Cost of Goods Sold','COGS'),
  ('6000','Operating Expenses','EXPENSE'),
  ('6100','Bank Charges','EXPENSE'),
  ('7000','FX Gain/Loss','FX')
) as v(code, name, account_type)
returning organization_id;
