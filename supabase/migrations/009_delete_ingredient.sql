-- Hapus bahan dari manajemen stok beserta data terkait.
-- Resep menu, riwayat pembelian, pergerakan stok, dan notifikasi bahan ikut dihapus.
-- Data penjualan (order_items.cogs_at_sale) tetap tersimpan sebagai snapshot COGS.
create or replace function public.delete_inventory_item(p_ingredient_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.ingredients where id = p_ingredient_id) then
    raise exception 'Bahan tidak ditemukan';
  end if;

  delete from public.recipes where ingredient_id = p_ingredient_id;
  delete from public.stock_purchases where ingredient_id = p_ingredient_id;
  delete from public.stock_movements where ingredient_id = p_ingredient_id;
  delete from public.notifications where ingredient_id = p_ingredient_id;

  delete from public.ingredients where id = p_ingredient_id;

  perform public.refresh_product_cogs();
end; $$;

grant execute on function public.delete_inventory_item(bigint) to anon, authenticated;
