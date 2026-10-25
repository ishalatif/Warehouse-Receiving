# Warehouse Receiving System

Aplikasi web manajemen penerimaan barang gudang (*inbound logistics*) dengan pengembangan terpandu spesifikasi dan bantuan AI coding agent.

## Fitur

- Katalog produk dan SKU unik.
- Pembuatan, pemantauan, dan pembatalan dokumen penerimaan.
- Penerimaan parsial/penuh dengan perlindungan over-receiving.
- Pembaruan stok dan ledger transaksi secara atomik.
- JWT dan RBAC Supervisor/Operator.

## Stack

- Frontend: Next.js/React + Tailwind CSS.
- Backend: Node.js + Express + TypeScript.
- Database: PostgreSQL 15.
- Runtime lokal: Docker Compose.

## Prasyarat

- Docker Engine/Desktop dengan Docker Compose plugin.
- Node.js 20+ hanya diperlukan untuk menjalankan test/build di luar Docker.
- Git.

## Menjalankan lokal

1. Clone repository lalu masuk ke direktori proyek.
2. Salin `.env.example` menjadi `.env` pada root, lalu ganti seluruh nilai placeholder dengan secret lokal yang kuat. Jangan commit `.env`. Rincian variabel ada di [konfigurasi Docker Compose](./konfigurasi_docker_compose.md).
3. Jalankan `docker compose up -d --build --wait`.
4. Pastikan layanan `migrate` selesai dengan status `Exited (0)` (migrasi hanya dijalankan sekali) dan periksa readiness di `http://localhost:5000/api/health`.
5. Buka UI di `http://localhost:3000`; API tersedia di `http://localhost:5000/api`.

PostgreSQL tidak dipublikasikan ke host; akses database melalui `docker compose exec postgres psql`. `NEXT_PUBLIC_API_URL` ditanam ke bundle frontend saat build, sehingga perubahan URL API memerlukan rebuild image frontend. `CORS_ORIGIN` harus sama dengan origin browser frontend.

## Akun development

Tidak ada akun, password default, atau seed di repo ini. Login hanya dapat digunakan setelah user dibuat melalui mekanisme terpisah yang menyimpan hash password dan mengambil password dari environment/secret manager. Jangan menggunakan akun development untuk deployment.

## Pengujian

```bash
cd backend && npm test && npm run build
cd frontend && npm test && npm run build
```

Test integrasi backend memerlukan `TEST_DATABASE_URL` yang menunjuk database test terpisah; tanpa variabel tersebut test integrasi dilewati. Jangan menjalankan fixture destruktif pada data lokal/produksi. Matriks kasus dan bukti yang harus dicatat ada di [rencana QA](./rencana_pengujian_qa.md).

## Dokumentasi

- [PRD](./product_requirements_document.md) — persyaratan, peran, stories, acceptance criteria, dan asumsi.
- [Spesifikasi teknis](./spesifikasi_teknis.md) — stack, schema, migrasi, API, keamanan, dan workflow.
- [ERD](./diagram_erd_mermaid.md) — entitas dan relasi.
- [OpenAPI](./openapi_specification.md) — kontrak REST API.
- [Data flow](./data_flow_mermaid.md) — pergerakan data dan konsistensi transaksi.
- [AI workflow](./ai_workflow.md) — panduan agent dan contoh instruksi tugas.
- [Rencana QA](./rencana_pengujian_qa.md) — cakupan pengujian serta pencatatan bukti.
- [Standar kode](./coding_standards_guidelines.md) — aturan implementasi.
- [Konfigurasi Docker Compose](./konfigurasi_docker_compose.md) — konfigurasi lokal dan pengelolaan secret.

## Batasan yang diketahui

Versi pertama tidak mencakup barcode, multi-gudang/lokasi, batch/lot, tanggal kedaluwarsa, supplier, dan koreksi/retur penerimaan. Pertanyaan terbuka tercatat di PRD.

Integrasi Docker lokal telah diuji clean start pada environment terisolasi (lihat [konfigurasi Docker Compose](./konfigurasi_docker_compose.md)). Login dengan kredensial nyata dan E2E lintas role belum diverifikasi karena belum ada mekanisme pembuatan user. `npm audit --omit=dev` pada frontend masih melaporkan kerentanan `postcss` yang dibundel Next.js 15; perbaikannya memerlukan upgrade breaking dan belum dilakukan. Hasil test, status deployment, dan bukti demo harus diisi setelah benar-benar dijalankan; jangan mengklaim lulus tanpa artefak hasil.

