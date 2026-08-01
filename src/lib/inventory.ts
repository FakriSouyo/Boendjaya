import type { Ingredient, IngredientUnit, NotificationItem, Product, PurchaseInputUnit, RecipeLine, StockPurchase } from "./types";

export function toBaseQuantity(
  inputQty: number,
  inputUnit: PurchaseInputUnit,
  packSize: number | null,
  ingredientUnit: IngredientUnit,
): number {
  if (inputUnit === "pack") {
    if (ingredientUnit !== "pcs" || !packSize) throw new Error("Pack hanya untuk bahan ber-unit pcs");
    return inputQty * packSize;
  }
  if (inputUnit === "kg") {
    if (ingredientUnit !== "gram") throw new Error("Kg hanya untuk bahan ber-unit gram");
    return inputQty * 1000;
  }
  if (inputUnit === "gram" && ingredientUnit !== "gram") throw new Error("Gram hanya untuk bahan ber-unit gram");
  if (inputUnit === "liter" && ingredientUnit !== "liter") throw new Error("Liter hanya untuk bahan ber-unit liter");
  if (inputUnit === "pcs" && ingredientUnit !== "pcs") throw new Error("Pcs hanya untuk bahan ber-unit pcs");
  return inputQty;
}

export function purchaseUnitCost(totalPrice: number, baseQty: number) {
  return baseQty > 0 ? totalPrice / baseQty : 0;
}

export function weightedAverageCost(
  currentStock: number,
  currentAvg: number,
  addedQty: number,
  purchaseUnitCost: number,
) {
  const total = currentStock + addedQty;
  if (total <= 0) return purchaseUnitCost;
  return (currentStock * currentAvg + addedQty * purchaseUnitCost) / total;
}

export function computeProductCogs(
  productId: number,
  recipes: { productId: number; ingredientId: number; quantity: number }[],
  ingredients: Ingredient[],
) {
  const byId = new Map(ingredients.map(i => [i.id, i]));
  return recipes
    .filter(r => r.productId === productId)
    .reduce((sum, r) => sum + r.quantity * (byId.get(r.ingredientId)?.averageCost ?? 0), 0);
}

export function recipesForProduct(productId: number, recipes: RecipeLine[]) {
  return recipes.filter(r => r.productId === productId);
}

export function applyPurchase(
  ingredients: Ingredient[],
  purchases: StockPurchase[],
  form: {
    ingredientId: number;
    purchasedAt: string;
    inputQuantity: number;
    inputUnit: PurchaseInputUnit;
    packSize: number;
    totalPrice: number;
    note: string;
  },
  editId?: number,
): { ingredients: Ingredient[]; purchases: StockPurchase[]; purchase: StockPurchase } {
  const ing = ingredients.find(i => i.id === form.ingredientId);
  if (!ing) throw new Error("Bahan tidak ditemukan");

  const old = editId ? purchases.find(p => p.id === editId) : null;
  let stock = ing.currentStock - (old?.baseQuantity ?? 0);

  const baseQty = toBaseQuantity(form.inputQuantity, form.inputUnit, form.packSize || null, ing.unit);
  const unitCost = purchaseUnitCost(form.totalPrice, baseQty);
  stock += baseQty;

  const purchaseId = editId ?? Math.max(0, ...purchases.map(p => p.id)) + 1;
  const purchase: StockPurchase = {
    id: purchaseId,
    ingredientId: ing.id,
    ingredientName: ing.name,
    purchasedAt: form.purchasedAt,
    inputQuantity: form.inputQuantity,
    inputUnit: form.inputUnit,
    packSize: form.inputUnit === "pack" ? form.packSize : null,
    totalPrice: form.totalPrice,
    baseQuantity: baseQty,
    unitCost,
    note: form.note || null,
  };

  const nextPurchases = editId
    ? purchases.map(p => p.id === editId ? purchase : p)
    : [purchase, ...purchases];

  const ingPurchases = nextPurchases.filter(p => p.ingredientId === ing.id);
  const totalBase = ingPurchases.reduce((s, p) => s + p.baseQuantity, 0);
  const newAvg = totalBase > 0
    ? ingPurchases.reduce((s, p) => s + p.baseQuantity * p.unitCost, 0) / totalBase
    : unitCost;

  return {
    ingredients: ingredients.map(i =>
      i.id === ing.id ? { ...i, currentStock: stock, averageCost: newAvg } : i,
    ),
    purchases: nextPurchases,
    purchase,
  };
}

export function deletePurchase(
  ingredients: Ingredient[],
  purchases: StockPurchase[],
  purchaseId: number,
): { ingredients: Ingredient[]; purchases: StockPurchase[] } {
  const old = purchases.find(p => p.id === purchaseId);
  if (!old) throw new Error("Pembelian tidak ditemukan");
  const ing = ingredients.find(i => i.id === old.ingredientId)!;
  const remaining = purchases.filter(p => p.id !== purchaseId);
  const ingPurchases = remaining.filter(p => p.ingredientId === ing.id);
  const totalBase = ingPurchases.reduce((s, p) => s + p.baseQuantity, 0);
  const newAvg = totalBase > 0
    ? ingPurchases.reduce((s, p) => s + p.baseQuantity * p.unitCost, 0) / totalBase
    : 0;
  return {
    ingredients: ingredients.map(i =>
      i.id === ing.id ? { ...i, currentStock: Math.max(0, i.currentStock - old.baseQuantity), averageCost: newAvg } : i,
    ),
    purchases: remaining,
  };
}

export function refreshProductCogs(products: Product[], recipes: RecipeLine[]): Product[] {
  const cogsByProduct = new Map<number, number>();
  for (const r of recipes) {
    cogsByProduct.set(r.productId, (cogsByProduct.get(r.productId) ?? 0) + r.lineCost);
  }
  return products.map(p => ({ ...p, cogs: Math.round(cogsByProduct.get(p.id) ?? p.cogs) }));
}

export function buildRecipeLines(
  recipes: { productId: number; ingredientId: number; quantity: number }[],
  ingredients: Ingredient[],
): RecipeLine[] {
  const byId = new Map(ingredients.map(i => [i.id, i]));
  return recipes.map(r => {
    const ing = byId.get(r.ingredientId)!;
    return {
      productId: r.productId,
      ingredientId: r.ingredientId,
      ingredientName: ing.name,
      quantity: r.quantity,
      unit: ing.unit,
      lineCost: r.quantity * ing.averageCost,
    };
  });
}

export function demoNotifications(ingredients: Ingredient[]): NotificationItem[] {
  const low = ingredients.filter(i => i.currentStock <= i.minimumStock);
  return low.map((i, idx) => ({
    id: idx + 1,
    type: "low_stock",
    title: `Stok menipis: ${i.name}`,
    body: `${i.currentStock} ${i.unit} tersisa (minimum ${i.minimumStock})`,
    isRead: false,
    createdAt: new Date().toISOString(),
  }));
}
