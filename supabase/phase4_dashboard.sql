-- ===========================================================================
-- Phase 4 · MIRA-ready dashboard — reference FX rate for the dual-currency view.
-- ===========================================================================
-- Applied to Supabase as the migration `phase4_seed_fx_rate`. Idempotent.
--
-- The Maldivian Rufiyaa is pegged to the US dollar; the Maldives Monetary
-- Authority (MMA) reference band centres on MVR 15.42 per USD. The dashboard's
-- dual-currency header converts base-currency (MVR) figures to USD with this
-- rate until a live rate feed is wired in. `store.mvrPerUsd()` reads the latest
-- USD → MVR row and falls back to 15.42 when the table is empty.
--
-- The compliance report (GET /compliance) and the dual-currency figures are
-- computed in the app (src/compliance.ts) from existing data — no new tables.

insert into public.exchange_rates (rate_date, from_currency, to_currency, rate, source)
values
  (current_date, 'USD', 'MVR', 15.42, 'MMA reference peg'),
  (current_date, 'MVR', 'USD', round(1.0 / 15.42, 6), 'MMA reference peg')
on conflict (rate_date, from_currency, to_currency)
  do update set rate = excluded.rate, source = excluded.source;
