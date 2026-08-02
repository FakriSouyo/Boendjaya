-- Perbaiki duplikasi pendapatan di laporan keuangan.
-- Sebelumnya view melakukan JOIN order_items langsung pada orders sehingga sum(o.total)
-- terhitung ulang satu kali per baris item. Sekarang agregasi dilakukan per order dulu
-- (setiap order menyumbang total-nya tepat satu kali), baru digabung per tanggal/bulan.
-- DROP VIEW dahulu karena tipe kolom gross_profit berubah (numeric -> numeric(12,2)).

drop view if exists public.daily_financials;
drop view if exists public.monthly_financials;

create view public.daily_financials as
with order_agg as (
  select
    o.id as order_id,
    o.total as revenue,
    date(p.paid_at at time zone 'Asia/Jakarta') as report_date,
    coalesce(sum(oi.cogs_at_sale * oi.quantity), 0) as total_cogs
  from public.orders o
  join public.payments p on p.order_id = o.id and p.status = 'paid'
  join public.order_items oi on oi.order_id = o.id
  group by o.id, o.total, date(p.paid_at at time zone 'Asia/Jakarta')
)
select
  report_date,
  count(*)::int as order_count,
  coalesce(sum(revenue), 0)::numeric(12,2) as revenue,
  coalesce(sum(total_cogs), 0)::numeric(12,2) as total_cogs,
  coalesce(sum(revenue) - sum(total_cogs), 0)::numeric(12,2) as gross_profit
from order_agg
group by report_date
order by report_date desc;

create view public.monthly_financials as
with order_agg as (
  select
    o.id as order_id,
    o.total as revenue,
    date_trunc('month', p.paid_at at time zone 'Asia/Jakarta')::date as report_month,
    coalesce(sum(oi.cogs_at_sale * oi.quantity), 0) as total_cogs
  from public.orders o
  join public.payments p on p.order_id = o.id and p.status = 'paid'
  join public.order_items oi on oi.order_id = o.id
  group by o.id, o.total, date_trunc('month', p.paid_at at time zone 'Asia/Jakarta')::date
)
select
  report_month,
  count(*)::int as order_count,
  coalesce(sum(revenue), 0)::numeric(12,2) as revenue,
  coalesce(sum(total_cogs), 0)::numeric(12,2) as total_cogs,
  coalesce(sum(revenue) - sum(total_cogs), 0)::numeric(12,2) as gross_profit
from order_agg
group by report_month
order by report_month desc;

grant select on public.daily_financials to anon, authenticated;
grant select on public.monthly_financials to anon, authenticated;
