# Warehouse Receiving System

Aplikasi web untuk mengelola penerimaan barang gudang, dokumen penerimaan,
saldo stok, dan riwayat transaksi.

## Fitur

- Login dengan JWT dan role Supervisor/Operator.
- Katalog produk dan pembuatan dokumen penerimaan.
- Penerimaan barang parsial atau penuh dengan validasi stok.
- Pembatalan dokumen berstatus DRAFT oleh Supervisor.
- Riwayat transaksi stok masuk.

> Versi pertama mendukung penerimaan barang masuk (`RECEIPT_IN`), bukan
> transaksi barang keluar.

## Teknologi

- Next.js, React, Tailwind CSS
- Node.js, Express, TypeScript
- PostgreSQL 15
- Docker Compose

## Menjalankan secara lokal

1. Pastikan Docker Desktop berjalan.
2. Salin `.env.example` menjadi `.env`, lalu ganti semua placeholder dengan
   nilai lokal. Jangan commit atau membagikan `.env`.
3. Jalankan:

   ```powershell
   docker compose up -d --build --wait

## Membuat akun lokal 


1. Tidak ada akun password default. Buat akun satu persatu melalui;

    ```powershell 
docker compose exec -it -e NODE_ENV=devel

## Pengujian 
- cd backend 
- npm  test 
- npm run build 

- cd frontend 
- npm test 
- npm run build 



