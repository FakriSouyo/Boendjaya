"use client";

import { ReceiptText, Trash2 } from "lucide-react";
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

  return <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Point of sale · pembayaran berhasil</p>
    <h1 className="mt-1 text-2xl font-black text-[#e73b28] sm:text-3xl">RIWAYAT TRANSAKSI</h1>
    <div className="mt-6 overflow-x-auto border border-[#e8ddd8] bg-white">
      <table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-[#ef4130] font-mono text-[10px] text-white"><tr><th className="p-4">WAKTU</th><th className="p-4">PESANAN</th><th className="p-4">ITEM</th><th className="p-4">METODE</th><th className="p-4">TOTAL</th><th className="p-4 w-16"/></tr></thead><tbody>{transactions.map(item => <tr key={item.id} className="border-t border-[#e8ddd8]"><td className="p-4 font-mono">{item.paidAt ? formatDate(item.paidAt) : "-"}</td><td className="p-4 font-bold">{item.orderNumber}</td><td className="p-4">{item.itemCount} item</td><td className="p-4"><span className="bg-zinc-100 px-2 py-1 font-mono text-[10px] uppercase">{item.paymentMethod}</span></td><td className="p-4 font-mono font-bold text-[#e73b28]">{currency(item.total)}</td><td className="p-4">{onDelete && <Button sound="interaction.tap" variant="outline" size="icon" onClick={() => void handleDelete(item)} className="rounded-none text-zinc-400 hover:text-[#e73b28]" aria-label={`Hapus ${item.orderNumber}`}><Trash2 className="size-3.5"/></Button>}</td></tr>)}</tbody></table>
      {transactions.length === 0 && <div className="grid place-items-center gap-2 px-4 py-14 text-center text-zinc-400"><ReceiptText className="size-7"/><p className="text-xs">Belum ada transaksi berhasil.</p></div>}
    </div>
  </section>;
}
