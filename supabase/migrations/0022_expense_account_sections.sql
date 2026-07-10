-- Finance-editable override of each expense account's classification
-- (Controllable vs Non-controllable). Applied at query time on top of the
-- section carried by the import, so re-classifying doesn't need a re-import and
-- applies across every BU. Salaries & Wages stays its own group regardless.
create table if not exists public.expense_account_sections (
  account text primary key,
  section text not null check (section in ('controllable', 'uncontrollable')),
  updated_at timestamptz not null default now()
);
alter table public.expense_account_sections enable row level security;

-- Readable by any signed-in user (needed to render the Expenses view); Finance edits.
drop policy if exists "expense_sections_read_all" on public.expense_account_sections;
create policy "expense_sections_read_all" on public.expense_account_sections
  for select to authenticated using (true);

drop policy if exists "expense_sections_write_finance" on public.expense_account_sections;
create policy "expense_sections_write_finance" on public.expense_account_sections
  for all using (public.current_role() = 'finance');
