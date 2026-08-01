-- Hapus riwayat transaksi berbayar beserta pemulihan stok.
-- Stok bahan yang terpakai dikembalikan, movement 'sale' dan notifikasi transaksi dihapus,
-- order/order_items/payments ikut terhapus (cascade). Laporan keuangan otomatis menyesuaikan.
create or replace function public.delete_order(p_order_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan'; end if;
  if v_order.status <> 'paid' then raise exception 'Hanya transaksi berbayar yang dapat dihapus'; end if;

  -- quantity di stock_movements untuk 'sale' bernilai negatif, sehingga pengurangan menghasilkan pengembalian stok.
  update public.ingredients i
  set current_stock = i.current_stock - m.quantity
  from public.stock_movements m
  where m.ingredient_id = i.id
    and m.reference_type = 'order'
    and m.reference_id = p_order_id
    and m.type = 'sale';

  delete from public.stock_movements
  where reference_type = 'order' and reference_id = p_order_id;

  delete from public.notifications
  where type = 'transaction_complete' and body like 'Pesanan ' || v_order.order_number || '%';

  delete from public.orders where id = p_order_id;
end; $$;

grant execute on function public.delete_order(bigint) to anon, authenticated;
