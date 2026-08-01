-- Run after 001_boendjaya.sql · edit purchases, menu/resep CRUD, target penjualan harian

create table if not exists public.outlet_settings (
  id int primary key default 1 check (id = 1),
  daily_revenue_target numeric(12,2) not null default 3000000,
  goal_notified_date date,
  updated_at timestamptz not null default now()
);
insert into public.outlet_settings (id) values (1) on conflict (id) do nothing;

alter table public.outlet_settings enable row level security;
create policy "anon read settings" on public.outlet_settings for select to anon using (true);
create policy "anon update settings" on public.outlet_settings for update to anon using (true);
create policy "authenticated read settings" on public.outlet_settings for select to authenticated using (true);
create policy "authenticated update settings" on public.outlet_settings for update to authenticated using (true);

create or replace function public.recalc_ingredient_average(p_ingredient_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_avg numeric;
begin
  select coalesce(round(sum(base_quantity * unit_cost) / nullif(sum(base_quantity), 0), 4), 0)
  into v_avg from public.stock_purchases where ingredient_id = p_ingredient_id;
  update public.ingredients set average_cost = v_avg where id = p_ingredient_id;
end; $$;

create or replace function public.update_stock_purchase(
  p_purchase_id bigint,
  p_purchased_at date,
  p_input_quantity numeric,
  p_input_unit public.purchase_input_unit,
  p_pack_size numeric,
  p_total_price numeric,
  p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_old public.stock_purchases%rowtype;
  v_ing public.ingredients%rowtype;
  v_base numeric;
  v_unit_cost numeric;
  v_delta numeric;
begin
  select * into v_old from public.stock_purchases where id = p_purchase_id for update;
  if not found then raise exception 'Pembelian tidak ditemukan'; end if;
  select * into v_ing from public.ingredients where id = v_old.ingredient_id for update;

  v_base := public.to_base_quantity(p_input_quantity, p_input_unit, p_pack_size, v_ing.unit);
  v_unit_cost := round(p_total_price / v_base, 4);
  v_delta := v_base - v_old.base_quantity;

  update public.stock_purchases set
    purchased_at = p_purchased_at,
    input_quantity = p_input_quantity,
    input_unit = p_input_unit,
    pack_size = p_pack_size,
    total_price = p_total_price,
    base_quantity = v_base,
    unit_cost = v_unit_cost,
    note = p_note
  where id = p_purchase_id;

  update public.ingredients
  set current_stock = greatest(0, current_stock + v_delta)
  where id = v_old.ingredient_id;

  update public.stock_movements set
    quantity = v_base,
    unit_cost = v_unit_cost,
    note = coalesce(p_note, 'Pembelian stok (diubah)')
  where reference_type = 'purchase' and reference_id = p_purchase_id;

  perform public.recalc_ingredient_average(v_old.ingredient_id);
  perform public.refresh_product_cogs();
end; $$;

create or replace function public.delete_stock_purchase(p_purchase_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_old public.stock_purchases%rowtype;
begin
  select * into v_old from public.stock_purchases where id = p_purchase_id for update;
  if not found then raise exception 'Pembelian tidak ditemukan'; end if;

  update public.ingredients
  set current_stock = greatest(0, current_stock - v_old.base_quantity)
  where id = v_old.ingredient_id;

  delete from public.stock_movements
  where reference_type = 'purchase' and reference_id = p_purchase_id;

  delete from public.stock_purchases where id = p_purchase_id;

  perform public.recalc_ingredient_average(v_old.ingredient_id);
  perform public.refresh_product_cogs();
end; $$;

create or replace function public.save_product_recipes(
  p_product_id bigint,
  p_name text,
  p_category_name text,
  p_selling_price numeric,
  p_emoji text,
  p_active boolean,
  p_recipes jsonb
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_cat_id bigint;
  v_pid bigint;
  r jsonb;
begin
  select id into v_cat_id from public.categories where name = p_category_name;
  if v_cat_id is null then raise exception 'Kategori tidak ditemukan'; end if;

  if p_product_id is null or p_product_id = 0 then
    insert into public.products (category_id, name, selling_price, emoji, active)
    values (v_cat_id, p_name, p_selling_price, coalesce(nullif(p_emoji, ''), '🍔'), coalesce(p_active, true))
    returning id into v_pid;
  else
    update public.products set
      category_id = v_cat_id,
      name = p_name,
      selling_price = p_selling_price,
      emoji = coalesce(nullif(p_emoji, ''), '🍔'),
      active = coalesce(p_active, true)
    where id = p_product_id;
    v_pid := p_product_id;
    if not found then raise exception 'Menu tidak ditemukan'; end if;
  end if;

  delete from public.recipes where product_id = v_pid;

  for r in select * from jsonb_array_elements(coalesce(p_recipes, '[]'::jsonb)) loop
    insert into public.recipes (product_id, ingredient_id, quantity)
    values (
      v_pid,
      (r->>'ingredient_id')::bigint,
      (r->>'quantity')::numeric
    );
  end loop;

  perform public.refresh_product_cogs(v_pid);
  return v_pid;
end; $$;

create or replace function public.check_daily_sales_goal()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_target numeric;
  v_notified date;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_revenue numeric;
begin
  select daily_revenue_target, goal_notified_date into v_target, v_notified
  from public.outlet_settings where id = 1;
  if coalesce(v_target, 0) <= 0 then return; end if;

  select coalesce(sum(o.total), 0) into v_revenue
  from public.orders o
  join public.payments p on p.order_id = o.id and p.status = 'paid'
  where date(p.paid_at at time zone 'Asia/Jakarta') = v_today;

  if v_revenue >= v_target and coalesce(v_notified, '1900-01-01') < v_today then
    insert into public.notifications (type, title, body)
    values (
      'sales_goal',
      'Target penjualan tercapai!',
      'Penjualan hari ini ' || to_char(v_revenue, 'FM999G999G999') || ' · target ' || to_char(v_target, 'FM999G999G999')
    );
    update public.outlet_settings set goal_notified_date = v_today, updated_at = now() where id = 1;
  end if;
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
  perform public.check_daily_sales_goal();
end; $$;

-- Anon CRUD policies
create policy "anon upsert products" on public.products for insert to anon with check (true);
create policy "anon update products" on public.products for update to anon using (true);
create policy "anon upsert recipes" on public.recipes for insert to anon with check (true);
create policy "anon update recipes" on public.recipes for update to anon using (true);
create policy "anon delete recipes" on public.recipes for delete to anon using (true);
create policy "anon update ingredients" on public.ingredients for update to anon using (true);

grant execute on function public.update_stock_purchase(bigint, date, numeric, public.purchase_input_unit, numeric, numeric, text) to anon, authenticated;
grant execute on function public.delete_stock_purchase(bigint) to anon, authenticated;
grant execute on function public.save_product_recipes(bigint, text, text, numeric, text, boolean, jsonb) to anon, authenticated;
grant execute on function public.check_daily_sales_goal() to anon, authenticated;
