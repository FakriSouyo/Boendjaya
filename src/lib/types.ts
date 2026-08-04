export type IngredientUnit = "gram" | "pcs" | "liter";
export type PurchaseInputUnit = "gram" | "kg" | "pcs" | "pack" | "liter";

export type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  cogs: number;
  emoji: string;
};

export type Ingredient = {
  id: number;
  name: string;
  unit: IngredientUnit;
  currentStock: number;
  minimumStock: number;
  averageCost: number;
  note: string | null;
};

export type RecipeLine = {
  productId: number;
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  unit: IngredientUnit;
  lineCost: number;
};

export type DailyExpense = {
  id: number;
  date: string;
  amount: number;
  category: string | null;
  note: string | null;
  createdAt: string;
};

export type DailyIncomeRow = {
  date: string;
  revenue: number;
};

export type StockPurchase = {
  id: number;
  ingredientId: number;
  ingredientName: string;
  purchasedAt: string;
  inputQuantity: number;
  inputUnit: PurchaseInputUnit;
  packSize: number | null;
  totalPrice: number;
  baseQuantity: number;
  unitCost: number;
  note: string | null;
};

export type NotificationItem = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
};

export type TransactionItem = {
  name: string;
  quantity: number;
  unitPrice: number;
};

export type Transaction = {
  id: number;
  orderNumber: string;
  total: number;
  paymentMethod: "cash" | "qris";
  paidAt: string;
  itemCount: number;
  items: TransactionItem[];
};

export type ProductSale = {
  name: string;
  quantity: number;
  revenue: number;
};

export type ProductSaleEntry = {
  dateLabel: string;
  name: string;
  quantity: number;
  revenue: number;
};

export type FinancialRow = {
  label: string;
  orderCount: number;
  revenue: number;
  totalCogs: number;
  grossProfit: number;
  marginPct: number;
};

export type PurchaseForm = {
  ingredientId: number;
  purchasedAt: string;
  inputQuantity: number;
  inputUnit: PurchaseInputUnit;
  packSize: number;
  totalPrice: number;
  note: string;
};

export type OutletSettings = {
  dailyRevenueTarget: number;
  goalNotifiedDate: string | null;
};

export type ProductForm = {
  id: number | null;
  name: string;
  category: string;
  price: number;
  emoji: string;
  active: boolean;
};

export type RecipeDraft = {
  ingredientId: number;
  quantity: number;
};

export const PRODUCT_CATEGORIES = ["Chicken", "Beef", "Drink", "Fries", "Add-on"] as const;
