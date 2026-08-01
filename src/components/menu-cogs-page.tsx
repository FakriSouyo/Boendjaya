"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/sensory-ui/button";
import { useDialog } from "@/components/dialog-provider";
import { currency, marginPct, unitLabel } from "@/lib/format";
import { buildRecipeLines, recipesForProduct, refreshProductCogs } from "@/lib/inventory";
import { deleteProduct, saveProductWithRecipes } from "@/lib/data";
import type { Ingredient, Product, RecipeDraft, RecipeLine } from "@/lib/types";
import { PRODUCT_CATEGORIES } from "@/lib/types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";

type Props = {
  products: Product[];
  recipes: RecipeLine[];
  ingredients: Ingredient[];
  onSaved: () => void;
  onDemoSave?: (products: Product[], recipes: RecipeLine[]) => void;
};

const emptyDraft = (): RecipeDraft => ({ ingredientId: 0, quantity: 1 });

export function MenuCogsPage({ products, recipes, ingredients, onSaved, onDemoSave }: Props) {
  const { confirm, showError } = useDialog();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(PRODUCT_CATEGORIES[0]);
  const [price, setPrice] = useState(0);
  const [emoji, setEmoji] = useState("🍔");
  const [drafts, setDrafts] = useState<RecipeDraft[]>([emptyDraft()]);

  const openNew = () => {
    setEditProduct(null);
    setName("");
    setCategory(PRODUCT_CATEGORIES[0]);
    setPrice(0);
    setEmoji("🍔");
    setDrafts([{ ingredientId: ingredients[0]?.id ?? 0, quantity: 1 }]);
    setEditorOpen(true);
  };

  const openEdit = (p: Product) => {
    const lines = recipesForProduct(p.id, recipes);
    setEditProduct(p);
    setName(p.name);
    setCategory(p.category);
    setPrice(p.price);
    setEmoji(p.emoji);
    setDrafts(lines.length ? lines.map(l => ({ ingredientId: l.ingredientId, quantity: l.quantity })) : [{ ingredientId: ingredients[0]?.id ?? 0, quantity: 1 }]);
    setEditorOpen(true);
  };

  const previewCogs = useMemo(() => {
    const ings = new Map(ingredients.map(i => [i.id, i]));
    return drafts.reduce((s, d) => s + d.quantity * (ings.get(d.ingredientId)?.averageCost ?? 0), 0);
  }, [drafts, ingredients]);

  const save = async () => {
    if (!name.trim() || price <= 0) return;
    const validDrafts = drafts.filter(d => d.ingredientId && d.quantity > 0);
    try {
      if (supabase) {
        await saveProductWithRecipes(editProduct?.id ?? null, name.trim(), category, price, emoji, true, validDrafts);
        await onSaved();
      } else if (onDemoSave) {
        const id = editProduct?.id ?? Math.max(0, ...products.map(p => p.id)) + 1;
        const nextProducts: Product[] = editProduct
          ? products.map(p => p.id === id ? { ...p, name: name.trim(), category, price, emoji, cogs: Math.round(previewCogs) } : p)
          : [...products, { id, name: name.trim(), category, price, emoji, cogs: Math.round(previewCogs) }];
        const raw = validDrafts.map(d => ({ productId: id, ingredientId: d.ingredientId, quantity: d.quantity }));
        const otherRaw = recipes.filter(r => r.productId !== id).map(r => ({ productId: r.productId, ingredientId: r.ingredientId, quantity: r.quantity }));
        const nextRecipes = buildRecipeLines([...otherRaw, ...raw], ingredients);
        onDemoSave(refreshProductCogs(nextProducts, nextRecipes), nextRecipes);
      }
      setEditorOpen(false);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menyimpan menu");
    }
  };

  const onDeleteProduct = async (item: Product) => {
    const ok = await confirm({
      title: "HAPUS MENU",
      message: `Hapus menu "${item.name}"? Resep terkait juga akan terhapus. Riwayat transaksi lama tetap tersimpan.`,
      confirmLabel: "HAPUS MENU",
    });
    if (!ok) return;
    try {
      if (supabase) {
        await deleteProduct(item.id);
        await onSaved();
      } else if (onDemoSave) {
        onDemoSave(products.filter(p => p.id !== item.id), recipes.filter(r => r.productId !== item.id));
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menghapus menu");
    }
  };

  const addRow = () => setDrafts(d => [...d, { ingredientId: ingredients[0]?.id ?? 0, quantity: 1 }]);
  const removeRow = (i: number) => setDrafts(d => d.filter((_, idx) => idx !== i));

  return <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Menu & COGS · {isSupabaseConfigured ? "LIVE DATABASE" : "DEMO DATA"}</p>
        <h1 className="mt-1 text-2xl font-black text-[#e73b28] sm:text-3xl">MENU & COGS</h1>
      </div>
      <Button sound="interaction.tap" onClick={openNew} className="rounded-none"><Plus className="size-4"/> TAMBAH MENU</Button>
    </div>

    <div className="mt-6 grid gap-px border border-[#e8ddd8] bg-[#e8ddd8] sm:grid-cols-2 lg:grid-cols-3">
      {products.map(item => {
        const lines = recipesForProduct(item.id, recipes);
        const margin = marginPct(item.price, item.cogs);
        const open = expanded === item.id;
        return <article key={item.id} className="bg-white p-5">
          <div className="flex items-start gap-2">
            <button type="button" onClick={() => setExpanded(open ? null : item.id)} className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center bg-[#fff0ec] text-xl">{item.emoji}</span>
                <div className="min-w-0 flex-1"><h2 className="text-sm font-bold">{item.name}</h2><p className="font-mono text-[10px] text-zinc-500">{item.category.toUpperCase()}</p></div>
              </div>
              <div className="mt-4 grid grid-cols-3 border-t border-[#e8ddd8] pt-3 font-mono text-[10px]">
                <div><p className="text-zinc-500">HARGA</p><b>{currency(item.price)}</b></div>
                <div><p className="text-zinc-500">COGS</p><b>{currency(item.cogs)}</b></div>
                <div><p className="text-zinc-500">MARGIN</p><b className="text-[#e73b28]">{margin}%</b></div>
              </div>
              {lines.length > 0 && <p className="mt-2 font-mono text-[9px] text-zinc-400">{open ? "▲ sembunyikan resep" : "▼ breakdown resep"}</p>}
            </button>
            <div className="flex shrink-0 flex-col gap-1">
              <Button sound="interaction.tap" variant="outline" size="icon" onClick={() => openEdit(item)} className="rounded-none" aria-label={`Edit ${item.name}`}><Pencil className="size-3.5"/></Button>
              <Button sound="interaction.tap" variant="outline" size="icon" onClick={() => void onDeleteProduct(item)} className="rounded-none text-zinc-400 hover:text-[#e73b28]" aria-label={`Hapus ${item.name}`}><Trash2 className="size-3.5"/></Button>
            </div>
          </div>
          {open && lines.length > 0 && <div className="mt-3 space-y-1 border-t border-[#e8ddd8] pt-3">
            {lines.map(l => <div key={`${l.productId}-${l.ingredientId}`} className="flex justify-between font-mono text-[10px]">
              <span className="text-zinc-600">{l.ingredientName} · {l.quantity} {unitLabel(l.unit)}</span>
              <span>{currency(Math.round(l.lineCost))}</span>
            </div>)}
            <div className="flex justify-between border-t border-[#e8ddd8] pt-2 font-mono text-[10px] font-bold">
              <span>TOTAL COGS</span><span className="text-[#e73b28]">{currency(item.cogs)}</span>
            </div>
          </div>}
          {lines.length === 0 && <p className="mt-2 font-mono text-[9px] text-zinc-400">Resep belum di-setup · ketuk edit</p>}
        </article>;
      })}
    </div>

    {editorOpen && <div className="fixed inset-0 z-40 grid place-items-end bg-black/30 sm:place-items-center sm:p-5">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto bg-white sm:border-2 sm:border-[#ef4130]">
        <div className="flex items-center justify-between bg-[#ef4130] p-4 text-white">
          <h2 className="font-black">{editProduct ? "EDIT MENU" : "TAMBAH MENU"}</h2>
          <Button sound="overlay.close" variant="ghost" size="icon" onClick={() => setEditorOpen(false)} className="rounded-none text-white hover:bg-white/10"><X/></Button>
        </div>
        <div className="space-y-4 p-5">
          <label className="block font-mono text-[10px] text-zinc-500">NAMA MENU<input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm"/></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block font-mono text-[10px] text-zinc-500">KATEGORI<select value={category} onChange={e => setCategory(e.target.value)} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm">{PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
            <label className="block font-mono text-[10px] text-zinc-500">EMOJI<input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={4} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm"/></label>
          </div>
          <label className="block font-mono text-[10px] text-zinc-500">HARGA JUAL (Rp)<input type="number" min={0} value={price || ""} onChange={e => setPrice(Number(e.target.value))} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm"/></label>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-mono text-[10px] text-zinc-500">BREAKDOWN RESEP</p>
              <Button sound="interaction.tap" type="button" variant="outline" onClick={addRow} className="h-7 rounded-none text-[10px]"><Plus className="size-3"/> Bahan</Button>
            </div>
            <div className="space-y-2">
              {drafts.map((row, i) => {
                const ing = ingredients.find(x => x.id === row.ingredientId);
                return <div key={i} className="flex gap-2">
                  <select value={row.ingredientId} onChange={e => setDrafts(d => d.map((x, idx) => idx === i ? { ...x, ingredientId: Number(e.target.value) } : x))} className="min-w-0 flex-1 border border-[#d8ccc6] p-2 text-xs">
                    {ingredients.map(x => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}
                  </select>
                  <input type="number" min={0.001} step="any" value={row.quantity || ""} onChange={e => setDrafts(d => d.map((x, idx) => idx === i ? { ...x, quantity: Number(e.target.value) } : x))} className="w-20 border border-[#d8ccc6] p-2 text-xs" title="Jumlah"/>
                  <span className="grid w-12 place-items-center font-mono text-[9px] text-zinc-500">{ing ? unitLabel(ing.unit) : ""}</span>
                  <button type="button" onClick={() => removeRow(i)} disabled={drafts.length <= 1} className="p-2 text-zinc-400 disabled:opacity-30"><Trash2 className="size-3.5"/></button>
                </div>;
              })}
            </div>
            <p className="mt-2 font-mono text-[10px] text-zinc-500">COGS preview: <b className="text-[#e73b28]">{currency(Math.round(previewCogs))}</b></p>
          </div>

          <Button sound="interaction.confirm" onClick={() => void save()} disabled={!name.trim() || price <= 0} className="w-full rounded-none">SIMPAN MENU & RESEP</Button>
        </div>
      </div>
    </div>}
  </section>;
}
