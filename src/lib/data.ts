import { buildRecipeLines, refreshProductCogs } from "./inventory";
import type { Ingredient, NotificationItem, OutletSettings, Product, RecipeDraft, RecipeLine, StockPurchase, Transaction } from "./types";
import { supabase } from "./supabase/client";

const GOAL_KEY = "boendjaya-daily-goal";
const GOAL_NOTIFIED_KEY = "boendjaya-goal-notified";
const DEMO_TODAY_REV_KEY = "boendjaya-demo-today-revenue";

export function loadDemoSettings(): OutletSettings {
  if (typeof window === "undefined") return { dailyRevenueTarget: 3000000, goalNotifiedDate: null };
  const raw = localStorage.getItem(GOAL_KEY);
  return {
    dailyRevenueTarget: raw ? Number(raw) : 3000000,
    goalNotifiedDate: localStorage.getItem(GOAL_NOTIFIED_KEY),
  };
}

export function saveDemoSettings(target: number) {
  localStorage.setItem(GOAL_KEY, String(target));
}

export function getDemoTodayRevenue(): number {
  if (typeof window === "undefined") return 0;
  const day = new Date().toISOString().slice(0, 10);
  const raw = localStorage.getItem(DEMO_TODAY_REV_KEY);
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as { day: string; amount: number };
    return parsed.day === day ? parsed.amount : 0;
  } catch { return 0; }
}

export function addDemoTodayRevenue(amount: number): number {
  const day = new Date().toISOString().slice(0, 10);
  const next = getDemoTodayRevenue() + amount;
  localStorage.setItem(DEMO_TODAY_REV_KEY, JSON.stringify({ day, amount: next }));
  return next;
}

export async function loadSettings(): Promise<OutletSettings> {
  if (!supabase) return loadDemoSettings();
  const { data, error } = await supabase.from("outlet_settings").select("daily_revenue_target, goal_notified_date").eq("id", 1).maybeSingle();
  if (error || !data) return { dailyRevenueTarget: 3000000, goalNotifiedDate: null };
  return {
    dailyRevenueTarget: Number(data.daily_revenue_target),
    goalNotifiedDate: data.goal_notified_date,
  };
}

export async function saveSettings(target: number) {
  if (!supabase) {
    saveDemoSettings(target);
    return;
  }
  await supabase.from("outlet_settings").update({ daily_revenue_target: target, updated_at: new Date().toISOString() }).eq("id", 1);
}

export async function loadTodayRevenue(): Promise<number> {
  if (!supabase) return getDemoTodayRevenue();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase.from("daily_financials").select("revenue").eq("report_date", today).maybeSingle();
  return data ? Number(data.revenue) : 0;
}

export async function updateStockPurchase(purchaseId: number, form: {
  purchasedAt: string;
  inputQuantity: number;
  inputUnit: string;
  packSize: number | null;
  totalPrice: number;
  note: string;
}) {
  if (!supabase) return;
  const { error } = await supabase.rpc("update_stock_purchase", {
    p_purchase_id: purchaseId,
    p_purchased_at: form.purchasedAt,
    p_input_quantity: form.inputQuantity,
    p_input_unit: form.inputUnit,
    p_pack_size: form.packSize,
    p_total_price: form.totalPrice,
    p_note: form.note || null,
  });
  if (error) throw new Error(error.message);
}

export async function removeStockPurchase(purchaseId: number) {
  if (!supabase) return;
  const { error } = await supabase.rpc("delete_stock_purchase", { p_purchase_id: purchaseId });
  if (error) throw new Error(error.message);
}

export async function updateInventoryItem(itemId: number, form: {
  name: string;
  currentStock: number;
  minimumStock: number;
  averageCost: number;
  note: string;
}) {
  if (!supabase) return;
  const { error } = await supabase.rpc("update_inventory_item", {
    p_ingredient_id: itemId,
    p_name: form.name,
    p_current_stock: form.currentStock,
    p_minimum_stock: form.minimumStock,
    p_average_cost: form.averageCost,
    p_note: form.note || null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteInventoryItem(itemId: number) {
  if (!supabase) return;
  const { error } = await supabase.rpc("delete_inventory_item", { p_ingredient_id: itemId });
  if (error) throw new Error(error.message);
}

export async function deleteProduct(productId: number) {
  if (!supabase) return;
  const { error } = await supabase.rpc("delete_product", { p_product_id: productId });
  if (error) throw new Error(error.message);
}

export async function deleteTransaction(orderId: number) {
  if (!supabase) return;
  const { error } = await supabase.rpc("delete_order", { p_order_id: orderId });
  if (error) throw new Error(error.message);
}

export async function createInventoryItem(form: {
  name: string;
  unit: Ingredient["unit"];
  currentStock: number;
  minimumStock: number;
  averageCost: number;
  note: string;
}) {
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("create_inventory_item", {
    p_name: form.name,
    p_unit: form.unit,
    p_current_stock: form.currentStock,
    p_minimum_stock: form.minimumStock,
    p_average_cost: form.averageCost,
    p_note: form.note || null,
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

export async function saveProductWithRecipes(
  productId: number | null,
  name: string,
  category: string,
  price: number,
  emoji: string,
  active: boolean,
  recipes: RecipeDraft[],
): Promise<number> {
  if (!supabase) return productId ?? 0;
  const { data, error } = await supabase.rpc("save_product_recipes", {
    p_product_id: productId ?? 0,
    p_name: name,
    p_category_name: category,
    p_selling_price: price,
    p_emoji: emoji,
    p_active: active,
    p_recipes: recipes.map(r => ({ ingredient_id: r.ingredientId, quantity: r.quantity })),
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

export function checkDemoSalesGoal(
  todayRevenue: number,
  target: number,
  notifications: NotificationItem[],
): NotificationItem | null {
  if (target <= 0 || todayRevenue < target) return null;
  const today = new Date().toISOString().slice(0, 10);
  const notified = localStorage.getItem(GOAL_NOTIFIED_KEY);
  if (notified === today) return null;
  if (notifications.some(n => n.type === "sales_goal" && !n.isRead && n.createdAt.startsWith(today))) return null;
  localStorage.setItem(GOAL_NOTIFIED_KEY, today);
  return {
    id: Date.now(),
    type: "sales_goal",
    title: "Target penjualan tercapai!",
    body: `Penjualan hari ini ${todayRevenue.toLocaleString("id-ID")} · target ${target.toLocaleString("id-ID")}`,
    isRead: false,
    createdAt: new Date().toISOString(),
  };
}

export async function loadProducts(): Promise<Product[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("products")
    .select("id,name,selling_price,cogs,emoji,categories(name)")
    .eq("active", true)
    .order("id");
  if (error || !data?.length) return [];
  return data.map(item => {
    const joined = item.categories as { name: string } | { name: string }[] | null;
    const category = Array.isArray(joined) ? joined[0]?.name : joined?.name;
    return {
      id: item.id,
      name: item.name,
      category: category ?? "Other",
      price: Number(item.selling_price),
      cogs: Number(item.cogs),
      emoji: item.emoji,
    };
  });
}

export async function loadIngredients(): Promise<Ingredient[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("ingredients").select("*").order("name");
  if (error || !data?.length) return [];
  return data.map(i => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    currentStock: Number(i.current_stock),
    minimumStock: Number(i.minimum_stock),
    averageCost: Number(i.average_cost),
    note: i.note,
  }));
}

export async function loadPurchases(): Promise<StockPurchase[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("stock_purchases")
    .select("*, ingredients(name)")
    .order("purchased_at", { ascending: false })
    .limit(50);
  if (error || !data?.length) return [];
  return data.map(p => {
    const ing = p.ingredients as { name: string } | { name: string }[] | null;
    const name = Array.isArray(ing) ? ing[0]?.name : ing?.name;
    return {
      id: p.id,
      ingredientId: p.ingredient_id,
      ingredientName: name ?? "—",
      purchasedAt: p.purchased_at,
      inputQuantity: Number(p.input_quantity),
      inputUnit: p.input_unit,
      packSize: p.pack_size != null ? Number(p.pack_size) : null,
      totalPrice: Number(p.total_price),
      baseQuantity: Number(p.base_quantity),
      unitCost: Number(p.unit_cost),
      note: p.note,
    };
  });
}

export async function loadTransactions(): Promise<Transaction[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("orders")
    .select("id,order_number,total,payments(method,paid_at),order_items(quantity)")
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  return data.map(order => {
    const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    return { id: order.id, orderNumber: order.order_number, total: Number(order.total), paymentMethod: payment?.method === "qris" ? "qris" : "cash", paidAt: payment?.paid_at ?? "", itemCount: items.reduce((sum, item) => sum + Number(item.quantity), 0) };
  });
}

export async function loadRecipes(ingredients: Ingredient[]): Promise<RecipeLine[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("recipes").select("product_id, ingredient_id, quantity");
  if (error || !data?.length) return [];
  return buildRecipeLines(
    data.map(r => ({ productId: r.product_id, ingredientId: r.ingredient_id, quantity: Number(r.quantity) })),
    ingredients,
  );
}

export async function loadNotifications(): Promise<NotificationItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error || !data?.length) return [];
  return data.map(n => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    isRead: n.is_read,
    createdAt: n.created_at,
  }));
}

export async function markNotificationRead(id: number) {
  if (!supabase) return;
  await supabase.from("notifications").update({ is_read: true }).eq("id", id);
}

export async function markAllNotificationsRead(ids: number[]) {
  if (!supabase || !ids.length) return;
  await supabase.from("notifications").update({ is_read: true }).in("id", ids);
}

export function mergeCatalogWithRecipes(products: Product[], recipes: RecipeLine[]): Product[] {
  return refreshProductCogs(products, recipes);
}
