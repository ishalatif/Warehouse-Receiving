# Rencana Pengujian dan Quality Assurance

## 1. Strategi

- **Unit:** validasi payload, kalkulasi sisa, transisi status, dan mapping error.
- **Integration:** API dengan PostgreSQL test; constraint, commit, rollback, dan transaksi diuji pada database nyata.
- **Concurrency:** request penerimaan paralel terhadap dokumen/item yang sama.
- **End-to-end:** UI untuk login, produk, dokumen, penerimaan, stok, dan riwayat.
- Gunakan data fixture deterministik dan database terisolasi. Setiap test memverifikasi keadaan sebelum dan sesudah operasi, bukan hanya status HTTP.

## 2. Kasus Uji Kritis

| ID | Modul | Skenario | Hasil yang diharapkan |
|---|---|---|---|
| TC-01 | Auth | Login dengan kredensial valid | `200`; token dan role benar; password/hash tidak dikembalikan |
| TC-02 | Auth | Password salah atau token hilang/kedaluwarsa | `401`; tidak ada akses ke resource |
| TC-03 | RBAC | Operator membuat produk/dokumen | `403`; database tidak berubah |
| TC-04 | RBAC | Supervisor mencatat penerimaan | `403`; stok dan dokumen tidak berubah |
| TC-05 | Products | SKU valid baru | `201`; produk dibuat dan stok awal nol |
| TC-06 | Products | SKU duplikat (termasuk beda kapital sesuai normalisasi) | `409`; hanya ada satu produk |
| TC-07 | Receiving document | Dokumen dengan item valid | `201`; status `DRAFT`; received nol; stok tidak berubah |
| TC-08 | Receiving document | Kuantitas harapan nol/negatif, produk tidak ada, atau item duplikat | `400`/`404`; tidak ada dokumen parsial |
| TC-09 | Receiving | Penerimaan parsial valid | `200`; received dan stok bertambah tepat; satu ledger per item; status `IN_PROGRESS` |
| TC-10 | Receiving | Penerimaan memenuhi seluruh sisa | `200`; status `COMPLETED`; saldo dan ledger tepat |
| TC-11 | Receiving | Over-receiving satu item dalam payload multi-item | `400`; rollback penuh; received, seluruh saldo, ledger, dan status tidak berubah |
| TC-12 | Receiving | Produk bukan bagian dokumen, ID tidak ada, payload kosong, kuantitas nol/pecahan, atau produk duplikat | Ditolak; tidak ada perubahan database |
| TC-13 | Receiving | Penerimaan untuk `COMPLETED` atau `CANCELLED` | `400`; tidak ada perubahan |
| TC-14 | Cancel | Supervisor membatalkan `DRAFT` | `200`; status `CANCELLED` |
| TC-15 | Cancel | Membatalkan dokumen yang telah diproses/selesai | `400`; status dan stok tidak berubah |
| TC-16 | Concurrency | Dua request paralel masing-masing meminta sisa yang sama | Maksimal jumlah yang tersedia berhasil; total received tidak pernah melampaui expected; stok/ledger hanya mencatat sukses |
| TC-17 | Rollback | Paksa kegagalan penulisan setelah item diperbarui tetapi sebelum commit | Error; item, inventory, ledger, dan status kembali persis ke keadaan awal |
| TC-18 | Inventory | Membandingkan saldo terhadap total ledger penerimaan | Saldo sama dengan jumlah penerimaan sukses untuk produk |
| TC-19 | Health | Database siap dan database tidak tersedia | Siap memberi `200`; database tidak siap memberi `503`, tanpa rahasia |
| TC-20 | API errors | Validasi ID, payload, error internal | Bentuk error stabil; tidak ada stack trace atau data sensitif di respons |

Untuk TC-16 gunakan dua koneksi/request nyata yang dimulai bersamaan dan periksa kondisi akhir di database. Untuk TC-17 gunakan fault injection/test seam yang hanya tersedia di test; jangan menambahkan mode kegagalan ke produksi.

## 3. Kriteria Penerimaan dan Bukti

Fitur penerimaan dianggap lulus hanya jika:

1. Semua TC-09 sampai TC-18 lulus pada PostgreSQL test.
2. TC-11 dan TC-17 membuktikan rollback menyeluruh dengan membandingkan receiving item, inventory, jumlah ledger, dan status sebelum/sesudah.
3. TC-16 membuktikan invariant pada request paralel, bukan hanya pengujian berurutan.
4. Hasil test mencatat perintah, tanggal, versi/commit, ringkasan lulus/gagal, serta log/screenshot yang tidak berisi rahasia.
5. Alur UI utama diuji pada environment bersih sesuai instruksi deployment.

**Status bukti:** QA akhir dijalankan pada 26 Oktober 2026 menggunakan environment disposable. Tidak ada rahasia, token, atau kredensial yang dicatat di dokumen ini.

### 3.1 Perintah dan hasil eksekusi

| Validasi | Perintah / URL | Status | Bukti atau catatan |
|---|---|---|---|
| Build backend | `cd backend && npm run build` | PASS | `tsc` exit `0` |
| Build frontend | `cd frontend && npm run build` | PASS | Next.js **16.4.3** (Turbopack), 9 route, exit `0` |
| Unit & integration backend | `cd backend && npm test` dengan `TEST_DATABASE_URL` | PASS | 16 file, **93/93 test lulus** |
| Unit test frontend | `cd frontend && npm test` | PASS | 3 file, **22/22 test lulus** |
| Readiness (DB siap) | `http://localhost:5053/api/health` | PASS | `200 {"status":"ok","database":"ready"}` |
| Readiness (DB mati) | Hentikan sementara PostgreSQL stack uji | PASS | `503`; proses backend tetap berjalan |
| Readiness (DB pulih) | Nyalakan kembali PostgreSQL | PASS | `200`; backend healthy |
| Clean start Compose | `docker compose ... up -d --build --wait` pada project terisolasi | PASS | exit `0`; postgres/backend/frontend healthy, migrate `Exited (0)` |
| Migrasi sekali | Log migrate + `SELECT count(*) FROM schema_migrations` | PASS | `Applied migration 001`; count `= 1` |
| Migrasi diulang | Jalankan ulang container migrate | PASS | exit `0`; count tetap `1` |
| Browser → API | Buka `/login`, submit kredensial tidak valid | PASS | request ke `http://localhost:5053/api/auth/login`; UI menampilkan “Email atau password salah.” (401); tanpa error CORS |
| Login nyata + HTTP → database | `POST /api/auth/login` dengan user bcrypt nyata pada database disposable, lalu akses route terproteksi | PASS | `200`; token dipakai untuk `POST /api/products`/`POST /api/receiving-documents`/`receive`; seluruh perubahan diverifikasi langsung di PostgreSQL |
| Pembuatan user (CLI) | `npm run user:create` non-TTY | PASS (guard) | Menolak berjalan tanpa TTY, exit `1`, tidak menulis database dan tidak menampilkan password |
| UI end-to-end lintas role | Login Supervisor/Operator dengan user sah di environment persisten | BLOCKED | Belum ada user pada database persisten; user uji hanya dibuat di database disposable. Prosedur aman tersedia di 3.5 |
| Audit dependency frontend | `npm audit --omit=dev` | PASS | **0 kerentanan** setelah upgrade Next.js `16.4.3`; lihat 3.3 |

**Isolasi environment yang dipakai:**

- Integration test: container PostgreSQL disposable `wrs-t10-qa-pg`, hanya `127.0.0.1:55434`, data pada `--tmpfs`, dihapus setelah test; tidak ada volume yang dibuat/dihapus. Migrasi `001` diterapkan sebelum test.
- Penutupan gap: container disposable terpisah (`wrs-t11-gap-pg*`) pada port yang sama dengan `--tmpfs`. Test HTTP menolak berjalan bila `NODE_ENV=production` atau host database bukan loopback; trigger TC-17 hanya aktif pada `document_id` uji dan selalu dilepas di `afterAll`.
- Compose: project `wrs-t10-qa-deploy`, port backend `5053` dan frontend `3053`. Untuk menghindari pembuatan/penghapusan volume, volume `pgdata` di-reset hanya melalui override sementara di luar repo (`volumes: !reset []`) sehingga data berada di layer container disposable; konfigurasi aplikasi lainnya sama dengan `compose.yaml`.
- Container `auth-system-db`, `wrs-postgres-15-migrate`, dan volume pengguna tidak disentuh. Setelah verifikasi, container/network uji dihapus tanpa `-v`.

### 3.2 Status kasus uji kritis

| ID | Status | Bukti / catatan |
|---|---|---|
| TC-01 | PASS | Login nyata lewat `POST /api/auth/login` dengan user bcrypt pada PostgreSQL disposable: `200`, token dan role benar, tidak ada `password_hash`/hash di respons. UI login dengan user persisten tetap belum diuji (lihat 3.4). |
| TC-02 | PASS | Test middleware: token hilang/invalid/kedaluwarsa/sub/role tidak valid → `401`; route terproteksi menolak tanpa token. Ditambah test HTTP nyata: token hilang/rusak → `401` dan jumlah produk tidak berubah. |
| TC-03 | PASS | `POST /api/products` dan `POST /api/receiving-documents` oleh Operator → `403`, diverifikasi lewat HTTP terhadap database nyata: tidak ada baris produk yang dibuat. |
| TC-04 | PASS | `POST /api/receiving-documents/:id/receive` oleh Supervisor → `403`, diverifikasi lewat HTTP: received, stok, dan ledger tidak berubah. |
| TC-05 | PASS | Produk baru dibuat dan baris inventory awal `0`. |
| TC-06 | PASS | SKU duplikat (beda kapital/spasi) ditolak; hanya satu produk. |
| TC-07 | PASS | Dokumen `DRAFT`, received `0`, stok tidak berubah. |
| TC-08 | PASS / SKIPPED | Produk tidak ada dan item duplikat ditolak tanpa dokumen parsial (PASS). Tidak ada test otomatis eksplisit untuk `expected_quantity` nol/negatif; validasinya ada di controller tetapi tidak dieksekusi test (SKIPPED untuk sub-kasus itu). |
| TC-09 | PASS | Penerimaan parsial menambah received/stok tepat, satu ledger per item, status `IN_PROGRESS`. |
| TC-10 | PASS | Pemenuhan seluruh sisa → `COMPLETED`; saldo dan ledger tepat. |
| TC-11 | PASS | Over-receiving multi-item → error; status, received, saldo, dan ledger kembali ke keadaan awal. |
| TC-12 | PASS | Produk asing/duplikat dan payload tidak valid ditolak tanpa perubahan data. |
| TC-13 | PASS | Penerimaan pada dokumen `CANCELLED`/`COMPLETED` ditolak. |
| TC-14 | PASS | Pembatalan `DRAFT` → `CANCELLED`. |
| TC-15 | PASS | Pembatalan dokumen non-`DRAFT` ditolak; status/stok tidak berubah. |
| TC-16 | PASS | Dua request paralel nyata ke PostgreSQL: hanya satu berhasil, total received tidak melampaui expected, ledger/stok konsisten. |
| TC-17 | PASS | Dua trigger PostgreSQL uji pada database disposable: (a) gagal `INSERT inventory_transactions` setelah item/inventory ditulis, (b) gagal `UPDATE receiving_documents.status` setelah ledger ditulis. Keduanya me-rollback item, stok, ledger, dan status; setelah trigger dilepas, penerimaan normal berhasil. |
| TC-18 | PASS | Saldo `inventory` dibandingkan dengan agregat `inventory_transactions`; nilainya sama. |
| TC-19 | PASS | Unit test `200`/`503`; ditambah fault injection nyata pada stack Compose: DB mati → `503`, DB pulih → `200`, backend tidak crash. |
| TC-20 | PASS | Test route memverifikasi status dan kode error (`VALIDATION_ERROR`, `NOT_FOUND`, `INVALID_DOCUMENT_STATUS`, `OVER_RECEIVING_EXCEEDED`, `PRODUCT_NOT_IN_DOCUMENT`, `INTERNAL_ERROR`). Tidak ada assertion eksplisit khusus kebocoran stack trace. |

### 3.3 Temuan `npm audit` frontend (diselesaikan)

Temuan awal pada `next@15.5.28` + `postcss@8.4.31` (1 moderate, 1 high) telah diperbaiki dengan **upgrade Next.js ke `16.4.3`**. Next 16.4.3 memakai `postcss@8.5.23`, di atas batas rentan `<= 8.5.22`.

| Pemeriksaan | Hasil |
|---|---|
| `npm audit --omit=dev` | **0 kerentanan** (sebelumnya 2: 1 moderate, 1 high) |
| `npm audit` penuh (termasuk dev) | 3 moderate pada rantai build Tailwind 3 (`postcss-selector-parser`/`postcss-nested`, GHSA-rj75-hqrm-r3gf); perbaikan menuntut Tailwind 4 (major) dan **tidak** diterapkan |
| Build | PASS, Next.js 16.4.3 (Turbopack), exit `0` |
| Test frontend | PASS, 22/22 |
| Artefak `standalone` | PASS, `node .next/standalone/server.js` → `/login` `200`; `postcss` tidak ikut ke output runtime |

**Kompatibilitas upgrade:** Node `24.18.0` memenuhi `>=20.9`; React/React DOM `19.3.1` memenuhi peer `^18.2 || ^19`. Aplikasi tidak memakai middleware, `next/image`, atau server-side `params`/`cookies`, sehingga permukaan breaking change Next 16 kecil. Next 16 menambahkan `jsx: "react-jsx"` dan `.next/dev/types/**/*.ts` ke `tsconfig.json` secara otomatis saat build.

**Batasan:** build image Docker frontend belum diverifikasi ulang karena registry Docker Hub tidak dapat dijangkau dari environment ini (`TLS handshake timeout`). Perintah yang perlu dijalankan saat jaringan tersedia: `docker build -t <tag> frontend/`. Temuan dev-only Tailwind 4 tetap terbuka dan bukan bagian runtime produksi.

### 3.4 Gap dan batasan yang tersisa

- **BLOCKED — UI end-to-end lintas role:** belum ada user pada database persisten. Login nyata, RBAC, dan alur HTTP → database sudah diverifikasi otomatis dengan user bcrypt pada database disposable, tetapi alur UI Supervisor/Operator belum dijalankan.
- **SKIPPED — TC-08 (sub-kasus):** tidak ada test otomatis eksplisit untuk `expected_quantity` nol/negatif pada pembuatan dokumen.
- **TERBUKA (dev-only) — `npm audit` penuh:** 3 moderate pada toolchain Tailwind 3; perbaikan memerlukan Tailwind 4 (major) dan belum disetujui/diterapkan. `npm audit --omit=dev` bersih.
- **BELUM DIVERIFIKASI — rebuild image Docker:** registry tidak dapat dijangkau pada sesi ini; build lokal dan artefak `standalone` sudah lulus.
- Test integrasi backend memerlukan `TEST_DATABASE_URL`; tanpa variabel itu, seluruh test integrasi/HTTP/fault-injection di-skip (unit test tetap berjalan).

### 3.5 Prosedur aman membuat user awal (lokal)

Tidak ada seed, akun default, atau kredensial yang dikomit. User dibuat manual, satu per satu:

1. Set `DATABASE_URL` dan `JWT_SECRET` pada environment lokal (mekanisme env yang sudah ada; jangan menaruh nilainya di repo).
2. Jalankan `cd backend && npm run user:create`.
3. Masukkan email, pilih `OPERATOR`/`SUPERVISOR`, lalu password saat diminta. Input password tidak di-echo dan tidak pernah lewat argumen CLI/history.
4. Script memvalidasi email/role/password (minimal 12 karakter, maksimal 72 byte), melakukan hash bcrypt cost 12, dan `INSERT` terparameterisasi. Email duplikat ditolak.
5. Script menolak berjalan jika `NODE_ENV=production` atau terminal bukan TTY.

Untuk pengujian otomatis, user fixture hanya dibuat di database disposable dan dihapus di `afterAll`. Password uji dibuat acak per run dan tidak dicatat.


## 4. Batasan dan Pengembangan Lanjutan

- Tidak melacak barcode, lokasi, batch/lot, kedaluwarsa, supplier, retur, atau koreksi ledger.
- Pagination/filter dan idempotency key belum menjadi bagian dari kontrak versi pertama.
- Beban produksi, pemulihan backup, rotasi secret, dan deployment publik perlu diuji/dirancang terpisah.

