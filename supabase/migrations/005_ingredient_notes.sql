-- Store a permanent note for each ingredient. The price calculation remains in the client:
-- total purchase price / base quantity (for example Rp50,000 / 2,000 g = Rp25/g).
alter table public.ingredients add column if not exists note text;

create or replace function public.update_inventory_item(
  p_ingredient_id bigint,
  p_name text,
  p_current_stock numeric,
  p_minimum_stock numeric,
  p_average_cost numeric,
  p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_old public.ingredients%rowtype; v_delta numeric;
begin
  if nullif(trim(p_name), '') is null then raise exception 'Nama bahan wajib diisi'; end if;
  if p_current_stock < 0 or p_minimum_stock < 0 or p_average_cost < 0 then raise exception 'Nilai tidak boleh negatif'; end if;
  select * into v_old from public.ingredients where id = p_ingredient_id for update;
  if not found then raise exception 'Bahan tidak ditemukan'; end if;
  v_delta := p_current_stock - v_old.current_stock;
  update public.ingredients set name = trim(p_name), current_stock = p_current_stock, minimum_stock = p_minimum_stock,
    average_cost = p_average_cost, note = nullif(trim(p_note), '') where id = p_ingredient_id;
  if v_delta <> 0 then
    insert into public.stock_movements (ingredient_id, type, quantity, unit_cost, reference_type, note)
    values (p_ingredient_id, 'adjustment', v_delta, p_average_cost, 'inventory_adjustment', 'Penyesuaian stok fisik');
  end if;
  perform public.refresh_product_cogs();
end; $$;

create or replace function public.create_inventory_item(
  p_name text, p_unit public.ingredient_unit, p_current_stock numeric, p_minimum_stock numeric,
  p_average_cost numeric, p_note text default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_ingredient_id bigint;
begin
  if nullif(trim(p_name), '') is null then raise exception 'Nama bahan wajib diisi'; end if;
  if p_current_stock < 0 or p_minimum_stock < 0 or p_average_cost < 0 then raise exception 'Nilai tidak boleh negatif'; end if;
  insert into public.ingredients (name, unit, current_stock, minimum_stock, average_cost, note)
  values (trim(p_name), p_unit, p_current_stock, p_minimum_stock, p_average_cost, nullif(trim(p_note), '')) returning id into v_ingredient_id;
  if p_current_stock > 0 then
    insert into public.stock_movements (ingredient_id, type, quantity, unit_cost, reference_type, note)
    values (v_ingredient_id, 'adjustment', p_current_stock, p_average_cost, 'initial_inventory', 'Stok awal bahan baru');
  end if;
  return v_ingredient_id;
end; $$;

grant execute on function public.update_inventory_item(bigint, text, numeric, numeric, numeric, text) to anon, authenticated;
grant execute on function public.create_inventory_item(text, public.ingredient_unit, numeric, numeric, numeric, text) to anon, authenticated;
