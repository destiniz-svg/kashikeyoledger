-- Demo banking data for the Kashikeyo demo org: two bank accounts (a primary
-- BML current account in MVR linked to ledger 1010, and a USD account) plus a
-- statement of bank_transactions in a mix of reconciliation states so the
-- Banking screen has something to reconcile.
--
-- Idempotent: clears the demo org's banking rows first, then re-inserts with
-- fixed UUIDs. Safe to re-run. Scoped to org 94349aa5-... (Kashikeyo Demo Co).

do $$
declare
  v_org   uuid := '94349aa5-ed47-474f-9a07-c726e63d925f';
  v_mvr   uuid := 'b0000000-0000-4000-8000-000000000001';
  v_usd   uuid := 'b0000000-0000-4000-8000-000000000002';
  v_1010  uuid;
  -- vendor ids for matched/suggested lines
  v_altura uuid; v_imh uuid; v_ives uuid; v_beaver uuid; v_choice uuid;
begin
  select id into v_1010 from ledger_accounts
    where organization_id = v_org and code = '1010' limit 1;
  select id into v_altura from vendors where organization_id = v_org and name = 'Altura Pvt Ltd' limit 1;
  select id into v_imh    from vendors where organization_id = v_org and name = 'Island Mark Hardware Pvt Ltd' limit 1;
  select id into v_ives   from vendors where organization_id = v_org and name = 'Ives Private Limited' limit 1;
  select id into v_beaver from vendors where organization_id = v_org and name = 'Beaver Builders Private Limited' limit 1;
  select id into v_choice from vendors where organization_id = v_org and name = 'Island Choice LLP' limit 1;

  delete from bank_transactions where organization_id = v_org;
  delete from bank_accounts     where organization_id = v_org;

  insert into bank_accounts (id, organization_id, name, bank_name, account_number_masked, currency, ledger_account_id, is_active)
  values
    (v_mvr, v_org, 'Business Current', 'Bank of Maldives', '•••• 4021', 'MVR', v_1010, true),
    (v_usd, v_org, 'USD Settlement',   'Bank of Maldives', '•••• 8837', 'USD', null,   true);

  insert into bank_transactions
    (organization_id, bank_account_id, txn_date, value_date, txn_type, bank_reference, counterparty, narrative, direction, amount, running_balance, currency, dedupe_hash, recon_status, matched_vendor_id)
  values
    (v_org, v_mvr, '2026-06-03', '2026-06-03', 'TRANSFER', 'FT26060312', 'Card Settlement',            'POS card settlement — BML Merchant', 'CREDIT', 45000.00, 295000.00, 'MVR', md5('mvr-1'), 'MATCHED',   null),
    (v_org, v_mvr, '2026-06-05', '2026-06-05', 'TRANSFER', 'FT26060544', 'Altura Pvt Ltd',            'Payment ALT/INV-000024',             'DEBIT',  98280.00, 196720.00, 'MVR', md5('mvr-2'), 'MATCHED',   v_altura),
    (v_org, v_mvr, '2026-06-09', '2026-06-09', 'TRANSFER', 'FT26060917', 'Island Mark Hardware',      'Transfer to IMH',                    'DEBIT',   4644.00, 192076.00, 'MVR', md5('mvr-3'), 'SUGGESTED', v_imh),
    (v_org, v_mvr, '2026-06-14', '2026-06-14', 'TRANSFER', 'FT26061422', 'Card Settlement',            'POS card settlement — BML Merchant', 'CREDIT', 32500.00, 224576.00, 'MVR', md5('mvr-4'), 'MATCHED',   null),
    (v_org, v_mvr, '2026-06-18', '2026-06-18', 'TRANSFER', 'FT26061808', 'Ives Private Limited',      'Supplier payment',                   'DEBIT',   6522.75, 218053.25, 'MVR', md5('mvr-5'), 'SUGGESTED', v_ives),
    (v_org, v_mvr, '2026-06-22', '2026-06-22', 'CHARGE',   'SC26062201', 'Bank of Maldives',          'Monthly service charge',             'DEBIT',   1250.00, 216803.25, 'MVR', md5('mvr-6'), 'EXCLUDED',  null),
    (v_org, v_mvr, '2026-06-28', '2026-06-28', 'TRANSFER', 'FT26062830', 'Beaver Builders',           'Transfer',                           'DEBIT',   4572.42, 212230.83, 'MVR', md5('mvr-7'), 'UNMATCHED', null),
    (v_org, v_mvr, '2026-07-02', '2026-07-02', 'TRANSFER', 'FT26070211', 'MTCC',                       'Incoming transfer',                  'CREDIT', 18750.00, 230980.83, 'MVR', md5('mvr-8'), 'UNMATCHED', null),
    (v_org, v_mvr, '2026-07-06', '2026-07-06', 'TRANSFER', 'FT26070619', 'Island Choice LLP',         'Payment IC-7781',                    'DEBIT',    232.20, 230748.63, 'MVR', md5('mvr-9'), 'MATCHED',   v_choice),
    (v_org, v_mvr, '2026-07-10', '2026-07-10', 'TRANSFER', 'FT26071005', 'Payroll',                    'Staff salary — July',                'DEBIT',  12000.00, 218748.63, 'MVR', md5('mvr-10'),'EXCLUDED',  null),
    (v_org, v_mvr, '2026-07-12', '2026-07-12', 'TRANSFER', 'FT26071240', 'Card Settlement',            'POS card settlement — BML Merchant', 'CREDIT', 27300.00, 246048.63, 'MVR', md5('mvr-11'),'SUGGESTED', null),
    (v_org, v_usd, '2026-06-20', '2026-06-20', 'WIRE',     'TT26062001', 'Overseas Supplier',         'Import wire',                        'DEBIT',   1450.00,   6550.00, 'USD', md5('usd-1'), 'UNMATCHED', null),
    (v_org, v_usd, '2026-07-08', '2026-07-08', 'WIRE',     'TT26070801', 'Export Receipt',            'Inbound settlement',                 'CREDIT',  3200.00,   9750.00, 'USD', md5('usd-2'), 'UNMATCHED', null);
end $$;
