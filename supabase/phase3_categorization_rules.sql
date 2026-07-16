-- ===========================================================================
-- Phase 3 · Explainable AI — human overrides persisted as categorization rules.
-- ===========================================================================
-- Applied to Supabase as the migration `phase3_categorization_rules`. Idempotent.
--
-- When a reviewer corrects an AI extraction's tax / accounting category, that
-- correction is saved here and auto-applied to future documents from the same
-- vendor (matched by TIN or name) or matching a keyword — so the system learns
-- from people instead of repeating the same mistake.
--
-- The app enforces "at least one matcher and one outcome" too, but the check
-- constraints below make it a hard invariant. The Phase 1 immutable audit trail
-- covers this table via fn_audit().

create table if not exists public.categorization_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Matchers (at least one must be set):
  match_vendor_tin text,          -- exact vendor TIN match (strongest)
  match_vendor_pattern text,      -- case-insensitive substring on vendor name
  match_keyword text,             -- case-insensitive substring on a line description
  -- Outcome to apply:
  set_tax_category public.tax_category,
  set_accounting_category text,
  note text,
  priority integer not null default 100,   -- lower = evaluated first
  is_active boolean not null default true,
  times_applied integer not null default 0,
  source text not null default 'HUMAN_OVERRIDE',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categorization_rules_has_matcher check (
    match_vendor_tin is not null or match_vendor_pattern is not null or match_keyword is not null
  ),
  constraint categorization_rules_has_outcome check (
    set_tax_category is not null or set_accounting_category is not null
  )
);

create index if not exists idx_categorization_rules_org_active
  on public.categorization_rules (organization_id, is_active, priority);

do $$
begin
  execute 'drop trigger if exists trg_audit_categorization_rules on public.categorization_rules';
  execute 'create trigger trg_audit_categorization_rules after insert or update or delete '
       || 'on public.categorization_rules for each row execute function public.fn_audit()';
exception when undefined_function then
  null; -- fn_audit() absent (fresh DB without Phase 1) — skip auditing.
end $$;
