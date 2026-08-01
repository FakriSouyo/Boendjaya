# Menjalankan Boendjaya

## 1. Supabase

1. Hubungkan MCP Supabase dan autentikasi di terminal Codex:
   ```powershell
   codex mcp add supabase --url "https://mcp.supabase.com/mcp?project_ref=otqafqhhgergsblxszux&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching"
   codex mcp login supabase
   ```
2. Jalankan `supabase/migrations/001_boendjaya.sql` melalui Supabase SQL Editor atau MCP setelah autentikasi selesai.
3. Salin `.env.local.example` menjadi `.env.local`, lalu isi `NEXT_PUBLIC_SUPABASE_ANON_KEY` menggunakan publishable/anon key proyek Anda. Jangan memasukkan service-role key ke browser.

## 2. Aplikasi

```powershell
npm install
npm run dev
```

Buka `http://localhost:3000`. Tanpa environment variable Supabase, aplikasi menampilkan data demo; setelah variabel tersedia, katalog dan COGS dibaca dari database. Pembayaran POS menulis order, order items, payment, mutasi stok, dan notifikasi stok menipis lewat fungsi `complete_order`.
