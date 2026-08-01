-- Hapus menu beserta resepnya, dan perbaiki notifikasi stok menipis agar tidak berulang.
-- 1) delete_product: menghapus produk + resep; riwayat transaksi lama tetap tersimpan (product_id jadi null, nama produk tetap).
-- 2) complete_order: notifikasi low_stock hanya dibuat sekali per bahan per hari, tidak mengulang walau notif lama sudah dibaca.

create or replace function public.delete_product(p_product_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Menu tidak ditemukan';
  end if;
  delete from public.recipes where product_id = p_product_id;
  delete from public.products where id = p_product_id;
  perform public.refresh_product_cogs();
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

  -- Satu notifikasi per bahan per hari saja, terlepas dari status dibaca atau belum.
  insert into public.notifications (type, title, body, ingredient_id)
  select 'low_stock', 'Stok menipis: ' || name,
    current_stock || ' ' || unit || ' tersisa (minimum ' || minimum_stock || ')', id
  from public.ingredients
  where current_stock <= minimum_stock
    and not exists (
      select 1 from public.notifications n
      where n.ingredient_id = ingredients.id
        and n.type = 'low_stock'
        and (n.created_at at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date
    );

  perform public.refresh_product_cogs();
  perform public.check_daily_sales_goal();
end; $$;

grant execute on function public.delete_product(bigint) to anon, authenticated;
