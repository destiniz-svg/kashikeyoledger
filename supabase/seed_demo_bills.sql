-- Seed demo vendors and purchase bills for the demo organization, so the
-- Bills screen and /bills endpoint have data. Run once. Amounts in MVR.
-- Set v_org to your organizations.id.
do $$
declare
  v_org uuid := '94349aa5-ed47-474f-9a07-c726e63d925f';
  v_user uuid;
  r record;
  v_vendor uuid;
  v_txn uuid;
  v_gst numeric;
begin
  select id into v_user from profiles where email = 'system@kashikeyo.local';
  for r in
    select * from (values
      ('Altura Pvt Ltd','1145053','ALT/INV-000024','PO-RDC-2026-003845', date '2026-07-05', date '2026-07-20', 91000.00, 8.0,'GGST','AI_VERIFIED','Equipment','Concrete Mixer (50KG - 1 Bag)',1),
      ('Island Mark Hardware Pvt Ltd',null,'IMH-4471',null, date '2026-05-11', date '2026-05-26', 4300.00, 8.0,'GGST','DRAFT','Hardware','Assorted fixings & tools',12),
      ('Ives Private Limited',null,'IVS-2026-118',null, date '2026-05-11', date '2026-05-25', 6039.58, 8.0,'GGST','AI_VERIFIED','Supplies','Packaging & consumables',1),
      ('Tree Top Health Pvt Ltd',null,'TTH-9930',null, date '2026-02-05', date '2026-02-20', 5809.00, 0.0,'EXEMPT','AI_VERIFIED','Health','Staff medical services',1),
      ('Beaver Builders Private Limited',null,'BB-3382',null, date '2026-06-14', date '2026-06-29', 4233.72, 8.0,'GGST','DRAFT','Construction','Site labour & materials',1),
      ('Island Choice LLP',null,'IC-7781',null, date '2026-05-12', date '2026-05-27', 215.00, 8.0,'GGST','ACCOUNTANT_APPROVED','F&B','Cafe supplies',1)
    ) as t(vendor,tin,invoice,po,tdate,due,subtotal,rate,taxcat,status,category,line_desc,qty)
  loop
    insert into vendors (organization_id, name, tin)
    values (v_org, r.vendor, r.tin)
    on conflict (organization_id, name) do update set tin = coalesce(excluded.tin, vendors.tin)
    returning id into v_vendor;

    v_gst := round(r.subtotal * r.rate / 100, 2);

    insert into transactions
      (organization_id, type, vendor_id, invoice_number, po_number, transaction_date, due_date,
       currency, subtotal, tax_total, grand_total, status, created_by, notes)
    values
      (v_org, 'PURCHASE_BILL', v_vendor, r.invoice, r.po, r.tdate, r.due,
       'MVR', r.subtotal, v_gst, r.subtotal + v_gst, r.status::approval_status, v_user, r.category)
    returning id into v_txn;

    insert into transaction_line_items
      (transaction_id, organization_id, description, quantity, unit_price, line_subtotal,
       tax_category, tax_rate_percent, tax_amount, expense_account_code, sort_order)
    values
      (v_txn, v_org, r.line_desc, r.qty, round(r.subtotal / r.qty, 2), r.subtotal,
       r.taxcat::tax_category, r.rate, v_gst, '6000', 1);
  end loop;
end $$;
