"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/sensory-ui/button";
import { useDialog } from "@/components/dialog-provider";
import { currency, formatDate, unitLabel } from "@/lib/format";
import { applyPurchase, deletePurchase, purchaseUnitCost, toBaseQuantity } from "@/lib/inventory";
import { createInventoryItem, deleteInventoryItem, removeStockPurchase, updateInventoryItem, updateStockPurchase } from "@/lib/data";
import type { Ingredient, IngredientUnit, PurchaseForm, PurchaseInputUnit, StockPurchase } from "@/lib/types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";

const inputUnitsFor = (unit: Ingredient["unit"]): PurchaseInputUnit[] => {
  if (unit === "gram") return ["gram", "kg"];
  if (unit === "pcs") return ["pcs", "pack"];
  return ["liter"];
};

const emptyForm = (ingredients: Ingredient[]): PurchaseForm => ({
  ingredientId: ingredients[0]?.id ?? 0,
  purchasedAt: new Date().toISOString().slice(0, 10),
  inputQuantity: 1,
  inputUnit: "pcs",
  packSize: 20,
  totalPrice: 0,
  note: "",
});

type Props = {
  ingredients: Ingredient[];
  purchases: StockPurchase[];
  onIngredientsChange: (items: Ingredient[]) => void;
  onPurchasesChange: (items: StockPurchase[]) => void;
  onProductsRefresh?: () => void;
};

export function StockPage({ ingredients, purchases, onIngredientsChange, onPurchasesChange, onProductsRefresh }: Props) {
  const { confirm, showError } = useDialog();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<PurchaseForm>(() => emptyForm(ingredients));
  const [inventoryEdit, setInventoryEdit] = useState<Ingredient | null>(null);
  const [inventoryForm, setInventoryForm] = useState({ name: "", unit: "gram" as IngredientUnit, currentStock: 0, minimumStock: 0, purchaseQuantity: 1, purchaseUnit: "kg" as PurchaseInputUnit, purchaseTotalPrice: 0, note: "" });

  const selected = ingredients.find(i => i.id === form.ingredientId);
  const preview = useMemo(() => {
    if (!selected || !form.totalPrice) return null;
    try {
      const base = toBaseQuantity(form.inputQuantity, form.inputUnit, form.packSize || null, selected.unit);
      return { base, cost: purchaseUnitCost(form.totalPrice, base) };
    } catch { return null; }
  }, [selected, form]);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm(ingredients));
    setOpen(true);
  };

  const openEdit = (p: StockPurchase) => {
    setEditId(p.id);
    setForm({
      ingredientId: p.ingredientId,
      purchasedAt: p.purchasedAt,
      inputQuantity: p.inputQuantity,
      inputUnit: p.inputUnit,
      packSize: p.packSize ?? 20,
      totalPrice: p.totalPrice,
      note: p.note ?? "",
    });
    setOpen(true);
  };

  const openInventoryEdit = (item: Ingredient) => {
    setInventoryEdit(item);
    setInventoryForm({ name: item.name, unit: item.unit, currentStock: item.currentStock, minimumStock: item.minimumStock, purchaseQuantity: 1, purchaseUnit: inputUnitsFor(item.unit)[0], purchaseTotalPrice: item.averageCost * (item.unit === "gram" ? 1000 : 1), note: item.note ?? "" });
  };

  const openInventoryCreate = () => {
    setInventoryEdit({ id: 0, name: "", unit: "gram", currentStock: 0, minimumStock: 0, averageCost: 0, note: null });
    setInventoryForm({ name: "", unit: "gram", currentStock: 0, minimumStock: 0, purchaseQuantity: 1, purchaseUnit: "kg", purchaseTotalPrice: 0, note: "" });
  };

  const submit = async () => {
    if (!selected || !form.totalPrice) return;
    try {
      if (supabase) {
        if (editId) {
          await updateStockPurchase(editId, {
            purchasedAt: form.purchasedAt,
            inputQuantity: form.inputQuantity,
            inputUnit: form.inputUnit,
            packSize: form.inputUnit === "pack" ? form.packSize : null,
            totalPrice: form.totalPrice,
            note: form.note,
          });
        } else {
          const { error } = await supabase.rpc("record_stock_purchase", {
            p_ingredient_id: form.ingredientId,
            p_purchased_at: form.purchasedAt,
            p_input_quantity: form.inputQuantity,
            p_input_unit: form.inputUnit,
            p_pack_size: form.inputUnit === "pack" ? form.packSize : null,
            p_total_price: form.totalPrice,
            p_note: form.note || null,
          });
          if (error) { showError(error.message); return; }
        }
        await onProductsRefresh?.();
      } else {
        const result = applyPurchase(ingredients, purchases, form, editId ?? undefined);
        onIngredientsChange(result.ingredients);
        onPurchasesChange(result.purchases);
        await onProductsRefresh?.();
      }
      setOpen(false);
      setEditId(null);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menyimpan pembelian");
    }
  };

  const onDelete = async (id: number) => {
    const ok = await confirm({ title: "HAPUS PEMBELIAN", message: "Hapus pembelian ini? Stok akan disesuaikan otomatis.", confirmLabel: "HAPUS" });
    if (!ok) return;
    try {
      if (supabase) {
        await removeStockPurchase(id);
        await onProductsRefresh?.();
      } else {
        const result = deletePurchase(ingredients, purchases, id);
        onIngredientsChange(result.ingredients);
        onPurchasesChange(result.purchases);
        await onProductsRefresh?.();
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menghapus");
    }
  };

  const onDeleteIngredient = async (item: Ingredient) => {
    const ok = await confirm({
      title: "HAPUS BAHAN",
      message: `Hapus bahan "${item.name}"? Riwayat pembelian dan resep menu yang memakai bahan ini juga akan ikut terhapus.`,
      confirmLabel: "HAPUS BAHAN",
    });
    if (!ok) return;
    try {
      if (supabase) {
        await deleteInventoryItem(item.id);
        await onProductsRefresh?.();
      } else {
        onIngredientsChange(ingredients.filter(i => i.id !== item.id));
        onPurchasesChange(purchases.filter(p => p.ingredientId !== item.id));
        await onProductsRefresh?.();
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menghapus bahan");
    }
  };

  const submitInventory = async () => {
    const averageCost = inventoryUnitCost;
    if (!inventoryEdit || !inventoryForm.name.trim() || inventoryForm.currentStock < 0 || inventoryForm.minimumStock < 0 || averageCost < 0) return;
    try {
      if (supabase) {
        const payload = { ...inventoryForm, averageCost };
        if (inventoryEdit.id) await updateInventoryItem(inventoryEdit.id, payload);
        else await createInventoryItem(payload);
        await onProductsRefresh?.();
      } else {
        if (inventoryEdit.id) {
          onIngredientsChange(ingredients.map(item => item.id === inventoryEdit.id ? {
            ...item, name: inventoryForm.name.trim(), currentStock: inventoryForm.currentStock,
            minimumStock: inventoryForm.minimumStock, averageCost, note: inventoryForm.note || null,
          } : item));
        } else {
          onIngredientsChange([...ingredients, {
            id: Math.max(0, ...ingredients.map(item => item.id)) + 1,
            name: inventoryForm.name.trim(), unit: inventoryForm.unit, currentStock: inventoryForm.currentStock,
            minimumStock: inventoryForm.minimumStock, averageCost, note: inventoryForm.note || null,
          }]);
        }
        await onProductsRefresh?.();
      }
      setInventoryEdit(null);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal memperbarui persediaan");
    }
  };

  const onIngredientChange = (id: number) => {
    const ing = ingredients.find(i => i.id === id);
    setForm(f => ({ ...f, ingredientId: id, inputUnit: ing ? inputUnitsFor(ing.unit)[0] : "pcs" }));
  };

  const inventoryBaseQuantity = useMemo(() => {
    try { return toBaseQuantity(inventoryForm.purchaseQuantity, inventoryForm.purchaseUnit, null, inventoryForm.unit); }
    catch { return 0; }
  }, [inventoryForm.purchaseQuantity, inventoryForm.purchaseUnit, inventoryForm.unit]);
  const inventoryUnitCost = purchaseUnitCost(inventoryForm.purchaseTotalPrice, inventoryBaseQuantity);
  const inventoryInputUnits = inputUnitsFor(inventoryForm.unit).filter(unit => unit !== "pack");

  return <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Inventory control · {isSupabaseConfigured ? "LIVE" : "DEMO"}</p>
        <h1 className="mt-1 text-2xl font-black text-[#e73b28] sm:text-3xl">MANAJEMEN STOK</h1>
      </div>
      <div className="flex gap-2"><Button sound="interaction.tap" onClick={openInventoryCreate} variant="outline" className="rounded-none"><Plus className="size-4"/> BAHAN BARU</Button><Button sound="interaction.tap" onClick={openCreate} className="rounded-none"><Plus className="size-4"/> STOK MASUK</Button></div>
    </div>

    <div className="mt-6 overflow-x-auto border border-[#e8ddd8] bg-white">
      <table className="w-full min-w-[760px] text-left">
        <thead className="bg-[#ef4130] text-[10px] text-white"><tr>
          <th className="p-4">BAHAN & SATUAN</th><th className="p-4">STOK TERSEDIA</th><th className="p-4">HARGA SATUAN DASAR</th><th className="p-4">BATAS RESTOCK</th><th className="p-4">STATUS</th><th className="p-4 w-20" />
        </tr></thead>
        <tbody>{ingredients.map(item => <tr key={item.id} className="border-t border-[#e8ddd8]">
          <td className="p-4 text-xs font-bold">{item.name}<p className="font-mono text-[9px] font-normal text-zinc-500">stok dan resep dihitung per {unitLabel(item.unit)}</p>{item.note && <p className="mt-1 max-w-48 text-[10px] font-normal text-zinc-500">{item.note}</p>}</td>
          <td className="p-4 font-mono text-xs">{item.currentStock.toLocaleString("id-ID")} {item.unit}</td>
          <td className="p-4 font-mono text-xs">{item.unit === "pcs" ? currency(item.averageCost) : `${currency(item.averageCost)}/${item.unit}`}</td>
          <td className="p-4 font-mono text-xs">{item.minimumStock.toLocaleString("id-ID")} {item.unit}<p className="mt-1 font-sans text-[9px] text-zinc-500">Peringatan saat stok mencapai angka ini</p></td>
          <td className="p-4"><span className={item.currentStock <= item.minimumStock ? "bg-[#fff0ec] px-2 py-1 font-mono text-[9px] text-[#e73b28]" : "bg-zinc-100 px-2 py-1 font-mono text-[9px]"}>{item.currentStock <= item.minimumStock ? "MENIPIS" : "AMAN"}</span></td>
          <td className="p-4"><div className="flex gap-1"><button type="button" onClick={() => openInventoryEdit(item)} className="p-1 text-[#e73b28]" aria-label={`Edit ${item.name}`}><Pencil className="size-4"/></button><button type="button" onClick={() => void onDeleteIngredient(item)} className="p-1 text-zinc-400 hover:text-[#e73b28]" aria-label={`Hapus ${item.name}`}><Trash2 className="size-4"/></button></div></td>
        </tr>)}</tbody>
      </table>
    </div>

    <div className="mt-6 border border-[#e8ddd8] bg-white p-4 sm:p-5">
      <h2 className="font-bold">RIWAYAT PEMBELIAN</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-xs">
          <thead className="font-mono text-[10px] text-zinc-500"><tr>
            <th className="pb-2">TANGGAL</th><th className="pb-2">BAHAN</th><th className="pb-2">INPUT</th><th className="pb-2">TOTAL</th><th className="pb-2">BIAYA/UNIT</th><th className="pb-2">CATATAN</th><th className="pb-2 w-20"/>
          </tr></thead>
          <tbody>{purchases.map(p => <tr key={p.id} className="border-t border-[#e8ddd8]">
            <td className="py-3 font-mono">{formatDate(p.purchasedAt)}</td>
            <td className="py-3 font-bold">{p.ingredientName}</td>
            <td className="py-3 font-mono">{p.inputQuantity} {p.inputUnit}{p.packSize ? ` × ${p.packSize}` : ""} → {p.baseQuantity.toLocaleString("id-ID")}</td>
            <td className="py-3">{currency(p.totalPrice)}</td>
            <td className="py-3 font-mono text-[#e73b28]">{currency(p.unitCost)}</td>
            <td className="py-3 text-zinc-500">{p.note ?? "—"}</td>
            <td className="py-3">
              <div className="flex gap-1">
                <button type="button" onClick={() => openEdit(p)} className="p-1 text-[#e73b28]" aria-label="Edit"><Pencil className="size-3.5"/></button>
                <button type="button" onClick={() => void onDelete(p.id)} className="p-1 text-zinc-400 hover:text-[#e73b28]" aria-label="Hapus"><Trash2 className="size-3.5"/></button>
              </div>
            </td>
          </tr>)}</tbody>
        </table>
        {purchases.length === 0 && <p className="py-6 text-center text-xs text-zinc-400">Belum ada pembelian tercatat</p>}
      </div>
    </div>

    {open && <div className="fixed inset-0 z-40 grid place-items-end bg-black/30 sm:place-items-center sm:p-5">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto bg-white sm:border-2 sm:border-[#ef4130]">
        <div className="flex items-center justify-between bg-[#ef4130] p-4 text-white">
          <h2 className="font-black">{editId ? "EDIT PEMBELIAN" : "CATAT STOK MASUK"}</h2>
          <Button sound="overlay.close" variant="ghost" size="icon" onClick={() => setOpen(false)} className="rounded-none text-white hover:bg-white/10"><X/></Button>
        </div>
        <div className="space-y-4 p-5">
          <label className="block font-mono text-[10px] text-zinc-500">TANGGAL BELANJA<input type="date" value={form.purchasedAt} onChange={e => setForm(f => ({ ...f, purchasedAt: e.target.value }))} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm"/></label>
          <label className="block font-mono text-[10px] text-zinc-500">BAHAN<select value={form.ingredientId} disabled={!!editId} onChange={e => onIngredientChange(Number(e.target.value))} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm disabled:bg-zinc-100">{ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block font-mono text-[10px] text-zinc-500">JUMLAH<input type="number" min={0.001} step="any" value={form.inputQuantity || ""} onChange={e => setForm(f => ({ ...f, inputQuantity: Number(e.target.value) }))} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm"/></label>
            <label className="block font-mono text-[10px] text-zinc-500">SATUAN<select value={form.inputUnit} onChange={e => setForm(f => ({ ...f, inputUnit: e.target.value as PurchaseInputUnit }))} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm">{selected && inputUnitsFor(selected.unit).map(u => <option key={u} value={u}>{u}</option>)}</select></label>
          </div>
          {form.inputUnit === "pack" && <label className="block font-mono text-[10px] text-zinc-500">ISI PER PACK (pcs)<input type="number" min={1} value={form.packSize || ""} onChange={e => setForm(f => ({ ...f, packSize: Number(e.target.value) }))} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm"/></label>}
          <label className="block font-mono text-[10px] text-zinc-500">TOTAL HARGA PEMBELIAN (Rp)<input type="number" min={0} value={form.totalPrice || ""} onChange={e => setForm(f => ({ ...f, totalPrice: Number(e.target.value) }))} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm"/></label>
          {preview && selected && <div className="bg-[#fff0ec] p-3 font-mono text-[10px]">
            <p>Masuk stok: <b>{preview.base.toLocaleString("id-ID")} {selected.unit}</b></p>
            <p>Biaya per {selected.unit}: <b className="text-[#e73b28]">{selected.unit === "pcs" ? currency(preview.cost) : `${currency(preview.cost)}/${selected.unit}`}</b></p>
          </div>}
          <label className="block font-mono text-[10px] text-zinc-500">CATATAN<input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm"/></label>
          <Button sound="interaction.confirm" onClick={() => void submit()} disabled={!form.totalPrice || !selected} className="w-full rounded-none">SIMPAN</Button>
        </div>
      </div>
    </div>}

    {inventoryEdit && <div className="fixed inset-0 z-40 grid place-items-end bg-black/30 sm:place-items-center sm:p-5">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto bg-white sm:border-2 sm:border-[#ef4130]">
        <div className="flex items-center justify-between bg-[#ef4130] p-4 text-white">
          <div><h2 className="font-black">{inventoryEdit.id ? "EDIT PERSEDIAAN" : "TAMBAH BAHAN"}</h2><p className="font-mono text-[9px] text-white/75">Satuan dasar: {unitLabel(inventoryEdit.id ? inventoryEdit.unit : inventoryForm.unit)}</p></div>
          <Button sound="overlay.close" variant="ghost" size="icon" onClick={() => setInventoryEdit(null)} className="rounded-none text-white hover:bg-white/10"><X/></Button>
        </div>
        <div className="space-y-4 p-5">
          <p className="border-l-2 border-[#ef4130] bg-[#fff0ec] p-3 text-xs leading-relaxed">Masukkan pembelian terakhir untuk menghitung harga satuan dasar secara otomatis. Harga ini dipakai untuk menghitung COGS menu, sedangkan catatan tersimpan pada bahan.</p>
          <label className="block font-mono text-[10px] text-zinc-500">NAMA BAHAN<input value={inventoryForm.name} onChange={e => setInventoryForm(f => ({ ...f, name: e.target.value }))} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm"/></label>
          {!inventoryEdit.id && <label className="block font-mono text-[10px] text-zinc-500">SATUAN DASAR<select value={inventoryForm.unit} onChange={e => setInventoryForm(f => ({ ...f, unit: e.target.value as IngredientUnit }))} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm"><option value="gram">gram</option><option value="pcs">pcs</option><option value="liter">liter</option></select><span className="mt-1 block font-sans text-[10px] normal-case text-zinc-500">Satuan tidak dapat diubah setelah bahan dibuat karena dipakai oleh resep.</span></label>}
          <label className="block font-mono text-[10px] text-zinc-500">STOK FISIK TERSEDIA ({unitLabel(inventoryEdit.id ? inventoryEdit.unit : inventoryForm.unit)})<input type="number" min={0} step="any" value={inventoryForm.currentStock || ""} onChange={e => setInventoryForm(f => ({ ...f, currentStock: Number(e.target.value) }))} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm"/><span className="mt-1 block font-sans text-[10px] normal-case text-zinc-500">Contoh ayam crispy: masukkan total gram di freezer. Resep memakai 75 gram per porsi.</span></label>
          <div className="border border-[#d8ccc6] p-3"><p className="font-mono text-[10px] text-zinc-500">HARGA BELI TERAKHIR UNTUK HITUNG COGS</p><div className="mt-2 grid grid-cols-2 gap-3"><label className="block font-mono text-[10px] text-zinc-500">JUMLAH BELI<input type="number" min={0.001} step="any" value={inventoryForm.purchaseQuantity || ""} onChange={e => setInventoryForm(f => ({ ...f, purchaseQuantity: Number(e.target.value) }))} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm"/></label><label className="block font-mono text-[10px] text-zinc-500">SATUAN BELI<select value={inventoryForm.purchaseUnit} onChange={e => setInventoryForm(f => ({ ...f, purchaseUnit: e.target.value as PurchaseInputUnit }))} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm">{inventoryInputUnits.map(unit => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}</select></label></div><label className="mt-3 block font-mono text-[10px] text-zinc-500">TOTAL HARGA BELI (Rp)<input type="number" min={0} step="any" value={inventoryForm.purchaseTotalPrice || ""} onChange={e => setInventoryForm(f => ({ ...f, purchaseTotalPrice: Number(e.target.value) }))} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm"/></label><div className="mt-3 bg-[#fff0ec] p-3 text-xs">Harga per {unitLabel(inventoryForm.unit)}: <b className="text-[#e73b28]">{inventoryUnitCost ? `${currency(inventoryUnitCost)}/${inventoryForm.unit}` : "Isi jumlah dan total harga"}</b><p className="mt-1 text-zinc-600">{inventoryBaseQuantity.toLocaleString("id-ID")} {inventoryForm.unit} dari pembelian ini. COGS resep akan dihitung ulang saat disimpan.</p></div></div>
          <label className="block font-mono text-[10px] text-zinc-500">BATAS RESTOCK ({unitLabel(inventoryEdit.id ? inventoryEdit.unit : inventoryForm.unit)})<input type="number" min={0} step="any" value={inventoryForm.minimumStock || ""} onChange={e => setInventoryForm(f => ({ ...f, minimumStock: Number(e.target.value) }))} className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm"/><span className="mt-1 block font-sans text-[10px] normal-case text-zinc-500">Sistem memberi peringatan ketika stok tersedia sama dengan atau di bawah angka ini.</span></label>
          <label className="block font-mono text-[10px] text-zinc-500">CATATAN BAHAN<input value={inventoryForm.note} onChange={e => setInventoryForm(f => ({ ...f, note: e.target.value }))} placeholder="Contoh: beli dari supplier A, potong 75 g per porsi" className="mt-1 w-full border border-[#d8ccc6] p-3 text-sm"/></label>
          <Button sound="interaction.confirm" onClick={() => void submitInventory()} disabled={!inventoryForm.name.trim() || inventoryForm.currentStock < 0 || inventoryForm.minimumStock < 0 || inventoryBaseQuantity <= 0} className="w-full rounded-none">{inventoryEdit.id ? "SIMPAN PERSEDIAAN" : "TAMBAHKAN BAHAN"}</Button>
        </div>
      </div>
    </div>}
  </section>;
}
