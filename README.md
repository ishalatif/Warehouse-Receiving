# Warehouse Receiving System

Aplikasi web untuk mengelola penerimaan barang gudang: katalog produk, dokumen penerimaan, stok, dan riwayat transaksi. Backend menjadi satu-satunya penegak aturan bisnis; frontend hanya menampilkan dan memvalidasi input.

> Versi pertama hanya mendukung penerimaan barang masuk (`RECEIPT_IN`), bukan barang keluar.

## Fitur

- Login JWT dengan role **Supervisor** dan **Operator**.
- Katalog produk dengan SKU unik (tidak membedakan kapitalisasi/spasi).
- Pembuatan, pemantauan, dan pembatalan dokumen penerimaan.
- Penerimaan parsial/penuh dengan proteksi over-receiving.
- Pembaruan item, stok, ledger, dan status dokumen secara **atomik**.
- Halaman stok dan riwayat transaksi.
- Readiness check `/api/health` yang benar-benar memeriksa PostgreSQL.

## Teknologi

| Layer | Teknologi |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 3 |
| Backend | Node.js 22, Express 4, TypeScript |
| Database | PostgreSQL 15 |
| Deployment lokal | Docker Compose |
| Test | Vitest |

## Struktur Repository

```text
backend/
  migrations/            SQL migration
  src/
    config/              env dan connection pool
    controllers/         validasi HTTP dan mapping error
    middlewares/         CORS, JWT, RBAC
    services/            aturan bisnis dan transaksi database
    scripts/             create-user CLI
    __tests__/           unit + integration test
frontend/
  src/app/               halaman App Router
  src/components/        komponen UI
  src/lib/               API client, session, validasi
docs/                    PRD, spesifikasi, API, QA, riwayat, prompting
compose.yaml             PostgreSQL + migrate + backend + frontend
```

## Menjalankan Lokal

Prasyarat: Docker Desktop dengan Docker Compose plugin.

1. Salin `.env.example` menjadi `.env`, lalu isi seluruh placeholder dengan nilai lokal yang kuat. Jangan commit `.env`.
2. Jalankan:

   ```powershell
   docker compose up -d --build --wait
   ```

3. Pastikan container `migrate` selesai dengan `Exited (0)`, lalu cek:

   ```powershell
   curl http://localhost:5000/api/health
   ```

4. Buka UI di `http://localhost:3000`. API tersedia di `http://localhost:5000/api`.

PostgreSQL tidak dipublikasikan ke host. Untuk mengakses database:

```powershell
docker compose exec postgres psql -U <POSTGRES_USER> -d <POSTGRES_DB>
```

`NEXT_PUBLIC_API_URL` ditanam saat build frontend, sehingga perubahan URL API memerlukan rebuild image frontend. `CORS_ORIGIN` harus sama dengan origin browser frontend.

## Membuat Akun

Tidak ada akun, password default, atau seed di repository. Buat akun satu per satu:

```powershell
docker compose exec -it -e NODE_ENV=development backend node dist/scripts/create-user.js
```

Script akan meminta email, role (`OPERATOR`/`SUPERVISOR`), dan password. Password tidak di-echo, minimal 12 karakter, di-hash dengan bcrypt, dan tidak pernah ditulis ke log. Script menolak berjalan pada `NODE_ENV=production` atau tanpa terminal interaktif.

Alternatif di luar Docker (misalnya untuk database test lokal):

```powershell
cd backend
npm run user:create
```

Pastikan `DATABASE_URL` dan `JWT_SECRET` sudah di-set pada environment lokal.

## Pengujian

```powershell
cd backend
npm test
npm run build

cd ../frontend
npm test
npm run build
```

Test integrasi backend memerlukan `TEST_DATABASE_URL` yang menunjuk PostgreSQL **disposable/terpisah**. Tanpa variabel itu, test integrasi di-skip. Jangan menjalankan fixture destruktif pada database berisi data pengguna.

Hasil terakhir (26 Oktober 2026): **93/93** test backend dan **22/22** test frontend lulus pada PostgreSQL disposable. Status per kasus dan gap ada di [rencana QA](./docs/rencana_pengujian_qa.md).

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [PRD](./docs/product_requirements_document.md) | Persyaratan, peran, user stories, acceptance criteria |
| [Spesifikasi teknis](./docs/spesifikasi_teknis.md) | Stack, arsitektur, schema, API, keamanan |
| [OpenAPI](./docs/openapi_specification.md) | Kontrak REST API |
| [ERD](./docs/diagram_erd_mermaid.md) | Entitas dan relasi |
| [Data flow](./docs/data_flow_mermaid.md) | Alur data dan konsistensi transaksi |
| [Riwayat pengembangan](./docs/riwayat_pengembangan.md) | Tahapan, keputusan, hasil verifikasi |
| [Rencana & hasil QA](./docs/rencana_pengujian_qa.md) | Matriks test, bukti, gap |
| [Panduan prompting](./docs/panduan_prompting.md) | Master prompt, template tugas, log sesi AI |
| [Workflow AI](./docs/ai_workflow.md) | Cara kerja agent dan contoh instruksi |
| [Standar kode](./docs/coding_standards_guidelines.md) | Konvensi implementasi |
| [Docker Compose](./docs/konfigurasi_docker_compose.md) | Konfigurasi, secret, dan verifikasi deployment |
| [Jawaban technical test](./docs/jawaban_technical_test.md) | Draf jawaban yang diekspor ke PDF |

## Keamanan

- `.env` tidak boleh di-commit; gunakan `.env.example` sebagai template.
- Tidak ada kredensial default, akun seed, atau password di source code.
- Seluruh query database menggunakan parameter terikat.
- Endpoint terproteksi memakai JWT dan RBAC di backend.
- Pesan error ke klien tidak memuat stack trace atau detail internal.

## Status dan Batasan

- `npm audit --omit=dev` frontend: **0 kerentanan**. Audit penuh masih mencatat 3 moderate pada toolchain build Tailwind 3 (perbaikan memerlukan Tailwind 4 major).
- UI E2E lintas role dengan user persisten belum dijalankan; login, RBAC, dan alur HTTP → database sudah diuji otomatis pada database disposable.
- Belum termasuk: barcode, multi-gudang, batch/lot, kedaluwarsa, supplier, retur, dan koreksi ledger.
- Pagination/filter dan idempotency key belum menjadi bagian kontrak v1.

Rincian bukti dan gap: [rencana_pengujian_qa.md](./docs/rencana_pengujian_qa.md).
