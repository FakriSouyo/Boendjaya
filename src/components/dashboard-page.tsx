"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/sensory-ui/button";
import { ExportButtons } from "@/components/cart-panel";
import { currency, formatDate, formatMonth, jakartaDate, marginPct } from "@/lib/format";
import { exportFinancialCsv, exportFinancialPdf } from "@/lib/reports";
import { loadProductSales, loadSettings, loadTodayRevenue, saveSettings } from "@/lib/data";
import type { FinancialRow, Ingredient, ProductSaleEntry } from "@/lib/types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";

type Props = {
  ingredients: Ingredient[];
  onGoalSaved?: () => void;
};

export function DashboardPage({ ingredients, onGoalSaved }: Props) {
  const [period, setPeriod] = useState<"daily" | "monthly">("daily");
  const [rows, setRows] = useState<FinancialRow[]>([]);
  const [dailyTarget, setDailyTarget] = useState(3000000);
  const [targetInput, setTargetInput] = useState(3000000);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [productSales, setProductSales] = useState<ProductSaleEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => jakartaDate(new Date().toISOString()));
  const followingDateRef = useRef(true);
  const selectedDateRef = useRef(selectedDate);

  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);

  const refreshGoal = useCallback(async () => {
    const [settings, today] = await Promise.all([loadSettings(), loadTodayRevenue()]);
    setDailyTarget(settings.dailyRevenueTarget);
    setTargetInput(settings.dailyRevenueTarget);
    setTodayRevenue(today);
  }, []);

  useEffect(() => { void refreshGoal(); }, [refreshGoal]);

  useEffect(() => {
    const t = window.setInterval(() => {
      const nowDate = new Date();
      setNow(nowDate);
      const today = jakartaDate(nowDate.toISOString());
      if (followingDateRef.current && today !== selectedDateRef.current) {
        selectedDateRef.current = today;
        setSelectedDate(today);
        void refreshGoal();
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [refreshGoal]);

  useEffect(() => { void loadProductSales().then(setProductSales); }, []);

  const pickDate = (date: string) => {
    const today = jakartaDate(new Date().toISOString());
    followingDateRef.current = today === date;
    selectedDateRef.current = date;
    setSelectedDate(date);
  };

  useEffect(() => {
    if (!supabase) {
      setRows([]);
      return;
    }
    const client = supabase;
    const load = async () => {
      const view = period === "daily" ? "daily_financials" : "monthly_financials";
      const col = period === "daily" ? "report_date" : "report_month";
      const query = client.from(view).select("*");
      if (period === "daily") query.lte("report_date", selectedDate);
      const { data, error } = await query.order(col, { ascending: false }).limit(period === "daily" ? 31 : 12);
      if (error || !data?.length) {
        setRows([]);
        return;
      }
      setRows(data.map(r => {
        const revenue = Number(r.revenue);
        const totalCogs = Number(r.total_cogs);
        return {
          label: String(r[col]),
          orderCount: Number(r.order_count),
          revenue,
          totalCogs,
          grossProfit: Number(r.gross_profit),
          marginPct: marginPct(revenue, totalCogs),
        };
      }));
    };
    void load();
  }, [period, selectedDate]);

  const summary = useMemo(() => {
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const totalCogs = rows.reduce((s, r) => s + r.totalCogs, 0);
    const orders = rows.reduce((s, r) => s + r.orderCount, 0);
    return { revenue, totalCogs, profit: revenue - totalCogs, orders, margin: marginPct(revenue, totalCogs) };
  }, [rows]);

  const goalPct = dailyTarget > 0 ? Math.min(100, Math.round((todayRevenue / dailyTarget) * 100)) : 0;
  const goalReached = dailyTarget > 0 && todayRevenue >= dailyTarget;
  const lowStock = ingredients.filter(i => i.currentStock <= i.minimumStock);
  const title = period === "daily" ? "LAPORAN KEUANGAN HARIAN" : "LAPORAN KEUANGAN BULANAN";
  const filenameBase = period === "daily" ? "boendjaya-harian" : "boendjaya-bulanan";
  const todayJakarta = jakartaDate(new Date().toISOString());

  const selectedRevenue = useMemo(() => {
    if (period === "monthly") return summary.revenue;
    return rows.find(r => r.label === selectedDate)?.revenue ?? 0;
  }, [period, rows, selectedDate, summary.revenue]);
  const firstCardLabel = period === "monthly" ? "TOTAL PENJUALAN" : selectedDate === todayJakarta ? "PENJUALAN HARI INI" : `PENJUALAN ${formatDate(selectedDate)}`;

  const salesByProduct = useMemo(() => {
    const keySet = new Set(rows.map(r => (period === "daily" ? r.label : r.label.slice(0, 7))));
    const agg = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const e of productSales) {
      const key = period === "daily" ? e.dateLabel : e.dateLabel.slice(0, 7);
      if (!keySet.has(key)) continue;
      const cur = agg.get(e.name) ?? { name: e.name, quantity: 0, revenue: 0 };
      cur.quantity += e.quantity;
      cur.revenue += e.revenue;
      agg.set(e.name, cur);
    }
    return [...agg.values()].sort((a, b) => b.quantity - a.quantity);
  }, [productSales, rows, period]);

  const exportPdf = () => void exportFinancialPdf(rows, period, title, `${filenameBase}-${new Date().toISOString().slice(0, 10)}.pdf`, {
    salesByProduct,
    lowStock: lowStock.map(i => ({ name: i.name, currentStock: i.currentStock, unit: i.unit, minimumStock: i.minimumStock })),
  });
  const exportExcel = () => exportFinancialCsv(rows, period, `${filenameBase}-${new Date().toISOString().slice(0, 10)}.csv`);

  const saveGoal = async () => {
    await saveSettings(targetInput);
    setDailyTarget(targetInput);
    onGoalSaved?.();
    await refreshGoal();
  };

  return <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Operasional · {isSupabaseConfigured ? "LIVE DATABASE" : "DEMO DATA"}</p>
        <h1 className="mt-1 text-2xl font-black text-[#e73b28] sm:text-3xl">DASHBOARD OUTLET</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex border border-[#d8ccc6]">
          <Button sound="navigation.tab" variant={period === "daily" ? "default" : "ghost"} onClick={() => setPeriod("daily")} className="rounded-none text-xs">Harian</Button>
          <Button sound="navigation.tab" variant={period === "monthly" ? "default" : "ghost"} onClick={() => setPeriod("monthly")} className="rounded-none text-xs">Bulanan</Button>
        </div>
        {period === "daily" && (
          <label className="flex items-center gap-1 border border-[#d8ccc6] bg-white px-2 py-1 font-mono text-[10px] text-zinc-500">
            <span>HINGGA</span>
            <input
              type="date"
              value={selectedDate}
              max={todayJakarta}
              onChange={e => e.target.value && pickDate(e.target.value)}
              className="bg-transparent text-[11px] text-[#17100e] outline-none"
            />
            {selectedDate !== todayJakarta && <Button sound="interaction.tap" variant="ghost" onClick={() => pickDate(todayJakarta)} className="rounded-none px-2 text-[10px] text-[#e73b28]">HARI INI</Button>}
          </label>
        )}
        <ExportButtons onPdf={exportPdf} onExcel={exportExcel} />
      </div>
    </div>

    <article className="mt-6 border border-[#e8ddd8] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-bold">TARGET PENJUALAN HARI INI</h2>
        <p className="font-mono text-[10px] text-zinc-500">
          {new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now)}
          <span className="mx-1">·</span>
          <span className="text-[#e73b28]">{new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(now)} WIB</span>
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="font-mono text-[10px] text-zinc-500">GOAL (Rp)
          <input type="number" min={0} value={targetInput || ""} onChange={e => setTargetInput(Number(e.target.value))} className="mt-1 block w-40 border border-[#d8ccc6] p-2 text-sm"/>
        </label>
        <Button sound="interaction.confirm" onClick={() => void saveGoal()} className="rounded-none text-xs">Simpan goal</Button>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between font-mono text-[10px]">
          <span>{currency(todayRevenue)} / {currency(dailyTarget)}</span>
          <span className={goalReached ? "text-[#e73b28] font-bold" : ""}>{goalPct}%</span>
        </div>
        <div className="h-3 overflow-hidden bg-zinc-100">
          <div className={`h-full transition-all ${goalReached ? "bg-[#ef4130]" : "bg-[#e73b28]"}`} style={{ width: `${goalPct}%` }}/>
        </div>
        {goalReached && <p className="mt-2 font-mono text-[10px] text-[#e73b28]">Target tercapai — cek notifikasi</p>}
      </div>
    </article>

    <div className="mt-6 grid gap-px border border-[#e8ddd8] bg-[#e8ddd8] sm:grid-cols-2 lg:grid-cols-4">
      {[firstCardLabel, "PROFIT (TABEL)", "COGS (TABEL)", "MARGIN"].map((label, index) =>
        <article key={label} className="bg-white p-5"><p className="font-mono text-[10px] text-zinc-500">{label}</p><p className="mt-4 text-xl font-black text-[#e73b28]">{index === 0 ? currency(selectedRevenue) : index === 1 ? currency(summary.profit) : index === 2 ? currency(summary.totalCogs) : `${summary.margin}%`}</p></article>,
      )}
    </div>

    <article className="mt-6 overflow-x-auto border border-[#e8ddd8] bg-white">
      <div className="border-b border-[#e8ddd8] p-4"><h2 className="font-bold">{title}</h2></div>
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="bg-[#ef4130] text-[10px] text-white"><tr>
          <th className="p-3">{period === "daily" ? "TANGGAL" : "BULAN"}</th>
          <th className="p-3">TRANSAKSI</th><th className="p-3">PENJUALAN</th><th className="p-3">COGS</th><th className="p-3">PROFIT</th><th className="p-3">MARGIN</th>
        </tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-zinc-400">Belum ada data</td></tr> : rows.map(r => <tr key={r.label} className="border-t border-[#e8ddd8]">
          <td className="p-3 font-mono">{period === "daily" ? formatDate(r.label) : formatMonth(r.label)}</td>
          <td className="p-3">{r.orderCount}</td>
          <td className="p-3 font-bold">{currency(r.revenue)}</td>
          <td className="p-3">{currency(r.totalCogs)}</td>
          <td className="p-3 font-bold text-[#e73b28]">{currency(r.grossProfit)}</td>
          <td className="p-3 font-mono">{r.marginPct}%</td>
        </tr>)}</tbody>
      </table>
    </article>

    <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <article className="border border-[#e8ddd8] bg-white p-5">
        <h2 className="font-bold">GRAFIK {period === "daily" ? "HARIAN" : "BULANAN"}</h2>
        <div className="mt-6 flex h-44 items-end justify-between gap-2 border-b border-[#e8ddd8] sm:gap-3">
          {rows.length === 0 ? <p className="w-full text-center text-xs text-zinc-400">Belum ada data</p> : [...rows].reverse().slice(-7).map(r => {
            const max = Math.max(...rows.map(x => x.revenue), 1);
            const h = Math.max(8, Math.round((r.revenue / max) * 100));
            return <div key={r.label} className="flex flex-1 flex-col items-center gap-2">
              <i style={{ height: `${h}%` }} className="w-full bg-[#ef4130]"/>
              <span className="font-mono text-[8px] sm:text-[9px]">{period === "daily" ? r.label.slice(8, 10) : r.label.slice(5, 7)}</span>
            </div>;
          })}
        </div>
      </article>
      <article className="border border-[#e8ddd8] bg-white p-5">
        <h2 className="font-bold">BAHAN MENIPIS</h2>
        {lowStock.length === 0 ? <p className="py-8 text-center text-xs text-zinc-400">Semua stok aman</p>
          : lowStock.map(item => <div key={item.id} className="flex items-center justify-between border-b border-[#e8ddd8] py-4">
            <div><p className="text-xs font-bold">{item.name}</p><p className="font-mono text-[10px] text-zinc-500">{item.currentStock} {item.unit} · min. {item.minimumStock}</p></div>
            <span className="bg-[#fff0ec] px-2 py-1 font-mono text-[9px] text-[#e73b28]">MENIPIS</span>
          </div>)}
      </article>
    </div>
  </section>;
}
