# Spesifikasi Teknis (Technical Specification)

## 1. Stack dan Arsitektur

Stack versi pertama ditetapkan agar implementasi tidak perlu memilih di antara alternatif:

- **Frontend:** Next.js/React + Tailwind CSS.
- **Backend:** Node.js + Express + TypeScript, REST API.
- **Database:** PostgreSQL 15.
- **Runtime lokal:** Docker Compose.

Frontend berkomunikasi dengan backend melalui JSON/HTTP. Backend memvalidasi input, autentikasi, dan RBAC, lalu memanggil service yang menjalankan query terparameterisasi. PostgreSQL menyimpan data relasional, constraint, transaksi, dan ledger. UI bukan sumber kebenaran untuk hak akses maupun aturan bisnis.

Struktur backend yang disarankan: `controllers` (HTTP), `services` (logika bisnis/transaksi), `middlewares` (auth/RBAC/validasi), `utils` (format respons/logger), dan modul akses database. Hindari menaruh aturan domain di frontend atau controller.

## 2. Model Data dan Constraint

Tabel inti: `users`, `products`, `receiving_documents`, `receiving_items`, `inventory`, `inventory_transactions`, dan `schema_migrations`.

- Email, SKU ternormalisasi, dan nomor dokumen unik.
- `receiving_items`: `expected_quantity > 0`, `received_quantity >= 0`, serta `received_quantity <= expected_quantity`; unik per `(document_id, product_id)`.
- `inventory`: satu baris per produk; `quantity_on_hand >= 0`. Baris inventaris dibuat dengan saldo nol saat produk dibuat.
- `inventory_transactions`: ledger append-only untuk setiap penerimaan berhasil; kuantitas perubahan positif; memiliki referensi produk dan dokumen.
- Produk yang telah direferensikan tidak dapat dihapus melalui API.

### 2.1 DDL acuan

```sql
CREATE TYPE user_role AS ENUM ('OPERATOR', 'SUPERVISOR');
CREATE TYPE doc_status AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE transaction_type AS ENUM ('RECEIPT_IN');

CREATE TABLE schema_migrations (
    version VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'OPERATOR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uq_products_sku_normalized
    ON products (lower(btrim(sku)));

CREATE TABLE receiving_documents (
    id BIGSERIAL PRIMARY KEY,
    document_number VARCHAR(100) NOT NULL UNIQUE,
    status doc_status NOT NULL DEFAULT 'DRAFT',
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE receiving_items (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES receiving_documents(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id),
    expected_quantity INTEGER NOT NULL CHECK (expected_quantity > 0),
    received_quantity INTEGER NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
    CONSTRAINT chk_received_not_exceed_expected
        CHECK (received_quantity <= expected_quantity),
    CONSTRAINT uq_receiving_document_product UNIQUE (document_id, product_id)
);

CREATE TABLE inventory (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL UNIQUE REFERENCES products(id),
    quantity_on_hand BIGINT NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory_transactions (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id),
    document_id BIGINT NOT NULL REFERENCES receiving_documents(id),
    quantity_change INTEGER NOT NULL CHECK (quantity_change > 0),
    type transaction_type NOT NULL DEFAULT 'RECEIPT_IN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_receiving_documents_status_created
    ON receiving_documents (status, created_at DESC);
CREATE INDEX idx_receiving_items_document
    ON receiving_items (document_id);
CREATE INDEX idx_inventory_transactions_created
    ON inventory_transactions (created_at DESC);
CREATE INDEX idx_inventory_transactions_product_created
    ON inventory_transactions (product_id, created_at DESC);
CREATE INDEX idx_inventory_transactions_document
    ON inventory_transactions (document_id);
```

Unique constraint pada email, SKU, nomor dokumen, dan `(document_id, product_id)` sudah membuat indeks; jangan membuat indeks duplikat. Indeks tambahan untuk pencarian SKU case-insensitive harus mengikuti strategi normalisasi aplikasi/database yang dipilih.

## 3. Migrasi dan Seed

- Simpan migrasi bernomor dan berurutan, misalnya `001_initial_schema.sql`; jangan mengubah migrasi yang telah diterapkan.
- Migration runner membaca tabel `schema_migrations`, menerapkan migrasi baru secara berurutan, dan mencatat keberhasilan di dalam transaksi apabila seluruh pernyataan migrasi mendukung transaksi.
- Kegagalan migrasi menghentikan proses startup/deployment dengan status gagal; jangan melanjutkan aplikasi dengan skema parsial.
- Jalankan migrasi satu kali sebelum backend menerima traffic (one-shot service atau langkah deployment eksplisit), bukan secara bersamaan oleh banyak replika.
- Seed akun/produk hanya untuk development/test; password disediakan lewat environment dan di-hash. Jangan menyertakan password default produksi.
- Buat backup sebelum migrasi yang berisiko; strategi rollback migrasi harus berupa migrasi kompensasi, bukan mengedit riwayat yang telah diterapkan.

## 4. Kontrak API

Kontrak rinci, skema, contoh respons, dan error tersedia pada [OpenAPI](./openapi_specification.md). Ringkasan:

| Method | Endpoint | Akses |
|---|---|---|
| `GET` | `/api/health` | Public |
| `POST` | `/api/auth/login` | Public |
| `GET`, `POST` | `/api/products` | Authenticated; POST Supervisor |
| `GET`, `POST` | `/api/receiving-documents` | Authenticated; POST Supervisor |
| `GET` | `/api/receiving-documents/{id}` | Authenticated |
| `POST` | `/api/receiving-documents/{id}/receive` | Operator |
| `POST` | `/api/receiving-documents/{id}/cancel` | Supervisor |
| `GET` | `/api/inventory` | Authenticated |
| `GET` | `/api/inventory/transactions` | Authenticated |

Semua endpoint menerima/mengembalikan JSON kecuali health check. Semua kesalahan mengikuti `{ "success": false, "code": "...", "message": "..." }`.

## 5. Alur Data dan Status

Diagram alur data tersedia pada [data flow Mermaid](./data_flow_mermaid.md).

Transisi yang diizinkan:

```text
DRAFT -> IN_PROGRESS -> COMPLETED
  |             |
  +-> CANCELLED  +-> (tidak ada transisi manual pada versi pertama)
```

`DRAFT` menjadi `IN_PROGRESS` ketika penerimaan pertama berhasil. Status menjadi `COMPLETED` hanya jika semua baris item telah mencapai kuantitas harapan. `CANCELLED` hanya dapat dicapai dari `DRAFT`. Dokumen `COMPLETED` dan `CANCELLED` menolak penerimaan.

## 6. Workflow Penerimaan dan Concurrency

Untuk `POST /api/receiving-documents/{id}/receive`:

1. Autentikasi JWT dan pastikan role `OPERATOR`.
2. Validasi bentuk payload: daftar tidak kosong, ID valid, kuantitas integer positif, tanpa item duplikat.
3. Mulai transaksi database; ambil dokumen dengan `SELECT ... FOR UPDATE`; pastikan status masih `DRAFT` atau `IN_PROGRESS`.
4. Ambil semua receiving item target dalam urutan ID yang konsisten dengan `FOR UPDATE`; pastikan semuanya bagian dari dokumen.
5. Validasi semua kuantitas terhadap sisa yang tersedia sebelum melakukan penulisan apa pun.
6. Untuk setiap item: tambah `received_quantity`, tambah/upsert inventory, dan sisipkan satu ledger entry.
7. Hitung ulang kelengkapan seluruh item; atur status `IN_PROGRESS` atau `COMPLETED`.
8. Commit; bentuk respons hanya setelah commit berhasil. Error apa pun me-rollback semua perubahan.

Lock dokumen menserialisasi penerimaan bersamaan untuk dokumen yang sama. Constraint database tetap menjadi pertahanan terakhir. Hindari lock item dalam urutan berbeda agar mengurangi deadlock.

## 7. Error dan Status HTTP

| Status | Pemakaian |
|---|---|
| `400` | Payload tidak valid atau aturan bisnis/status dokumen dilanggar |
| `401` | Token hilang, tidak valid, atau kedaluwarsa |
| `403` | Role tidak berwenang |
| `404` | Resource tidak ditemukan |
| `409` | Konflik unique key, seperti SKU atau nomor dokumen duplikat |
| `500` | Error tak terduga; detail internal tidak dikirim ke klien |

Kode error minimal: `VALIDATION_ERROR`, `OVER_RECEIVING_EXCEEDED`, `INVALID_DOCUMENT_STATUS`, `PRODUCT_NOT_IN_DOCUMENT`, `SKU_ALREADY_EXISTS`, `DOCUMENT_NUMBER_ALREADY_EXISTS`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, dan `INTERNAL_ERROR`.

## 8. Strategi Pengujian

Uji unit untuk validasi/status dan uji integrasi terhadap PostgreSQL nyata untuk transaksi, rollback, constraint, dan concurrency. E2E menguji alur UI/API utama. Matriks dan kriteria bukti terdapat pada [rencana QA](./rencana_pengujian_qa.md).

## 9. Konfigurasi, Keamanan, dan Operasional

- `DATABASE_URL`, `JWT_SECRET`, kredensial database, dan konfigurasi port berasal dari environment; secret produksi harus acak, kuat, dan tidak masuk Git.
- Backend tidak boleh membocorkan stack trace, token, hash password, atau konfigurasi rahasia.
- Password disimpan menggunakan algoritma hashing adaptif (misalnya Argon2id atau bcrypt dengan parameter terpelihara); jangan pernah menyimpan plaintext.
- Endpoint `/api/health` memeriksa proses; readiness juga memverifikasi koneksi database dan status migrasi.
- Compose dan instruksi start ada di [konfigurasi Docker Compose](./konfigurasi_docker_compose.md) dan [panduan proyek](./panduan_proyek_readme.md).
