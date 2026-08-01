-- Boendjaya F&B · single outlet · inventory + COGS + financial reporting
create type public.user_role as enum ('owner', 'admin', 'cashier', 'staff');
create type public.payment_method as enum ('cash', 'qris');
create type public.payment_status as enum ('pending', 'paid', 'expired', 'cancelled');
create type public.stock_movement_type as enum ('purchase', 'sale', 'waste', 'adjustment');
create type public.ingredient_unit as enum ('gram', 'pcs', 'liter');
create type public.purchase_input_unit as enum ('gram', 'kg', 'pcs', 'pack', 'liter');

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  role public.user_role not null default 'staff',
  created_at timestamptz not null default now()
);

create table public.categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.products (
  id bigint generated always as identity primary key,
  category_id bigint references public.categories on delete set null,
  name text not null,
  selling_price numeric(12,2) not null check (selling_price >= 0),
  cogs numeric(12,2) not null default 0,
  emoji text not null default '🍔',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Base unit: gram (weight), pcs (count), liter (volume). average_cost = harga per 1 unit dasar.
create table public.ingredients (
  id bigint generated always as identity primary key,
  name text not null unique,
  unit public.ingredient_unit not null,
  current_stock numeric(14,3) not null default 0 check (current_stock >= 0),
  minimum_stock numeric(14,3) not null default 0,
  average_cost numeric(14,4) not null default 0,
  created_at timestamptz not null default now()
);

-- Resep: quantity selalu dalam unit dasar bahan (gram / pcs / liter).
create table public.recipes (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products on delete cascade,
  ingredient_id bigint not null references public.ingredients on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  unique (product_id, ingredient_id)
);

-- Pembelian stok per tanggal dengan harga total → hitung biaya per unit dasar.
create table public.stock_purchases (
  id bigint generated always as identity primary key,
  ingredient_id bigint not null references public.ingredients on delete restrict,
  purchased_at date not null default current_date,
  input_quantity numeric(14,3) not null check (input_quantity > 0),
  input_unit public.purchase_input_unit not null,
  pack_size numeric(14,3),
  total_price numeric(12,2) not null check (total_price >= 0),
  base_quantity numeric(14,3) not null check (base_quantity > 0),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  note text,
  created_at timestamptz not null default now(),
  check (input_unit <> 'pack' or (pack_size is not null and pack_size > 0))
);

create table public.orders (
  id bigint generated always as identity primary key,
  order_number text not null unique,
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  cashier_id uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders on delete cascade,
  product_id bigint references public.products on delete set null,
  product_name text not null,
  unit_price numeric(12,2) not null,
  quantity integer not null check (quantity > 0),
  cogs_at_sale numeric(12,2) not null default 0
);

create table public.payments (
  id bigint generated always as identity primary key,
  order_id bigint not null unique references public.orders on delete cascade,
  method public.payment_method not null,
  amount numeric(12,2) not null,
  cash_received numeric(12,2),
  status public.payment_status not null default 'pending',
  provider_reference text,
  paid_at timestamptz
);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  ingredient_id bigint not null references public.ingredients on delete restrict,
  type public.stock_movement_type not null,
  quantity numeric(14,3) not null,
  unit_cost numeric(14,4),
  reference_type text,
  reference_id bigint,
  note text,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id bigint generated always as identity primary key,
  type text not null,
  title text not null,
  body text,
  ingredient_id bigint references public.ingredients on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Konversi input pembelian ke unit dasar bahan.
create or replace function public.to_base_quantity(
  p_input_qty numeric,
  p_input_unit public.purchase_input_unit,
  p_pack_size numeric,
  p_ingredient_unit public.ingredient_unit
) returns numeric language plpgsql immutable as $$
declare v numeric;
begin
  if p_input_unit = 'pack' then
    v := p_input_qty * p_pack_size;
    if p_ingredient_unit <> 'pcs' then
      raise exception 'Pack hanya untuk bahan ber-unit pcs';
    end if;
    return v;
  end if;
  if p_input_unit = 'kg' then
    if p_ingredient_unit <> 'gram' then raise exception 'Kg hanya untuk bahan ber-unit gram'; end if;
    return p_input_qty * 1000;
  end if;
  if p_input_unit = 'gram' and p_ingredient_unit <> 'gram' then
    raise exception 'Gram hanya untuk bahan ber-unit gram';
  end if;
  if p_input_unit = 'liter' and p_ingredient_unit <> 'liter' then
    raise exception 'Liter hanya untuk bahan ber-unit liter';
  end if;
  if p_input_unit = 'pcs' and p_ingredient_unit <> 'pcs' then
    raise exception 'Pcs hanya untuk bahan ber-unit pcs';
  end if;
  return p_input_qty;
end; $$;

create or replace function public.compute_product_cogs(p_product_id bigint)
returns numeric language sql stable as $$
  select coalesce(sum(r.quantity * i.average_cost), 0)::numeric(12,2)
  from public.recipes r
  join public.ingredients i on i.id = r.ingredient_id
  where r.product_id = p_product_id;
$$;

create or replace function public.refresh_product_cogs(p_product_id bigint default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.products p
  set cogs = public.compute_product_cogs(p.id)
  where p_product_id is null or p.id = p_product_id;
end; $$;

-- Catat pembelian: update stok + weighted average cost + movement.
create or replace function public.record_stock_purchase(
  p_ingredient_id bigint,
  p_purchased_at date,
  p_input_quantity numeric,
  p_input_unit public.purchase_input_unit,
  p_pack_size numeric,
  p_total_price numeric,
  p_note text default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_ing public.ingredients%rowtype;
  v_base numeric;
  v_unit_cost numeric;
  v_purchase_id bigint;
  v_new_avg numeric;
begin
  select * into v_ing from public.ingredients where id = p_ingredient_id for update;
  if not found then raise exception 'Bahan tidak ditemukan'; end if;

  v_base := public.to_base_quantity(p_input_quantity, p_input_unit, p_pack_size, v_ing.unit);
  v_unit_cost := round(p_total_price / v_base, 4);

  insert into public.stock_purchases (
    ingredient_id, purchased_at, input_quantity, input_unit, pack_size,
    total_price, base_quantity, unit_cost, note
  ) values (
    p_ingredient_id, p_purchased_at, p_input_quantity, p_input_unit, p_pack_size,
    p_total_price, v_base, v_unit_cost, p_note
  ) returning id into v_purchase_id;

  if v_ing.current_stock + v_base = 0 then
    v_new_avg := v_unit_cost;
  else
    v_new_avg := round(
      ((v_ing.current_stock * v_ing.average_cost) + (v_base * v_unit_cost)) / (v_ing.current_stock + v_base),
      4
    );
  end if;

  update public.ingredients
  set current_stock = current_stock + v_base,
      average_cost = v_new_avg
  where id = p_ingredient_id;

  insert into public.stock_movements (ingredient_id, type, quantity, unit_cost, reference_type, reference_id, note)
  values (p_ingredient_id, 'purchase', v_base, v_unit_cost, 'purchase', v_purchase_id, coalesce(p_note, 'Pembelian stok'));

  perform public.refresh_product_cogs();
  return v_purchase_id;
end; $$;

create or replace function public.complete_order(
  p_order_id bigint,
  p_method public.payment_method,
  p_cash_received numeric default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  item record;
  recipe record;
  v_total numeric;
  v_line_cogs numeric;
begin
  select total into v_total from public.orders where id = p_order_id and status = 'open' for update;
  if v_total is null then raise exception 'Order tidak ditemukan atau sudah selesai'; end if;
  if p_method = 'cash' and coalesce(p_cash_received, 0) < v_total then
    raise exception 'Nominal cash tidak mencukupi';
  end if;

  for item in
    select oi.id, oi.product_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id and oi.product_id is not null
  loop
    v_line_cogs := public.compute_product_cogs(item.product_id);
    update public.order_items set cogs_at_sale = v_line_cogs where id = item.id;

    for recipe in
      select r.ingredient_id, r.quantity
      from public.recipes r
      where r.product_id = item.product_id
    loop
      update public.ingredients
      set current_stock = current_stock - (recipe.quantity * item.quantity)
      where id = recipe.ingredient_id;

      insert into public.stock_movements (ingredient_id, type, quantity, unit_cost, reference_type, reference_id, note)
      select recipe.ingredient_id, 'sale', -(recipe.quantity * item.quantity), i.average_cost, 'order', p_order_id, 'Pemakaian otomatis dari POS'
      from public.ingredients i where i.id = recipe.ingredient_id;
    end loop;
  end loop;

  insert into public.payments (order_id, method, amount, cash_received, status, paid_at)
  values (p_order_id, p_method, v_total, p_cash_received, 'paid', now());

  update public.orders set status = 'paid' where id = p_order_id;

  insert into public.notifications (type, title, body, ingredient_id)
  select 'low_stock', 'Stok menipis: ' || name,
    current_stock || ' ' || unit || ' tersisa (minimum ' || minimum_stock || ')', id
  from public.ingredients
  where current_stock <= minimum_stock
    and not exists (
      select 1 from public.notifications n
      where n.ingredient_id = ingredients.id and n.type = 'low_stock' and not n.is_read
    );

  perform public.refresh_product_cogs();
end; $$;

create or replace view public.daily_financials as
select
  date(p.paid_at at time zone 'Asia/Jakarta') as report_date,
  count(distinct o.id)::int as order_count,
  coalesce(sum(o.total), 0)::numeric(12,2) as revenue,
  coalesce(sum(oi.cogs_at_sale * oi.quantity), 0)::numeric(12,2) as total_cogs,
  coalesce(sum(o.total), 0) - coalesce(sum(oi.cogs_at_sale * oi.quantity), 0) as gross_profit
from public.orders o
join public.payments p on p.order_id = o.id and p.status = 'paid'
join public.order_items oi on oi.order_id = o.id
group by 1
order by 1 desc;

create or replace view public.monthly_financials as
select
  date_trunc('month', p.paid_at at time zone 'Asia/Jakarta')::date as report_month,
  count(distinct o.id)::int as order_count,
  coalesce(sum(o.total), 0)::numeric(12,2) as revenue,
  coalesce(sum(oi.cogs_at_sale * oi.quantity), 0)::numeric(12,2) as total_cogs,
  coalesce(sum(o.total), 0) - coalesce(sum(oi.cogs_at_sale * oi.quantity), 0) as gross_profit
from public.orders o
join public.payments p on p.order_id = o.id and p.status = 'paid'
join public.order_items oi on oi.order_id = o.id
group by 1
order by 1 desc;

-- RLS
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.stock_purchases enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.stock_movements enable row level security;
alter table public.notifications enable row level security;

create policy "authenticated read catalog" on public.categories for select to authenticated using (true);
create policy "authenticated read products" on public.products for select to authenticated using (true);
create policy "authenticated read inventory" on public.ingredients for select to authenticated using (true);
create policy "authenticated read recipes" on public.recipes for select to authenticated using (true);
create policy "authenticated read purchases" on public.stock_purchases for select to authenticated using (true);
create policy "authenticated read notifications" on public.notifications for select to authenticated using (true);
create policy "authenticated read movements" on public.stock_movements for select to authenticated using (true);
create policy "staff read own orders" on public.orders for select to authenticated
  using (cashier_id = auth.uid() or exists(select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin')));
create policy "authenticated read paid orders" on public.orders for select to authenticated using (status = 'paid');
create policy "authenticated read order items" on public.order_items for select to authenticated using (true);
create policy "authenticated read payments" on public.payments for select to authenticated using (true);
create policy "authenticated create orders" on public.orders for insert to authenticated with check (true);
create policy "authenticated add order items" on public.order_items for insert to authenticated with check (true);
create policy "authenticated record purchase" on public.stock_purchases for insert to authenticated with check (true);
create policy "authenticated update notifications" on public.notifications for update to authenticated using (true);

grant execute on function public.complete_order(bigint, public.payment_method, numeric) to authenticated;
grant execute on function public.record_stock_purchase(bigint, date, numeric, public.purchase_input_unit, numeric, numeric, text) to authenticated;
grant execute on function public.compute_product_cogs(bigint) to authenticated, anon;

-- MVP anon (no login screen)
create policy "anon read catalog" on public.categories for select to anon using (true);
create policy "anon read products" on public.products for select to anon using (true);
create policy "anon read inventory" on public.ingredients for select to anon using (true);
create policy "anon read recipes" on public.recipes for select to anon using (true);
create policy "anon read purchases" on public.stock_purchases for select to anon using (true);
create policy "anon read notifications" on public.notifications for select to anon using (true);
create policy "anon update notifications" on public.notifications for update to anon using (true);
create policy "anon read movements" on public.stock_movements for select to anon using (true);
create policy "anon read paid orders" on public.orders for select to anon using (status = 'paid');
create policy "anon read order items" on public.order_items for select to anon using (true);
create policy "anon read payments" on public.payments for select to anon using (true);
create policy "anon create orders" on public.orders for insert to anon with check (true);
create policy "anon add order items" on public.order_items for insert to anon with check (true);

grant select on public.daily_financials to anon, authenticated;
grant select on public.monthly_financials to anon, authenticated;

grant execute on function public.complete_order(bigint, public.payment_method, numeric) to anon;
grant execute on function public.record_stock_purchase(bigint, date, numeric, public.purchase_input_unit, numeric, numeric, text) to anon;

alter publication supabase_realtime add table public.ingredients, public.orders, public.notifications;

-- Seed data
insert into public.categories (name) values ('Chicken'), ('Beef'), ('Drink'), ('Fries'), ('Add-on');

insert into public.ingredients (name, unit, current_stock, minimum_stock, average_cost) values
  ('Ayam crispy', 'gram', 50000, 5000, 0.12),
  ('Kol', 'gram', 10000, 1000, 0.008),
  ('Wortel', 'gram', 10000, 1000, 0.01),
  ('Mayonnaise', 'gram', 5000, 500, 0.035),
  ('Roti brioche', 'pcs', 100, 20, 4000),
  ('Bungkus', 'pcs', 200, 40, 2000),
  ('Patty beef', 'gram', 30000, 3000, 0.15),
  ('Keju cheddar', 'gram', 8000, 800, 0.09),
  ('French fries', 'gram', 20000, 2000, 0.018),
  ('Coke syrup', 'liter', 10, 2, 45000),
  ('Salad mix', 'gram', 5000, 500, 0.012);

insert into public.products (category_id, name, selling_price, cogs, emoji)
select c.id, x.name, x.price, 0, x.emoji
from (values
  ('Chicken', 'Ortbun', 27000, '🍔'), ('Chicken', 'Emjbun', 28000, '🍔'),
  ('Chicken', 'Sakurami', 28000, '🍔'), ('Chicken', 'Sunnyhami', 27000, '🍔'),
  ('Beef', 'Ottobun', 25000, '🍔'), ('Beef', 'Smokybun', 26000, '🍔'),
  ('Beef', 'Rosgun', 26000, '🍔'), ('Drink', 'Coke Soda', 5000, '🥤'),
  ('Drink', 'Strawberry Soda', 5000, '🥤'), ('Fries', 'Mayo Fries', 15000, '🍟'),
  ('Fries', 'BBQ Fries', 16000, '🍟'), ('Fries', 'Teriyaki Fries', 16000, '🍟'),
  ('Add-on', 'Extra Chicken', 12000, '🍗'), ('Add-on', 'Extra Beef', 10000, '🥩'),
  ('Add-on', 'Eggs', 5000, '🍳'), ('Add-on', 'Cheese', 5000, '🧀')
) as x(category, name, price, emoji)
join public.categories c on c.name = x.category;

-- Resep contoh Ortbun: ayam 75g, kol 5g, wortel 5g, mayo 10g, roti 1 pcs, bungkus 1 pcs
insert into public.recipes (product_id, ingredient_id, quantity)
select p.id, i.id, r.qty
from public.products p
join (values
  ('Ortbun', 'Ayam crispy', 75),
  ('Ortbun', 'Kol', 5),
  ('Ortbun', 'Wortel', 5),
  ('Ortbun', 'Mayonnaise', 10),
  ('Ortbun', 'Roti brioche', 1),
  ('Ortbun', 'Bungkus', 1),
  ('Emjbun', 'Ayam crispy', 80),
  ('Emjbun', 'Kol', 5),
  ('Emjbun', 'Wortel', 5),
  ('Emjbun', 'Mayonnaise', 12),
  ('Emjbun', 'Roti brioche', 1),
  ('Emjbun', 'Bungkus', 1),
  ('Emjbun', 'Keju cheddar', 15),
  ('Ottobun', 'Patty beef', 90),
  ('Ottobun', 'Kol', 5),
  ('Ottobun', 'Wortel', 5),
  ('Ottobun', 'Mayonnaise', 10),
  ('Ottobun', 'Roti brioche', 1),
  ('Ottobun', 'Bungkus', 1),
  ('Mayo Fries', 'French fries', 150),
  ('Mayo Fries', 'Mayonnaise', 20),
  ('Mayo Fries', 'Bungkus', 1),
  ('Coke Soda', 'Coke syrup', 0.05)
) as r(product, ingredient, qty) on r.product = p.name
join public.ingredients i on i.name = r.ingredient;

select public.refresh_product_cogs();

-- Contoh pembelian: roti @ Rp4.000/pcs, bungkus 1 pack (20 pcs) @ Rp40.000
select public.record_stock_purchase(
  (select id from public.ingredients where name = 'Roti brioche'),
  current_date, 50, 'pcs', null, 200000, 'Restock roti'
);
select public.record_stock_purchase(
  (select id from public.ingredients where name = 'Bungkus'),
  current_date, 1, 'pack', 20, 40000, 'Beli 1 pack = 20 pcs → Rp2.000/pcs'
);
