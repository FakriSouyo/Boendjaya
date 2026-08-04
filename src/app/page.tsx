"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, CircleDollarSign, ClipboardList, Menu, Package, PiggyBank, Plus, ReceiptText, Search, ShoppingBag, UtensilsCrossed, X } from "lucide-react";
import { Button } from "@/components/ui/sensory-ui/button";
import { usePlaySound } from "@/components/ui/sensory-ui/config/use-play-sound";
import { CartPanel } from "@/components/cart-panel";
import { DailyProfitPage } from "@/components/daily-profit-page";
import { DashboardPage } from "@/components/dashboard-page";
import { useDialog } from "@/components/dialog-provider";
import { MenuCogsPage } from "@/components/menu-cogs-page";
import { NotificationBell } from "@/components/notifications-panel";
import { StockPage } from "@/components/stock-page";
import { TransactionHistoryPage } from "@/components/transaction-history-page";
import { currency, makeOrderNumber } from "@/lib/format";
import {
  addDemoTodayRevenue,
  checkDemoSalesGoal,
  deleteTransaction,
  loadIngredients,
  loadNotifications,
  loadProducts,
  loadPurchases,
  loadRecipes,
  loadSettings,
  loadTransactions,
  markAllNotificationsRead,
  markNotificationRead,
  mergeCatalogWithRecipes,
} from "@/lib/data";
import { demoNotifications as buildLowStockNotifs } from "@/lib/inventory";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { Ingredient, NotificationItem, Product, RecipeLine, StockPurchase, Transaction } from "@/lib/types";

export default function Home() {
  const [view, setView] = useState<"pos" | "dashboard" | "stock" | "menu" | "history" | "profit">("pos");
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Product[]>([]);
  const [payment, setPayment] = useState<"cash" | "qris" | null>(null);
  const [cash, setCash] = useState(0);
  const [cashNotes, setCashNotes] = useState<Record<number, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const [catalog, setCatalog] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [purchases, setPurchases] = useState<StockPurchase[]>([]);
  const [recipes, setRecipes] = useState<RecipeLine[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const { play: navigate } = usePlaySound({ sound: "navigation.tab" });
  const { play: transactionCompleteSound } = usePlaySound({ sound: "notification.milestone" });
  const { showError } = useDialog();
  const categories = ["All", "Chicken", "Beef", "Drink", "Fries", "Add-on"];

  const refreshAll = useCallback(async () => {
    const [products, ings, purch, notifs, transactionRows] = await Promise.all([
      loadProducts(),
      loadIngredients(),
      loadPurchases(),
      loadNotifications(),
      loadTransactions(),
    ]);
    const rec = await loadRecipes(ings);
    setIngredients(ings);
    setPurchases(purch);
    setRecipes(rec);
    setNotifications(notifs);
    setTransactions(transactionRows);
    setCatalog(mergeCatalogWithRecipes(products, rec));
  }, []);

  useEffect(() => { void refreshAll(); }, [refreshAll]);

  const items = useMemo(
    () => catalog.filter(p => (category === "All" || p.category === category) && p.name.toLowerCase().includes(query.toLowerCase())),
    [catalog, category, query],
  );
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  const cartIds = useMemo(() => Array.from(new Set(cart.map(x => x.id))), [cart]);
  const quantity = (id: number) => cart.filter(x => x.id === id).length;
  const add = (product: Product) => setCart(c => [...c, product]);
  const remove = (id: number) => {
    const index = cart.findIndex(x => x.id === id);
    if (index > -1) setCart(c => c.filter((_, i) => i !== index));
  };
  const openPayment = () => { setCartOpen(false); setCash(0); setCashNotes({}); setPayment("cash"); };

  const finish = async () => {
    if (!payment || (payment === "cash" && cash < total)) return;
    if (supabase) {
      const items = Array.from(new Set(cart.map(item => item.id))).map(id => ({ product_id: id, quantity: quantity(id) }));
      const { error } = await supabase.rpc("checkout_order", {
        p_order_number: makeOrderNumber(),
        p_items: items,
        p_method: payment,
        p_cash_received: payment === "cash" ? cash : null,
      });
      if (error) { showError(error.message); return; }
      await refreshAll();
    } else {
      const settings = await loadSettings();
      const todayRev = addDemoTodayRevenue(total);
      const goalNotif = checkDemoSalesGoal(todayRev, settings.dailyRevenueTarget, notifications);
      const lowNotifs = buildLowStockNotifs(ingredients).filter(n =>
        !notifications.some(x => x.type === "low_stock" && x.title === n.title),
      );
      const transactionNotif: NotificationItem = {
        id: Date.now(), type: "transaction_complete", title: "Transaksi berhasil",
        body: `${payment === "cash" ? "Cash" : "QRIS"} · ${currency(total)}`,
        isRead: false, createdAt: new Date().toISOString(),
      };
      const extra = [transactionNotif, ...(goalNotif ? [{ ...goalNotif, id: Date.now() + 1 }] : []), ...lowNotifs.map((n, i) => ({ ...n, id: Date.now() + i + 2 }))];
      if (extra.length) setNotifications(n => [...extra, ...n]);
    }
    setCart([]);
    setPayment(null);
    setCash(0);
    setCashNotes({});
    setCartOpen(false);
    transactionCompleteSound();
  };

  const setTab = (tab: typeof view) => { navigate(); setView(tab); setNotifOpen(false); };

  const addCashNote = (amount: number) => {
    setCashNotes(notes => ({ ...notes, [amount]: (notes[amount] ?? 0) + 1 }));
    setCash(value => value + amount);
  };

  const removeCashNote = (amount: number) => {
    if (!cashNotes[amount]) return;
    setCashNotes(notes => ({ ...notes, [amount]: notes[amount] - 1 }));
    setCash(value => value - amount);
  };

  const onMarkRead = async (id: number) => {
    setNotifications(n => n.map(x => x.id === id ? { ...x, isRead: true } : x));
    await markNotificationRead(id);
  };

  const onMarkAllRead = async () => {
    const unread = notifications.filter(n => !n.isRead).map(n => n.id);
    setNotifications(n => n.map(x => ({ ...x, isRead: true })));
    await markAllNotificationsRead(unread);
  };

  return (
    <main className="min-h-screen bg-[#fffdfb] pb-[calc(3.25rem+env(safe-area-inset-bottom))] text-[#17100e] md:pb-0">
      <header className="sticky top-0 z-20 border-b border-[#ef4130] bg-[#fffdfb]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <button type="button" onClick={() => setTab("pos")} className="font-serif text-2xl font-black leading-[.72] tracking-tighter text-[#e73b28]">Boen<br/>djaya</button>
          <nav className="hidden items-center gap-1 md:flex">
            {[["pos", ShoppingBag, "POS"], ["history", ReceiptText, "Transaksi"], ["profit", PiggyBank, "Profit"], ["dashboard", ClipboardList, "Dashboard"], ["stock", Package, "Stok"], ["menu", UtensilsCrossed, "Menu & COGS"]].map(([key, Icon, label]) => (
              <Button key={key as string} sound="navigation.tab" variant={view === key ? "default" : "ghost"} onClick={() => setTab(key as typeof view)} className="rounded-none text-xs">
                <Icon className="size-3.5" />{label as string}
              </Button>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <NotificationBell
              notifications={notifications}
              open={notifOpen}
              onToggle={() => setNotifOpen(o => !o)}
              onClose={() => setNotifOpen(false)}
              onMarkRead={id => void onMarkRead(id)}
              onMarkAllRead={() => void onMarkAllRead()}
            />
            <span className="hidden font-mono text-[10px] text-zinc-500 sm:block">
              OUTLET UTAMA<br/><b className="text-[#e73b28]">{isSupabaseConfigured ? "ONLINE" : "DEMO"}</b>
            </span>
          </div>
        </div>
      </header>

      {view === "pos" && (
        <>
          <section className={`mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:grid lg:grid-cols-[1fr_360px] lg:gap-0 lg:border-x lg:border-[#e8ddd8] ${cart.length ? "pb-24 lg:pb-5" : ""}`}>
            <div className="min-w-0 lg:border-r lg:border-[#e8ddd8] lg:pr-6">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4 sm:mb-7">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[.2em] text-zinc-500">Point of sale · outlet utama</p>
                  <h1 className="mt-1 text-2xl font-black tracking-tight text-[#e73b28] sm:text-3xl">BUAT PESANAN</h1>
                </div>
              </div>
              <div className="mb-4 flex gap-2 border-b border-[#e8ddd8] pb-4 sm:mb-5">
                <label className="flex h-9 flex-1 items-center gap-2 border border-[#d8ccc6] bg-white px-3">
                  <Search className="size-4 shrink-0 text-[#e73b28]"/>
                  <input value={query} onChange={e => setQuery(e.target.value)} className="w-full bg-transparent text-xs outline-none" placeholder="Cari menu..."/>
                </label>
              </div>
              <div className="mb-4 flex gap-2 overflow-x-auto pb-1 sm:mb-6">
                {categories.map(tab => (
                  <Button key={tab} sound="navigation.tab" onClick={() => { navigate(); setCategory(tab); }} variant={category === tab ? "default" : "outline"} className="shrink-0 rounded-none text-xs">{tab}</Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-px border border-[#eadeda] bg-[#eadeda] sm:grid-cols-3">
                {items.map(product => (
                  <button key={product.id} type="button" onClick={() => add(product)} className="group bg-[#fffdfb] p-3 text-left transition-colors hover:bg-[#fff1ee] sm:p-4">
                    <div className="mb-3 flex items-start justify-between sm:mb-5">
                      <span className="grid size-9 place-items-center bg-[#fff0ec] text-xl sm:size-11 sm:text-2xl">{product.emoji}</span>
                      <Plus className="size-4 text-[#ef4130] opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100"/>
                    </div>
                    <p className="text-xs font-bold sm:text-sm">{product.name}</p>
                    <p className="mt-1 font-mono text-[9px] text-zinc-500 sm:text-[10px]">{product.category.toUpperCase()}</p>
                    <p className="mt-2 text-xs font-black text-[#e73b28] sm:mt-4 sm:text-sm">{currency(product.price)}</p>
                  </button>
                ))}
              </div>
            </div>
            <aside className="hidden min-h-[500px] flex-col border border-[#e73b28] bg-white lg:flex">
              <CartPanel cart={cart} cartIds={cartIds} catalog={catalog} quantity={quantity} add={add} remove={remove} total={total} onClear={() => setCart([])} onCheckout={openPayment} />
            </aside>
          </section>

          {cart.length > 0 && (
            <div className="fixed inset-x-0 bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-10 border-t-2 border-[#e73b28] bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.08)] lg:hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <button type="button" onClick={() => setCartOpen(true)} className="min-w-0 flex-1 text-left">
                  <p className="font-mono text-[10px] text-zinc-500">{cart.length} item · ketuk lihat detail</p>
                  <p className="truncate text-lg font-black text-[#e73b28]">{currency(total)}</p>
                </button>
                <Button sound="navigation.forward" onClick={openPayment} className="shrink-0 rounded-none px-5">BAYAR</Button>
              </div>
            </div>
          )}

          {cartOpen && (
            <div className="fixed inset-0 z-20 lg:hidden">
              <button type="button" aria-label="Tutup keranjang" className="absolute inset-0 bg-black/30" onClick={() => setCartOpen(false)} />
              <aside className="absolute inset-x-0 bottom-[calc(3.25rem+env(safe-area-inset-bottom))] flex max-h-[min(72vh,32rem)] flex-col border-t-2 border-[#e73b28] bg-white">
                <CartPanel cart={cart} cartIds={cartIds} catalog={catalog} quantity={quantity} add={add} remove={remove} total={total} onClear={() => setCart([])} onCheckout={openPayment} onClose={() => setCartOpen(false)} mobile />
              </aside>
            </div>
          )}
        </>
      )}

      {view === "dashboard" && <DashboardPage ingredients={ingredients} onGoalSaved={() => void refreshAll()} />}
      {view === "profit" && <DailyProfitPage />}
      {view === "history" && <TransactionHistoryPage transactions={transactions} onDelete={async id => {
        await deleteTransaction(id);
        await refreshAll();
      }} />}
      {view === "stock" && (
        <StockPage
          ingredients={ingredients}
          purchases={purchases}
          onIngredientsChange={setIngredients}
          onPurchasesChange={setPurchases}
          onProductsRefresh={() => void refreshAll()}
        />
      )}
      {view === "menu" && (
        <MenuCogsPage
          products={catalog}
          recipes={recipes}
          ingredients={ingredients}
          onSaved={() => void refreshAll()}
          onDemoSave={(prods, recs) => {
            setCatalog(prods);
            setRecipes(recs);
          }}
        />
      )}

      <nav className={`fixed inset-x-0 bottom-0 z-20 flex border-t border-[#e8ddd8] bg-white pb-[env(safe-area-inset-bottom)] md:hidden ${payment || cartOpen || notifOpen ? "hidden" : ""}`}>
        {[["pos", ShoppingBag, "POS"], ["history", ReceiptText, "Riwayat"], ["profit", PiggyBank, "Profit"], ["dashboard", ClipboardList, "Laporan"], ["stock", Package, "Stok"], ["menu", UtensilsCrossed, "COGS"]].map(([key, Icon, label]) => (
          <button key={key as string} type="button" onClick={() => setTab(key as typeof view)} className={`flex flex-1 flex-col items-center gap-1 py-3 text-[9px] ${view === key ? "bg-[#ef4130] text-white" : "text-zinc-500"}`}>
            <Icon className="size-4"/>{label as string}
          </button>
        ))}
      </nav>

      {payment && (
        <div className="fixed inset-0 z-30 grid place-items-end bg-black/30 sm:place-items-center sm:p-5">
          <div className="max-h-[calc(100dvh-env(safe-area-inset-bottom))] w-full max-w-md overflow-y-auto bg-white sm:border-2 sm:border-[#ef4130]">
            <div className="flex items-start justify-between bg-[#ef4130] p-5 text-white">
              <div><p className="font-mono text-[10px]">TOTAL TAGIHAN</p><h2 className="text-3xl font-black">{currency(total)}</h2></div>
              <Button sound="overlay.close" variant="ghost" size="icon" onClick={() => setPayment(null)} className="rounded-none text-white hover:bg-white/10 hover:text-white"><X/></Button>
            </div>
            <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
              <p className="mb-2 font-mono text-[10px] text-zinc-500">PILIH METODE PEMBAYARAN</p>
              <div className="mb-5 grid grid-cols-2 gap-2">
                <Button sound="interaction.toggle" onClick={() => setPayment("cash")} variant={payment === "cash" ? "default" : "outline"} className="h-auto rounded-none py-4"><CircleDollarSign/> CASH</Button>
                <Button sound="interaction.toggle" onClick={() => setPayment("qris")} variant={payment === "qris" ? "default" : "outline"} className="h-auto rounded-none py-4"><span className="font-mono text-lg">QR</span> QRIS</Button>
              </div>
              {payment === "cash" ? (
                <>
                  <label className="font-mono text-[10px] text-zinc-500">UANG DITERIMA
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {[10000, 20000, 50000, 100000].map(amount => <button key={amount} type="button" onClick={() => addCashNote(amount)} className="border border-[#d8ccc6] bg-white p-3 text-left text-xs font-bold hover:border-[#ef4130] hover:bg-[#fff0ec]">{currency(amount)}<span className="mt-1 block font-mono text-[10px] font-normal text-zinc-500">{cashNotes[amount] ?? 0} lembar</span></button>)}
                    </div>
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { setCash(total); setCashNotes({}); }} className="border border-[#ef4130] bg-[#fff0ec] px-3 py-2 font-mono text-[10px] font-bold text-[#e73b28]">UANG PAS ({currency(total)})</button>{cash > 0 && [10000, 20000, 50000, 100000].filter(amount => cashNotes[amount]).map(amount => <button key={amount} type="button" onClick={() => removeCashNote(amount)} className="border border-[#d8ccc6] px-2 py-1 font-mono text-[10px] hover:border-[#ef4130]">- {currency(amount)} ({cashNotes[amount]})</button>)}{cash > 0 && <button type="button" onClick={() => { setCash(0); setCashNotes({}); }} className="px-2 py-1 font-mono text-[10px] text-zinc-500">RESET</button>}</div>
                  <div className="my-4 space-y-2 bg-[#fff0ec] p-3 text-xs"><div className="flex justify-between"><span>UANG DITERIMA</span><b>{currency(cash)}</b></div><div className="flex justify-between"><span>KEMBALIAN</span><b className="text-[#e73b28]">{currency(Math.max(0, cash - total))}</b></div>{cash > 0 && cash < total && <p className="text-[#e73b28]">Kurang {currency(total - cash)}</p>}</div>
                </>
              ) : (
                <div className="my-4 grid place-items-center border border-dashed border-[#ef4130] p-5 text-center">
                  <div className="mb-3 grid size-24 place-items-center bg-[#17100e] font-mono text-3xl text-white">▦</div>
                  <p className="font-mono text-[10px]">SCAN QRIS UNTUK MEMBAYAR</p>
                </div>
              )}
              <Button sound="interaction.confirm" onClick={() => void finish()} className="w-full rounded-none">KONFIRMASI PEMBAYARAN</Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
