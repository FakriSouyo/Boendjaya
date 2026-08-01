-- Allow the POS client to create an order and its items before complete_order() finalizes payment.
-- Recreate policies so this also repairs projects where earlier policies were not applied.
drop policy if exists "anon create orders" on public.orders;
drop policy if exists "authenticated create orders" on public.orders;
drop policy if exists "anon add order items" on public.order_items;
drop policy if exists "authenticated add order items" on public.order_items;

create policy "anon create orders" on public.orders for insert to anon with check (true);
create policy "authenticated create orders" on public.orders for insert to authenticated with check (true);
create policy "anon add order items" on public.order_items for insert to anon with check (true);
create policy "authenticated add order items" on public.order_items for insert to authenticated with check (true);
