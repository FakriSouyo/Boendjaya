"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ReceiptText, Trash2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/sensory-ui/button";
import { useDialog } from "@/components/dialog-provider";
import { currency, formatDate } from "@/lib/format";
import type { Transaction } from "@/lib/types";

type Props = {
  transactions: Transaction[];
  onDelete?: (id: number) => Promise<void>;
};

export function TransactionHistoryPage({ transactions, onDelete }: Props) {
  const { confirm, showError } = useDialog();
  const [openId, setOpenId] = useState<number | null>(null);

  const handleDelete = async (item: Transaction) => {
    const ok = await confirm({
      title: "HAPUS TRANSAKSI",
      message: `Hapus transaksi ${item.orderNumber} sebesar ${currency(item.total)}? Stok bahan yang terpakai akan dikembalikan dan riwayat ini dihapus.`,
      confirmLabel: "HAPUS",
    });
    if (!ok) return;
    try {
      await onDelete?.(item.id);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menghapus transaksi");
    }
  };

  const leaderboard = useMemo(() => {
    const agg = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const t of transactions) {
      for (const it of t.items) {
        const cur = agg.get(it.name) ?? { name: it.name, quantity: 0, revenue: 0 };
        cur.quantity += it.quantity;
        cur.revenue += it.quantity * it.unitPrice;
        agg.set(it.name, cur);
      }
    }
    return [...agg.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10);
  }, [transactions]);

  const maxLeaderboardQty = leaderboard[0]?.quantity ?? 0;

  return <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Point of sale · pembayaran berhasil</p>
    <h1 className="mt-1 text-2xl font-black text-[#e73b28] sm:text-3xl">RIWAYAT TRANSAKSI</h1>

    <article className="mt-6 border border-[#e8ddd8] bg-white p-5">
      <div className="flex items-center gap-2">
        <Trophy className="size-4 text-[#e73b28]"/>
        <h2 className="font-bold">LEADERBOARD PESANAN</h2>
        <span className="font-mono text-[10px] text-zinc-500">· produk terlaris dari {transactions.length} transaksi</span>
      </div>
      {leaderboard.length === 0 ? (
        <p className="py-8 text-center text-xs text-zinc-400">Belum ada pesanan untuk dihitung.</p>
      ) : (
        <div className="mt-4 divide-y divide-[#e8ddd8]">
          {leaderboard.map((item, index) => (
            <div key={item.name} className="flex items-center gap-3 py-3">
              <span className={`grid size-8 shrink-0 place-items-center font-mono text-xs font-black ${index < 3 ? "bg-[#e73b28] text-white" : "bg-[#fff0ec] text-[#e73b28]"}`}>{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">{item.name}</p>
                <div className="mt-1 h-1.5 w-full bg-zinc-100">
                  <div className="h-full bg-[#e73b28]" style={{ width: maxLeaderboardQty > 0 ? `${(item.quantity / maxLeaderboardQty) * 100}%` : "0%" }}/>
                </div>
              </div>
              <p className="shrink-0 font-mono text-xs font-bold text-[#e73b28]">{item.quantity} terjual</p>
              <p className="w-20 shrink-0 text-right font-mono text-[10px] text-zinc-500">{currency(item.revenue)}</p>
            </div>
          ))}
        </div>
      )}
    </article>

    <div className="mt-6 overflow-x-auto border border-[#e8ddd8] bg-white">
      <table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-[#ef4130] font-mono text-[10px] text-white"><tr><th className="p-4">WAKTU</th><th className="p-4">PESANAN</th><th className="p-4">ITEM</th><th className="p-4">METODE</th><th className="p-4">TOTAL</th><th className="p-4 w-16"/></tr></thead><tbody>
        {transactions.map(item => <Fragment key={item.id}>
          <tr key={item.id} className="border-t border-[#e8ddd8]">
            <td className="p-4 font-mono">{item.paidAt ? formatDate(item.paidAt) : "-"}</td>
            <td className="p-4 font-bold">{item.orderNumber}</td>
            <td className="p-4">
              <button type="button" onClick={() => setOpenId(openId === item.id ? null : item.id)} className="flex items-center gap-1 text-left text-[#e73b28]">
                {openId === item.id ? <ChevronUp className="size-3.5"/> : <ChevronDown className="size-3.5"/>}
                <span>{item.itemCount} item</span>
              </button>
            </td>
            <td className="p-4"><span className="bg-zinc-100 px-2 py-1 font-mono text-[10px] uppercase">{item.paymentMethod}</span></td>
            <td className="p-4 font-mono font-bold text-[#e73b28]">{currency(item.total)}</td>
            <td className="p-4">{onDelete && <Button sound="interaction.tap" variant="outline" size="icon" onClick={() => void handleDelete(item)} className="rounded-none text-zinc-400 hover:text-[#e73b28]" aria-label={`Hapus ${item.orderNumber}`}><Trash2 className="size-3.5"/></Button>}</td>
          </tr>
          {openId === item.id && (
            <tr key={`${item.id}-detail`} className="border-t border-[#e8ddd8] bg-[#fffaf8]">
              <td colSpan={6} className="p-4 pl-10">
                <div className="divide-y divide-[#f0e6e1]">
                  {item.items.length === 0 && <p className="py-2 text-xs text-zinc-400">Tidak ada detail item.</p>}
                  {item.items.map((it, i) => (
                    <div key={i} className="flex items-center justify-between py-2 text-xs">
                      <p className="font-bold">{it.quantity}× <span className="font-normal">{it.name}</span></p>
                      <p className="font-mono text-zinc-500">{currency(it.unitPrice)} · <b className="text-[#e73b28]">{currency(it.quantity * it.unitPrice)}</b></p>
                    </div>
                  ))}
                </div>
              </td>
            </tr>
          )}
        </Fragment>)}
      </tbody></table>
      {transactions.length === 0 && <div className="grid place-items-center gap-2 px-4 py-14 text-center text-zinc-400"><ReceiptText className="size-7"/><p className="text-xs">Belum ada transaksi berhasil.</p></div>}
    </div>
  </section>;
}
