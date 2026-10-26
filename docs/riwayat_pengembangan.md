# Riwayat Pengembangan Warehouse Receiving System

Dokumen ini mencatat tahapan implementasi, keputusan teknis, dan hasil verifikasi proyek. Sumber kebenaran lain: [PRD](./product_requirements_document.md), [spesifikasi teknis](./spesifikasi_teknis.md), [OpenAPI](./openapi_specification.md), [ERD](./diagram_erd_mermaid.md), [data flow](./data_flow_mermaid.md), [rencana QA](./rencana_pengujian_qa.md), dan [standar kode](./coding_standards_guidelines.md).

**Status ringkas (26 Oktober 2026):** seluruh tahap 0–11 selesai; backend 93/93 test dan frontend 22/22 test lulus pada environment disposable. Gap yang masih terbuka—UI E2E dengan user persisten, sub-kasus `expected_quantity` 0/negatif, dan rebuild image Docker—dicatat di [rencana QA](./rencana_pengujian_qa.md).

> Status "Selesai" pada tahap awal mengikuti laporan saat tahap tersebut dikerjakan. Hasil verifikasi terbaru ada pada Tahap 10–11 dan `rencana_pengujian_qa.md`.

## Aturan Umum

- Periksa kondisi repository sebelum mengubah file dan jangan menimpa pekerjaan yang sudah ada.
- Gunakan dokumen di folder `docs/` sebagai sumber kebenaran. Jika ada konflik, berhenti dan minta keputusan.
- Implementasikan satu tahap dalam satu waktu. Jangan lanjut ke tahap berikutnya tanpa persetujuan.
- Tambahkan atau perbarui test yang sesuai dengan acceptance criteria.
- Laporkan file yang berubah, perintah yang benar-benar dijalankan, hasilnya, dan keterbatasan.
- Jangan membaca atau mencetak rahasia, menambahkan kredensial default, atau menguji pada database berisi data pengguna.
- Versi pertama memakai kuantitas integer dan tidak mewajibkan idempotency key.

## Tahap 0 — Bootstrap Repository

**Status: Selesai menurut laporan**

Fondasi backend TypeScript dan Express disiapkan, termasuk konfigurasi build dan `.gitignore`.

**Kriteria selesai:**
- Backend dapat dibangun dengan TypeScript.
- File rahasia dan artefak build dikecualikan dari Git.

## Tahap 1 — Fondasi Aplikasi dan Test

**Status: Selesai menurut laporan**

App Express dipisahkan dari proses `listen`, konfigurasi environment divalidasi, endpoint health dibuat, dan runner test disiapkan.

**Kriteria selesai:**
- `GET /api/health` memberikan respons yang sesuai tanpa membocorkan detail internal.
- Environment wajib divalidasi tanpa mencetak nilainya.
- Build dan test yang tersedia lulus.
- Koneksi health check ke PostgreSQL nyata tetap perlu diverifikasi saat database tersedia.

## Tahap 2 — PostgreSQL dan Migration Awal

**Status: Selesai menurut laporan**

Migration awal dibuat untuk tabel dan constraint sesuai spesifikasi. Runner menggunakan advisory lock serta mencatat migration yang berhasil.

**Kriteria selesai:**
- Migration berjalan terhadap PostgreSQL 15 disposable.
- Migration kedua kali dilewati dengan benar.
- Tabel, enum, foreign key, constraint, dan index terverifikasi.
- Build dan test lulus.

Jangan mengedit migration yang sudah diterapkan. Perubahan skema berikutnya harus menggunakan migration baru.

## Tahap 3 — Login, JWT, dan RBAC

**Status: Selesai menurut laporan**

Implementasikan `POST /api/auth/login` serta middleware autentikasi dan pemeriksaan role sesuai OpenAPI dan PRD.

**Cakupan:**
- Validasi login dan pencarian user dengan query terparameterisasi.
- Verifikasi password hash dan penerbitan JWT menggunakan `JWT_SECRET`.
- Respons login tidak mengembalikan password hash.
- Akses dilindungi middleware backend; Operator dan Supervisor mengikuti matriks izin PRD.
- Tidak ada pendaftaran publik atau kredensial default.

**Kriteria selesai:** test login berhasil/gagal, input invalid, token hilang/invalid/kedaluwarsa, serta role yang diizinkan dan ditolak.

**Catatan penyelesaian (sesuai laporan):**
- Token JWT memiliki masa berlaku **1 jam** (ditetapkan karena spesifikasi belum menentukan nilai expires).
- Middleware JWT menolak token dengan klaim `sub`/id, `email`, atau `role` yang hilang/tidak valid; hanya menerima role `OPERATOR` atau `SUPERVISOR`.
- Handler login menangani kegagalan async service secara eksplisit dan mengembalikan `500 INTERNAL_ERROR` standar tanpa membocorkan detail internal.

## Tahap 4 — API Produk

**Status: Selesai menurut laporan**

Implementasikan daftar dan pembuatan produk sesuai OpenAPI.

**Cakupan:**
- Katalog dapat dilihat pengguna terautentikasi.
- Hanya Supervisor yang dapat membuat produk.
- SKU di-trim dan unik tanpa membedakan kapitalisasi.
- Produk baru memiliki saldo inventory nol.

**Kriteria selesai:** test validasi input, SKU duplikat termasuk perbedaan kapitalisasi, RBAC, dan saldo awal.

**Catatan penyelesaian (sesuai laporan):**
- `GET /api/products` memerlukan autentikasi dan dapat diakses kedua role.
- `POST /api/products` dibatasi `SUPERVISOR` melalui middleware `authenticate` + `requireRole`.
- SKU di-trim dan keunikannya ditegakkan case-insensitive oleh unique index database; duplikat menghasilkan `409 SKU_ALREADY_EXISTS`.
- Produk baru dibuat bersama baris `inventory` bersaldo `0` dalam satu transaksi.
- Pagination **tidak** diterapkan pada v1 sesuai kontrak OpenAPI/PRD (keputusan pengguna).

## Tahap 5 — Dokumen Penerimaan

**Status: Selesai menurut laporan**

Implementasikan pembuatan, daftar, detail, dan pembatalan dokumen sesuai kontrak API.

**Cakupan:**
- Hanya Supervisor dapat membuat atau membatalkan dokumen.
- Dokumen baru berstatus `DRAFT`, memiliki minimal satu item, dan tidak mengubah stok.
- Nomor dokumen unik; produk valid dan tidak duplikat dalam dokumen.
- Hanya dokumen `DRAFT` yang dapat dibatalkan.

**Kriteria selesai:** test payload valid/invalid, ID atau produk tidak ditemukan, duplikasi, izin role, serta rollback pembuatan dokumen.

**Catatan penyelesaian (sesuai laporan):**
- Endpoint yang tersedia: `GET /api/receiving-documents`, `POST /api/receiving-documents` (Supervisor), `GET /api/receiving-documents/:id`, `POST /api/receiving-documents/:id/receive` (Operator), dan `POST /api/receiving-documents/:id/cancel` (Supervisor).
- Pembuatan dokumen dan item berjalan dalam satu transaksi; status awal `DRAFT`, kuantitas diterima `0`, dan stok tidak berubah.
- Nomor dokumen unik menghasilkan `409 DOCUMENT_NUMBER_ALREADY_EXISTS`; produk tidak ditemukan `404 NOT_FOUND`; produk duplikat `400 VALIDATION_ERROR`.
- Pembatalan memakai `SELECT ... FOR UPDATE` dan hanya menerima status `DRAFT`; status lain `400 INVALID_DOCUMENT_STATUS`.
- Pagination tidak diterapkan pada v1.

## Tahap 6 — Penerimaan Barang Atomik

**Status: Selesai menurut laporan**

Implementasikan endpoint penerimaan sesuai OpenAPI dan workflow transaksi pada spesifikasi teknis.

**Cakupan:**
- Hanya Operator yang boleh mencatat penerimaan.
- Validasi seluruh payload dan sisa kuantitas sebelum menulis.
- Lock dokumen/item dengan urutan konsisten.
- Perubahan received quantity, inventory, ledger, dan status berada dalam satu transaksi.
- Over-receiving, item asing/duplikat, dokumen tertutup, atau kegagalan penulisan harus me-rollback seluruh perubahan.
- Tidak ada retry otomatis; idempotency key tidak termasuk v1.

**Kriteria selesai:** test PostgreSQL untuk penerimaan parsial/penuh, over-receiving multi-item, rollback, status invalid, dan dua request paralel.

**Catatan penyelesaian (sesuai laporan):**
- `POST /api/receiving-documents/:id/receive` hanya dapat diakses `OPERATOR` melalui `authenticate` + `requireRole`.
- Seluruh langkah berjalan dalam satu transaksi: lock dokumen `FOR UPDATE`, lock item dokumen dengan `ORDER BY id` yang konsisten, validasi seluruh kuantitas sebelum menulis, lalu update received quantity, inventory (upsert), ledger, dan status.
- Status menjadi `IN_PROGRESS` setelah penerimaan parsial dan `COMPLETED` ketika semua item terpenuhi; `DRAFT`/`IN_PROGRESS` saja yang menerima penerimaan.
- Over-receiving (`OVER_RECEIVING_EXCEEDED`), produk asing (`PRODUCT_NOT_IN_DOCUMENT`), produk duplikat, dan status tertutup (`INVALID_DOCUMENT_STATUS`) ditolak tanpa perubahan data.
- Test paralel membuktikan dua request pada dokumen yang sama diserialisasi oleh lock: satu berhasil, satu ditolak, ledger hanya satu entry, dan stok tidak melebihi harapan.
- Tidak ada retry otomatis maupun idempotency key pada v1.

## Tahap 7 — Stok dan Riwayat Transaksi

**Status: Selesai menurut laporan**

Implementasikan endpoint inventory dan ledger sesuai OpenAPI.

**Kriteria selesai:**
- Endpoint memerlukan autentikasi dan mengikuti hak akses PRD.
- Saldo stok konsisten dengan seluruh transaksi penerimaan sukses.
- Riwayat menampilkan produk, dokumen sumber, jumlah perubahan, jenis transaksi, dan waktu.
- Test membandingkan saldo dengan agregat ledger.

**Catatan penyelesaian (sesuai laporan):**
- `GET /api/inventory` dan `GET /api/inventory/transactions` memerlukan autentikasi dan dapat diakses `OPERATOR` maupun `SUPERVISOR` sesuai matriks PRD.
- Saldo stok diambil dari `inventory` yang di-join ke `products`; riwayat diambil dari `inventory_transactions` terurut terbaru (`created_at DESC, id DESC`).
- Test integrasi membandingkan `quantity_on_hand` dengan `SUM(quantity_change)` ledger untuk produk yang sama dan memverifikasi produk, dokumen sumber, jumlah, jenis, serta waktu transaksi.
- Tidak ada pagination/filter pada v1.

## Tahap 8 — Frontend

**Status: Selesai menurut laporan (dengan batasan login end-to-end)**

Bangun antarmuka Next.js/React sesuai PRD untuk login, katalog, dokumen, penerimaan, stok, dan riwayat.

**Kriteria selesai:**
- Alur pengguna utama dapat dijalankan dan memiliki feedback validasi/error yang jelas.
- UI tidak menjadi satu-satunya enforcement autentikasi, RBAC, atau aturan bisnis.
- E2E yang tersedia mencakup alur utama dan role yang berbeda.

**Catatan penyelesaian (sesuai laporan):**
- Frontend `frontend/` memakai Next.js App Router, React, dan Tailwind CSS dengan halaman login, katalog produk, daftar/buat/detail/batal dokumen, penerimaan, stok, dan riwayat.
- Aksi UI mengikuti role (`SUPERVISOR`/`OPERATOR`), tetapi backend tetap menjadi sumber otorisasi; UI tidak menyediakan pendaftaran publik, akun default, atau seed.
- Token disimpan di `localStorage` dan dikirim sebagai Bearer; error API, loading, dan validasi form ditampilkan ke pengguna.
- Unit test frontend mencakup API client, validasi form, dan pemetaan izin role; build produksi berhasil.
- **Batasan:** belum ada mekanisme pembuatan user, sehingga login dengan kredensial nyata dan E2E lintas role belum dapat dijalankan/diverifikasi.

## Tahap 9 — Integrasi Deployment Lokal

**Status: Selesai menurut laporan (clean start terisolasi)**

Cocokkan Docker Compose dan petunjuk lokal dengan implementasi backend, frontend, migration runner, dan readiness check yang sebenarnya.

**Kriteria selesai:**
- Secret disediakan melalui environment dan tidak dikomit.
- Migration dijalankan satu kali sebelum backend menerima traffic.
- Health check benar-benar menguji perilaku readiness yang didokumentasikan.
- Clean start berhasil pada environment lokal yang terisolasi.

**Catatan penyelesaian (sesuai laporan):**
- `backend/Dockerfile` dan `frontend/Dockerfile` multi-stage; runtime backend hanya memakai dependency produksi dan hasil kompilasi, frontend memakai output Next.js `standalone`, keduanya berjalan sebagai user non-root.
- `compose.yaml` menjalankan urutan `postgres` (healthcheck) → `migrate` (one-shot, `service_completed_successfully`) → `backend` (healthcheck `/api/health` yang memeriksa database) → `frontend`.
- PostgreSQL tidak dipublikasikan ke host untuk menghindari konflik port; database diakses melalui network Compose atau `docker compose exec`.
- `NEXT_PUBLIC_API_URL` diberikan sebagai build arg dan di-inline Next.js saat build, bukan dibaca ulang saat runtime; perubahan URL memerlukan rebuild frontend. `CORS_ORIGIN` membatasi satu origin browser dan menangani preflight.
- Migrasi dijalankan dengan `node dist/migrations/run-migrations.js`; `JWT_SECRET` ikut diberikan karena runner memakai validator environment aplikasi.
- Fault injection saat verifikasi menemukan error koneksi idle `pg` yang tidak tertangani dan mematikan backend; ditambahkan handler error pool minimal agar proses tetap hidup dan readiness kembali `200` setelah database pulih.
- Clean start diuji pada project/volume/port terisolasi; migrasi hanya menerapkan `001` sekali, rerun tidak menerapkan ulang, readiness `503` saat database mati dan `200` setelah pulih, serta browser dapat memanggil API lintas origin.
- **Batasan:** login dengan kredensial nyata dan E2E lintas role belum diverifikasi karena belum ada mekanisme pembuatan user/seed. Perintah dan hasil lengkap dicatat di `konfigurasi_docker_compose.md`.

## Tahap 10 — QA Akhir dan Bukti

**Status: Dijalankan dengan gap terbuka (BLOCKED/SKIPPED/FAIL tercatat di `rencana_pengujian_qa.md`)**

Jalankan pengujian akhir sesuai `rencana_pengujian_qa.md`.

**Kriteria selesai:**
- Unit, integration, concurrency, dan E2E yang relevan dijalankan.
- Invariant stok, rollback, RBAC, dan ledger dibuktikan.
- Catat perintah, hasil aktual, tanggal, serta bukti yang tidak memuat rahasia.
- Jangan menandai test atau deployment lulus jika belum benar-benar dijalankan.

**Catatan pelaksanaan (26 Oktober 2026):**
- Backend build lolos; 82/82 test backend lulus dengan PostgreSQL disposable; frontend build lolos dan 22/22 test lulus.
- Clean start Compose, migrasi sekali, readiness `200`/`503`/`200`, dan pemanggilan API dari browser diverifikasi pada project/port terisolasi tanpa membuat atau menghapus volume.
- **Belum lulus/terbuka:** login nyata dan E2E lintas role (`BLOCKED`, tidak ada mekanisme pembuatan user), TC-17 fault injection (`SKIPPED`), serta 2 temuan `npm audit` frontend (`FAIL`, menunggu keputusan upgrade/override).
- Rincian perintah, bukti, dan gap ada di `rencana_pengujian_qa.md`.

## Tahap 11 — Penutupan Gap QA

**Status: Selesai (kecuali yang secara eksplisit masih terbuka)**

**Perubahan:**
- Upgrade frontend `next@15.5.28` → `next@16.4.3` (disetujui pengguna sebagai opsi perbaikan audit). `postcss` internal menjadi `8.5.23`; `npm audit --omit=dev` bersih. `tsconfig.json` disesuaikan otomatis oleh Next 16 (`jsx: react-jsx`, include `.next/dev/types`).
- Menambahkan `backend/src/services/user.service.ts` dan CLI interaktif `npm run user:create` (tanpa seed/akun default; password tidak di-echo, validasi role/email/password, bcrypt cost 12, query terparameterisasi).
- Menambahkan test TC-17 dengan trigger PostgreSQL disposable untuk kegagalan insert ledger dan update status.
- Menambahkan test HTTP → PostgreSQL nyata: login bcrypt, RBAC dengan verifikasi perubahan database, alur produk/dokumen/penerimaan, inventory/ledger, health, dan token tidak valid.
- **Bug produksi ditemukan dan diperbaiki:** `auth.service` mengambil `users.id` (BIGINT) tanpa cast sehingga klaim JWT `sub` berupa string dan ditolak middleware (`401`). Sekarang memakai `id::int`.

**Hasil (26 Oktober 2026):**
- Backend build PASS; **93/93 test** lulus (16 file) pada PostgreSQL disposable `--tmpfs`, termasuk TC-17 dan HTTP → database.
- Frontend build PASS (Next 16.4.3, Turbopack), 22/22 test lulus, `standalone` merespons `200`.
- `npm audit --omit=dev` frontend: 0 kerentanan. Audit penuh masih 3 moderate dev-only pada toolchain Tailwind 3 (perbaikan butuh Tailwind 4 major).
- **Terbuka:** UI E2E lintas role dengan user persisten; sub-kasus `expected_quantity` 0/negatif; rebuild image Docker belum diverifikasi karena registry tidak terjangkau.

## Keputusan yang Perlu Diselaraskan

- Pagination/filter **tidak** termasuk kontrak v1; keputusan pengguna menetapkan tidak ada pagination pada endpoint daftar.
- Readiness `/api/health` terhadap PostgreSQL nyata telah diverifikasi pada clean start terisolasi Tahap 9; mekanisme pembuatan user aman sudah tersedia (`npm run user:create`), tetapi E2E UI dengan user persisten belum dijalankan.
