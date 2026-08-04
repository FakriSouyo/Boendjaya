"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Plus, ReceiptText, ShoppingCart, Trash2, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/sensory-ui/button";
import { useDialog } from "@/components/dialog-provider";
import { addExpense, deleteExpense, loadDailyIncome, loadExpenses } from "@/lib/data";
import { currency, formatDate, jakartaDate } from "@/lib/format";
import type { DailyExpense, DailyIncomeRow } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/supabase/client";

const EXPENSE_CATEGORIES = ["Bahan baku", "Kemasan", "Operasional", "Transportasi", "Gaji", "Lainnya"];

export function DailyProfitPage() {
  const { confirm, showError } = useDialog();
  const [expenses, setExpenses] = useState<DailyExpense[]>([]);
  const [incomeRows, setIncomeRows] = useState<DailyIncomeRow[]>([]);
  const today = jakartaDate(new Date().toISOString());
  const [selectedDate, setSelectedDate] = useState(today);
  const [dateInput, setDateInput] = useState(today);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const [exp, income] = await Promise.all([loadExpenses(), loadDailyIncome()]);
    setExpenses(exp);
    setIncomeRows(income);
  }, []);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      const [exp, income] = await Promise.all([loadExpenses(), loadDailyIncome()]);
      if (ignore) return;
      setExpenses(exp);
      setIncomeRows(income);
    };
    void load();
    return () => { ignore = true; };
  }, []);

  const expenseByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) map.set(e.date, (map.get(e.date) ?? 0) + e.amount);
    return map;
  }, [expenses]);

  const incomeByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of incomeRows) map.set(r.date, (map.get(r.date) ?? 0) + r.revenue);
    return map;
  }, [incomeRows]);

  const income = incomeByDate.get(selectedDate) ?? 0;
  const belanja = expenseByDate.get(selectedDate) ?? 0;
  const profit = income - belanja;

  const recapDates = useMemo(() => {
    const set = new Set<string>([...expenseByDate.keys(), ...incomeByDate.keys()]);
    return [...set].sort().reverse();
  }, [expenseByDate, incomeByDate]);

  const pickDate = (date: string) => {
    if (!date) return;
    setSelectedDate(date);
    setDateInput(date);
  };

  const submit = async () => {
    const value = Number(amount);
    if (!dateInput || !(value > 0)) return;
    setSaving(true);
    try {
      await addExpense(dateInput, value, category, note);
      setAmount("");
      setNote("");
      setSelectedDate(dateInput);
      await refresh();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menyimpan belanja");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: DailyExpense) => {
    const ok = await confirm({
      title: "HAPUS BELANJA",
      message: `Hapus belanja ${currency(item.amount)}${item.category ? ` (${item.category})` : ""}?`,
      confirmLabel: "HAPUS",
    });
    if (!ok) return;
    try {
      await deleteExpense(item.id);
      await refresh();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menghapus belanja");
    }
  };

  return <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Simple mode · {isSupabaseConfigured ? "LIVE DATABASE" : "DEMO DATA"}</p>
        <h1 className="mt-1 text-2xl font-black text-[#e73b28] sm:text-3xl">PROFIT HARIAN</h1>
        <p className="mt-1 text-xs text-zinc-500">Profit = pendapatan (dari transaksi POS) − belanja (yang Anda input).</p>
      </div>
      <label className="flex items-center gap-1 border border-[#d8ccc6] bg-white px-2 py-1 font-mono text-[10px] text-zinc-500">
        <CalendarDays className="size-3.5 text-[#e73b28]"/>
        <span className="hidden sm:inline">TANGGAL</span>
        <input type="date" value={selectedDate} max={today} onChange={e => pickDate(e.target.value)} className="bg-transparent text-[11px] text-[#17100e] outline-none"/>
        {selectedDate !== today && <Button sound="interaction.tap" variant="ghost" onClick={() => pickDate(today)} className="rounded-none px-2 text-[10px] text-[#e73b28]">HARI INI</Button>}
      </label>
    </div>

    <div className="mt-6 grid gap-px border border-[#e8ddd8] bg-[#e8ddd8] sm:grid-cols-3">
      <article className="bg-white p-5">
        <p className="font-mono text-[10px] text-zinc-500">PENDAPATAN · {formatDate(selectedDate)}</p>
        <p className="mt-4 text-2xl font-black text-[#e73b28]">{currency(income)}</p>
      </article>
      <article className="bg-white p-5">
        <p className="font-mono text-[10px] text-zinc-500">BELANJA · {formatDate(selectedDate)}</p>
        <p className="mt-4 text-2xl font-black text-[#17100e]">{currency(belanja)}</p>
      </article>
      <article className="bg-white p-5">
        <p className="font-mono text-[10px] text-zinc-500">PROFIT · {formatDate(selectedDate)}</p>
        <div className="mt-4 flex items-center gap-2">
          {profit >= 0 ? <TrendingUp className="size-5 text-[#e73b28]"/> : <TrendingDown className="size-5 text-[#e73b28]"/>}
          <p className={`text-2xl font-black ${profit < 0 ? "text-[#e73b28]" : "text-[#17100e]"}`}>{currency(profit)}</p>
          {profit < 0 && <span className="bg-[#e73b28] px-2 py-0.5 font-mono text-[9px] text-white">RUGI</span>}
        </div>
      </article>
    </div>

    <article className="mt-6 border border-[#e8ddd8] bg-white">
      <div className="flex items-center gap-2 border-b border-[#e8ddd8] p-4">
        <Wallet className="size-4 text-[#e73b28]"/>
        <h2 className="font-bold">INPUT BELANJA HARI INI</h2>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block font-mono text-[10px] text-zinc-500">TANGGAL
          <input type="date" value={dateInput} max={today} onChange={e => setDateInput(e.target.value)} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm"/>
        </label>
        <label className="block font-mono text-[10px] text-zinc-500">NOMINAL (Rp)
          <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm"/>
        </label>
        <label className="block font-mono text-[10px] text-zinc-500">KATEGORI
          <select value={category} onChange={e => setCategory(e.target.value)} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm">{EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
        </label>
        <label className="block font-mono text-[10px] text-zinc-500">CATATAN (opsional)
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Contoh: belanja ke pasar" className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm"/>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8ddd8] p-4">
        <p className="font-mono text-[10px] text-zinc-500">Total belanja tanggal {formatDate(dateInput)}: <b className="text-[#17100e]">{currency(Number(amount) || 0)}</b></p>
        <Button sound="interaction.confirm" onClick={() => void submit()} disabled={!dateInput || !(Number(amount) > 0) || saving} className="shrink-0 rounded-none"><Plus className="size-4"/> TAMBAH BELANJA</Button>
      </div>
    </article>

    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <article className="overflow-x-auto border border-[#e8ddd8] bg-white">
        <div className="flex items-center gap-2 border-b border-[#e8ddd8] p-4">
          <ShoppingCart className="size-4 text-[#e73b28]"/>
          <h2 className="font-bold">RIWAYAT BELANJA</h2>
          <span className="font-mono text-[10px] text-zinc-500">· {expenses.length} catatan</span>
        </div>
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead className="font-mono text-[10px] text-zinc-500"><tr>
            <th className="p-3">TANGGAL</th><th className="p-3">KATEGORI</th><th className="p-3">CATATAN</th><th className="p-3">JUMLAH</th><th className="p-3 w-12"/>
          </tr></thead>
          <tbody>{expenses.map(item => <tr key={item.id} className="border-t border-[#e8ddd8]">
            <td className="p-3 font-mono">{formatDate(item.date)}</td>
            <td className="p-3">{item.category ?? "—"}</td>
            <td className="p-3 text-zinc-500">{item.note ?? "—"}</td>
            <td className="p-3 font-mono font-bold text-[#17100e]">{currency(item.amount)}</td>
            <td className="p-3"><button type="button" onClick={() => void remove(item)} className="p-1 text-zinc-400 hover:text-[#e73b28]" aria-label={`Hapus belanja ${currency(item.amount)}`}><Trash2 className="size-3.5"/></button></td>
          </tr>)}</tbody>
        </table>
        {expenses.length === 0 && <p className="py-8 text-center text-xs text-zinc-400">Belum ada belanja tercatat.</p>}
      </article>

      <article className="overflow-x-auto border border-[#e8ddd8] bg-white">
        <div className="flex items-center gap-2 border-b border-[#e8ddd8] p-4">
          <ReceiptText className="size-4 text-[#e73b28]"/>
          <h2 className="font-bold">RIWAYAT PENDAPATAN</h2>
          {!isSupabaseConfigured && <span className="font-mono text-[9px] text-zinc-400">· demo: hanya hari ini</span>}
        </div>
        <table className="w-full min-w-[320px] text-left text-xs">
          <thead className="font-mono text-[10px] text-zinc-500"><tr>
            <th className="p-3">TANGGAL</th><th className="p-3">PENDAPATAN</th>
          </tr></thead>
          <tbody>{incomeRows.map(row => <tr key={row.date} className="border-t border-[#e8ddd8]">
            <td className="p-3 font-mono">{formatDate(row.date)}</td>
            <td className="p-3 font-mono font-bold text-[#e73b28]">{currency(row.revenue)}</td>
          </tr>)}</tbody>
        </table>
        {incomeRows.length === 0 && <p className="py-8 text-center text-xs text-zinc-400">Belum ada pendapatan tercatat.</p>}
      </article>
    </div>

    <article className="mt-6 overflow-x-auto border border-[#e8ddd8] bg-white">
      <div className="border-b border-[#e8ddd8] p-4"><h2 className="font-bold">REKAP PROFIT PER HARI</h2></div>
      <table className="w-full min-w-[520px] text-left text-xs">
        <thead className="bg-[#ef4130] text-[10px] text-white"><tr>
          <th className="p-3">TANGGAL</th><th className="p-3">PENDAPATAN</th><th className="p-3">BELANJA</th><th className="p-3">PROFIT</th>
        </tr></thead>
        <tbody>{recapDates.map(date => {
          const inc = incomeByDate.get(date) ?? 0;
          const exp = expenseByDate.get(date) ?? 0;
          const prof = inc - exp;
          return <tr key={date} className="border-t border-[#e8ddd8]">
            <td className="p-3 font-mono">{formatDate(date)}</td>
            <td className="p-3 font-bold">{currency(inc)}</td>
            <td className="p-3">{currency(exp)}</td>
            <td className={`p-3 font-bold ${prof < 0 ? "text-[#e73b28]" : "text-[#17100e]"}`}>{currency(prof)}</td>
          </tr>;
        })}</tbody>
      </table>
      {recapDates.length === 0 && <p className="py-8 text-center text-xs text-zinc-400">Belum ada data untuk direkap.</p>}
    </article>
  </section>;
}
