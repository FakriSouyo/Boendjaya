export const currency = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

export const formatMonth = (value: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(value));

export const unitLabel = (unit: string) => ({ gram: "gram", pcs: "pcs", liter: "liter", kg: "kg", pack: "pack" }[unit] ?? unit);

export const makeOrderNumber = () => `BJ-${Date.now().toString().slice(-7)}`;

export const marginPct = (price: number, cogs: number) => (price > 0 ? Math.round((1 - cogs / price) * 100) : 0);
