-- Seed a monthly MIRA 205 (GGST) filing calendar for the demo org. Run once.
insert into filing_periods (organization_id, form, period_start, period_end, due_date, status, filed_at)
values
 ('94349aa5-ed47-474f-9a07-c726e63d925f','MIRA_205_GGST','2026-01-01','2026-01-31','2026-02-28','FILED','2026-02-20'),
 ('94349aa5-ed47-474f-9a07-c726e63d925f','MIRA_205_GGST','2026-02-01','2026-02-28','2026-03-28','FILED','2026-03-22'),
 ('94349aa5-ed47-474f-9a07-c726e63d925f','MIRA_205_GGST','2026-03-01','2026-03-31','2026-04-28','FILED','2026-04-25'),
 ('94349aa5-ed47-474f-9a07-c726e63d925f','MIRA_205_GGST','2026-04-01','2026-04-30','2026-05-28','FILED','2026-05-24'),
 ('94349aa5-ed47-474f-9a07-c726e63d925f','MIRA_205_GGST','2026-05-01','2026-05-31','2026-06-28','FILED','2026-06-26'),
 ('94349aa5-ed47-474f-9a07-c726e63d925f','MIRA_205_GGST','2026-06-01','2026-06-30','2026-07-28','DUE_SOON',null),
 ('94349aa5-ed47-474f-9a07-c726e63d925f','MIRA_205_GGST','2026-07-01','2026-07-31','2026-08-28','UPCOMING',null),
 ('94349aa5-ed47-474f-9a07-c726e63d925f','MIRA_205_GGST','2026-08-01','2026-08-31','2026-09-28','UPCOMING',null)
on conflict do nothing;
