-- Simple mode: catatan belanja harian (expense) untuk hitung profit hari itu.
-- Pendapatan diambil dari view daily_financials; belanja dicatat manual di sini.

create table public.daily_expenses (
  id bigint generated always as identity primary key,
  date date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  category text,
  note text,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

alter table public.daily_expenses enable row level security;

create policy "anon read daily expenses" on public.daily_expenses for select to anon using (true);
create policy "anon insert daily expenses" on public.daily_expenses for insert to anon with check (true);
create policy "anon delete daily expenses" on public.daily_expenses for delete to anon using (true);

create policy "authenticated read daily expenses" on public.daily_expenses for select to authenticated using (true);
create policy "authenticated insert daily expenses" on public.daily_expenses for insert to authenticated with check (true);
create policy "authenticated delete daily expenses" on public.daily_expenses for delete to authenticated using (true);

alter publication supabase_realtime add table public.daily_expenses;
