-- Editable inventory master data and stock opname adjustment.
-- A direct stock correction is retained as an adjustment movement for auditability.
create or replace function public.update_inventory_item(
  p_ingredient_id bigint,
  p_name text,
  p_current_stock numeric,
  p_minimum_stock numeric,
  p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_old public.ingredients%rowtype;
  v_delta numeric;
begin
  if nullif(trim(p_name), '') is null then raise exception 'Nama bahan wajib diisi'; end if;
  if p_current_stock < 0 then raise exception 'Stok fisik tidak boleh negatif'; end if;
  if p_minimum_stock < 0 then raise exception 'Batas restock tidak boleh negatif'; end if;

  select * into v_old from public.ingredients where id = p_ingredient_id for update;
  if not found then raise exception 'Bahan tidak ditemukan'; end if;
  v_delta := p_current_stock - v_old.current_stock;

  update public.ingredients
  set name = trim(p_name), current_stock = p_current_stock, minimum_stock = p_minimum_stock
  where id = p_ingredient_id;

  if v_delta <> 0 then
    insert into public.stock_movements (ingredient_id, type, quantity, unit_cost, reference_type, note)
    values (
      p_ingredient_id, 'adjustment', v_delta, v_old.average_cost, 'inventory_adjustment',
      coalesce(nullif(trim(p_note), ''), 'Penyesuaian stok fisik')
    );
  end if;
end; $$;

grant execute on function public.update_inventory_item(bigint, text, numeric, numeric, text) to anon, authenticated;
