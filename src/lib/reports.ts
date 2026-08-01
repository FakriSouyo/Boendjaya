import type { FinancialRow } from "./types";
import { currency, formatDate, formatMonth } from "./format";

export function exportFinancialCsv(rows: FinancialRow[], period: "daily" | "monthly", filename: string) {
  const header = period === "daily"
    ? "Tanggal,Transaksi,Penjualan,COGS,Profit,Margin %"
    : "Bulan,Transaksi,Penjualan,COGS,Profit,Margin %";
  const lines = rows.map(r =>
    [
      period === "daily" ? r.label : r.label.slice(0, 7),
      r.orderCount,
      r.revenue,
      r.totalCogs,
      r.grossProfit,
      r.marginPct,
    ].join(","),
  );
  downloadBlob([header, ...lines].join("\n"), filename, "text/csv;charset=utf-8;");
}

export async function exportFinancialPdf(
  rows: FinancialRow[],
  period: "daily" | "monthly",
  title: string,
  filename: string,
) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: rows.length > 8 ? "landscape" : "portrait" });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.text(`Boendjaya F&B · ${period === "daily" ? "Laporan Harian" : "Laporan Bulanan"} · ${new Date().toLocaleDateString("id-ID")}`, 14, 22);

  autoTable(doc, {
    startY: 28,
    head: [[
      period === "daily" ? "Tanggal" : "Bulan",
      "Transaksi",
      "Penjualan",
      "COGS",
      "Profit",
      "Margin",
    ]],
    body: rows.map(r => [
      period === "daily" ? formatDate(r.label) : formatMonth(r.label),
      String(r.orderCount),
      currency(r.revenue),
      currency(r.totalCogs),
      currency(r.grossProfit),
      `${r.marginPct}%`,
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [231, 59, 40] },
  });

  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCogs = rows.reduce((s, r) => s + r.totalCogs, 0);
  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  doc.text(`Total penjualan: ${currency(totalRev)}`, 14, y);
  doc.text(`Total COGS: ${currency(totalCogs)}`, 14, y + 5);
  doc.text(`Total profit: ${currency(totalRev - totalCogs)}`, 14, y + 10);

  doc.save(filename);
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob(["\uFEFF", content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
