"use client";

import { ChevronRight, Download, FileSpreadsheet, Sandwich, X } from "lucide-react";
import { Button } from "@/components/ui/sensory-ui/button";
import { currency } from "@/lib/format";
import type { Product } from "@/lib/types";

type Props = {
  cart: Product[];
  cartIds: number[];
  catalog: Product[];
  quantity: (id: number) => number;
  add: (p: Product) => void;
  remove: (id: number) => void;
  total: number;
  onClear: () => void;
  onCheckout: () => void;
  onClose?: () => void;
  mobile?: boolean;
};

export function CartPanel({ cart, cartIds, catalog, quantity, add, remove, total, onClear, onCheckout, onClose, mobile }: Props) {
  return <>
    <div className="flex shrink-0 items-center justify-between border-b border-[#e73b28] bg-[#ef4130] px-4 py-3 text-white sm:px-5 sm:py-4">
      <div><p className="font-mono text-[9px] uppercase tracking-widest opacity-80">Order #BJ-1042</p><h2 className="font-black">PESANAN BARU</h2></div>
      <div className="flex items-center gap-1">
        <Button sound="interaction.subtle" onClick={onClear} variant="ghost" className="rounded-none text-xs text-white hover:bg-white/15 hover:text-white">Bersihkan</Button>
        {mobile && onClose && <Button sound="overlay.close" onClick={onClose} variant="ghost" size="icon" className="rounded-none text-white hover:bg-white/15 hover:text-white"><X className="size-4"/></Button>}
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
      {cart.length === 0 ? <div className="grid place-items-center py-16 text-center text-zinc-400 sm:py-28"><Sandwich className="mb-3 size-10 stroke-1"/><p className="text-xs font-medium">Pilih menu untuk memulai pesanan</p></div>
        : cartIds.map(id => { const item = catalog.find(x => x.id === id) ?? cart.find(x => x.id === id)!; const count = quantity(id); return <div key={id} className="flex items-center gap-3 border-b border-[#eadeda] py-3"><span className="grid size-9 place-items-center bg-[#fff0ec] text-lg">{item.emoji}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{item.name}</p><p className="font-mono text-[10px] text-zinc-500">{currency(item.price)}</p></div><div className="flex items-center border border-[#d8ccc6]"><button type="button" onClick={() => remove(id)} className="px-2.5 py-1.5 text-[#e73b28]">−</button><span className="min-w-6 text-center font-mono text-xs">{count}</span><button type="button" onClick={() => add(item)} className="px-2.5 py-1.5 text-[#e73b28]">+</button></div></div>; })}
    </div>
    <div className="shrink-0 border-t border-[#e73b28] p-4 sm:p-5">
      <div className="mb-2 flex justify-between font-mono text-[10px] text-zinc-500"><span>SUBTOTAL</span><span>{currency(total)}</span></div>
      <div className="mb-4 flex justify-between text-lg font-black"><span>TOTAL</span><span className="text-[#e73b28]">{currency(total)}</span></div>
      <Button sound="navigation.forward" disabled={!cart.length} onClick={onCheckout} className="w-full rounded-none">LANJUT PEMBAYARAN <ChevronRight className="size-4"/></Button>
    </div>
  </>;
}

export function ExportButtons({ onPdf, onExcel }: { onPdf: () => void; onExcel: () => void }) {
  return <div className="flex flex-wrap gap-2">
    <Button sound="interaction.tap" variant="outline" onClick={onPdf} className="rounded-none text-xs"><Download className="size-3.5"/> PDF</Button>
    <Button sound="interaction.tap" variant="outline" onClick={onExcel} className="rounded-none text-xs"><FileSpreadsheet className="size-3.5"/> Excel</Button>
  </div>;
}
