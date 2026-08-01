-- Add an unread notification every time a POS checkout is completed.
create or replace function public.checkout_order(
  p_order_number text,
  p_items jsonb,
  p_method public.payment_method,
  p_cash_received numeric default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_order_id bigint;
  v_total numeric := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
begin
  if nullif(trim(p_order_number), '') is null then raise exception 'Nomor pesanan wajib diisi'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pesanan harus memiliki minimal satu item';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity is null or v_quantity <= 0 then raise exception 'Jumlah item tidak valid'; end if;
    select * into v_product from public.products where id = (v_item->>'product_id')::bigint and active = true for share;
    if not found then raise exception 'Menu tidak ditemukan atau tidak aktif'; end if;
    v_total := v_total + (v_product.selling_price * v_quantity);
  end loop;

  insert into public.orders (order_number, subtotal, total, status)
  values (trim(p_order_number), v_total, v_total, 'open') returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_quantity := (v_item->>'quantity')::integer;
    select * into v_product from public.products where id = (v_item->>'product_id')::bigint;
    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, cogs_at_sale)
    values (v_order_id, v_product.id, v_product.name, v_product.selling_price, v_quantity, v_product.cogs);
  end loop;

  perform public.complete_order(v_order_id, p_method, p_cash_received);
  insert into public.notifications (type, title, body)
  values (
    'transaction_complete',
    'Transaksi berhasil',
    'Pesanan ' || trim(p_order_number) || ' · ' || upper(p_method::text) || ' · Rp' || to_char(v_total, 'FM999G999G999')
  );
  return v_order_id;
end; $$;

grant execute on function public.checkout_order(text, jsonb, public.payment_method, numeric) to anon, authenticated;
