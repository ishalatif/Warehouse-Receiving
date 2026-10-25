# Warehouse Receiving System — Frontend

UI Next.js (App Router) + React + Tailwind CSS untuk alur penerimaan barang.

## Prasyarat

- Node.js 20+
- Backend berjalan dan dapat diakses (default `http://localhost:5000/api`)
- Akun valid yang sudah dibuat di database backend

## Menjalankan

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

Basis URL API diatur lewat environment:

```bash
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

Contoh tersedia di `.env.example`. Jangan menyimpan rahasia di variabel `NEXT_PUBLIC_*`
karena nilainya terekspos ke browser.

## Perintah

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Build produksi |
| `npm run start` | Menjalankan hasil build |
| `npm test` | Unit test (Vitest) |

## Halaman

- `/login` — login JWT
- `/products` — katalog produk; form tambah produk untuk Supervisor
- `/documents` — daftar dokumen; tombol buat untuk Supervisor
- `/documents/new` — pembuatan dokumen (Supervisor)
- `/documents/[id]` — detail, penerimaan (Operator), pembatalan (Supervisor)
- `/inventory` — saldo stok
- `/history` — riwayat transaksi/ledger

## Otorisasi

UI menyembunyikan aksi berdasarkan role, tetapi **backend tetap sumber otorisasi**.
Semua request terautentikasi mengirim header `Authorization: Bearer <token>`.
Token disimpan di `localStorage` dan tidak dicatat ke console.

## Akun dan login

Frontend **tidak** menyediakan pendaftaran publik, akun default, atau seed. Login
nyata hanya dapat diuji setelah ada user valid di database backend. Belum ada
mekanisme pembuatan user di repo ini, sehingga alur login end-to-end belum
diverifikasi dengan kredensial nyata.


Operator: operator@wrs.local — pilih role OPERATOR
Supervisor: supervisor@wrs.local — pilih role SUPERVISOR