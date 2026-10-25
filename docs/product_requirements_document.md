# Product Requirements Document (PRD)

**Nama proyek:** Warehouse Receiving System  
**Versi:** 1.1.0  
**Tanggal:** Oktober 2026

## 1. Latar Belakang dan Tujuan

### 1.1 Pernyataan masalah

Pencatatan barang masuk menggunakan spreadsheet menimbulkan inkonsistensi stok, risiko penerimaan melebihi pesanan, status dokumen yang tidak akurat, dan kesulitan menelusuri perubahan stok.

### 1.2 Tujuan bisnis

- Mencatat penerimaan barang dan progres dokumen secara konsisten.
- Menolak penerimaan yang melebihi sisa kuantitas yang diharapkan.
- Memperbarui stok dan ledger dalam satu transaksi atomik.
- Menyediakan jejak transaksi dan akses yang dibatasi berdasarkan peran.
- Menghasilkan aplikasi yang dapat dijalankan dan diuji dari dokumentasi spesifikasi.

## 2. Pengguna dan Hak Akses

### 2.1 Peran

- **Supervisor:** mengelola produk, membuat dan membatalkan dokumen penerimaan, serta melihat dokumen, stok, dan transaksi.
- **Operator:** melihat produk, dokumen, stok, dan transaksi; mencatat penerimaan fisik. Operator tidak dapat membuat produk atau dokumen.

### 2.2 Matriks akses

| Operasi | Public | Supervisor | Operator |
|---|:---:|:---:|:---:|
| Login | Ya | Ya | Ya |
| Lihat produk | Tidak | Ya | Ya |
| Buat produk | Tidak | Ya | Tidak |
| Lihat dokumen dan detail | Tidak | Ya | Ya |
| Buat dokumen penerimaan | Tidak | Ya | Tidak |
| Terima barang | Tidak | Tidak | Ya |
| Batalkan dokumen | Tidak | Ya | Tidak |
| Lihat stok dan transaksi | Tidak | Ya | Ya |
| Health/readiness | Ya | Ya | Ya |

Semua kontrol otorisasi wajib ditegakkan oleh backend. Menyembunyikan tombol di UI bukan kontrol keamanan.

## 3. Persyaratan Fungsional

- **FR-01 Produk:** pengguna terautentikasi dapat melihat katalog. Supervisor dapat membuat produk dengan SKU unik; produk baru memiliki stok awal nol.
- **FR-02 Dokumen:** Supervisor dapat membuat dokumen dengan nomor unik dan satu atau lebih baris produk, masing-masing dengan kuantitas harapan positif.
- **FR-03 Detail dan daftar:** pengguna terautentikasi dapat melihat dokumen beserta item dan progres penerimaannya.
- **FR-04 Penerimaan:** Operator dapat menerima sebagian atau seluruh sisa kuantitas untuk satu atau lebih item dalam satu permintaan.
- **FR-05 Validasi:** backend menolak item/produk yang tidak termasuk dalam dokumen, duplikasi produk dalam payload, kuantitas non-integer atau non-positif, dokumen tertutup, dan penerimaan yang melebihi sisa harapan.
- **FR-06 Konsistensi:** perubahan kuantitas diterima, stok, ledger, dan status dokumen dilakukan atomik.
- **FR-07 Stok dan ledger:** pengguna terautentikasi dapat melihat stok per produk dan riwayat transaksi penerimaan.
- **FR-08 Pembatalan:** Supervisor hanya dapat membatalkan dokumen berstatus `DRAFT`.
- **FR-09 Kegagalan:** API mengembalikan error terstruktur dengan kode stabil; kegagalan tidak meninggalkan pembaruan parsial.
- **FR-10 Readiness:** endpoint health/readiness melaporkan kesiapan backend dan konektivitas database tanpa membocorkan rahasia.

## 4. User Stories dan Acceptance Criteria

### US-01 — Membuat produk

Sebagai Supervisor, saya ingin mendaftarkan produk dengan SKU unik agar produk dapat dimasukkan ke dokumen.

- SKU dan nama wajib diisi setelah trim; SKU bersifat unik tanpa membedakan huruf besar/kecil.
- Produk berhasil dibuat dengan stok nol.
- SKU duplikat menghasilkan `409 SKU_ALREADY_EXISTS`, tanpa membuat produk kedua.
- Operator tanpa hak menghasilkan `403 FORBIDDEN`.

### US-02 — Membuat dokumen penerimaan

Sebagai Supervisor, saya ingin mencatat produk dan kuantitas harapan agar Operator dapat menerima barang yang sesuai.

- Nomor dokumen unik; payload berisi minimal satu item.
- Setiap produk harus ada dan hanya boleh muncul sekali per dokumen.
- Semua kuantitas harapan adalah integer positif.
- Dokumen baru berstatus `DRAFT`, kuantitas diterima nol, dan tidak mengubah stok.

### US-03 — Mencatat penerimaan parsial atau penuh

Sebagai Operator, saya ingin mencatat jumlah barang yang tiba agar stok dan progres dokumen terbarui.

- Penerimaan valid menambah kuantitas diterima, stok, dan satu baris ledger per item.
- Penerimaan parsial mengubah `DRAFT` menjadi `IN_PROGRESS`.
- Dokumen menjadi `COMPLETED` hanya setelah semua item terpenuhi.
- Input yang melebihi sisa, memakai produk di luar dokumen, atau mengirim item duplikat ditolak dan tidak mengubah item, stok, ledger, maupun status.
- Dua permintaan bersamaan tidak dapat membuat jumlah diterima melebihi jumlah harapan.
- Supervisor yang mencoba menerima barang mendapat `403 FORBIDDEN`.

### US-04 — Memantau stok dan transaksi

Sebagai pengguna gudang terautentikasi, saya ingin melihat saldo stok dan transaksi masuk untuk menelusuri perubahan.

- Stok mencerminkan jumlah seluruh penerimaan yang berhasil.
- Riwayat memuat produk, dokumen sumber, kuantitas perubahan, jenis transaksi, dan waktu.
- Endpoint menolak pengguna anonim dengan `401 UNAUTHORIZED`.

### US-05 — Membatalkan dokumen

Sebagai Supervisor, saya ingin membatalkan dokumen yang belum diproses.

- Dokumen `DRAFT` dapat dibatalkan.
- Dokumen `IN_PROGRESS`, `COMPLETED`, atau `CANCELLED` tidak dapat dibatalkan.
- Dokumen `CANCELLED` tidak dapat menerima barang.

## 5. Aturan Bisnis

- **BR-01:** `expected_quantity` integer > 0; `quantity_received` integer >= 0.
- **BR-02:** untuk setiap item, `received_quantity + requested_quantity <= expected_quantity`.
- **BR-03:** state awal `DRAFT`; penerimaan pertama yang berhasil menghasilkan `IN_PROGRESS`; semua item penuh menghasilkan `COMPLETED`.
- **BR-04:** Supervisor dapat mengubah `DRAFT` menjadi `CANCELLED` saja.
- **BR-05:** hanya Operator dapat menjalankan operasi penerimaan.
- **BR-06:** penerimaan, stok, ledger, dan status harus konsisten atomik; setiap kegagalan me-rollback seluruh operasi.
- **BR-07:** satu produk hanya boleh muncul sekali di dalam sebuah dokumen dan sekali di dalam satu payload penerimaan.
- **BR-08:** semua ID harus valid; resource yang tidak ditemukan menghasilkan `404 NOT_FOUND`.
- **BR-09:** idempotency key tidak disyaratkan dalam versi pertama; klien harus menghindari retry otomatis pada operasi penerimaan yang hasilnya belum diketahui. (Dapat ditambahkan setelah kebutuhan retry ditentukan.)

## 6. Persyaratan Non-Fungsional

- **Keamanan:** JWT ditandatangani dengan secret dari environment; password disimpan sebagai hash adaptif; query terparameterisasi; validasi backend; rahasia tidak disimpan di Git atau dikembalikan API.
- **Integritas:** PostgreSQL menjadi sumber kebenaran; constraint database melindungi invariant kuantitas; penerimaan menggunakan transaksi dan row lock.
- **Ketersediaan operasional:** layanan menyediakan readiness check dan migrasi database yang dapat diulang secara terkontrol.
- **Keterpeliharaan:** backend menggunakan TypeScript dengan layer controller, service, middleware, dan utilitas sederhana.
- **Usability:** antarmuka mendukung alur utama produk, dokumen, penerimaan, stok, dan riwayat; validasi frontend melengkapi, bukan menggantikan, validasi backend.
- **Reproducibility:** konfigurasi, migrasi, testing, dan petunjuk start harus terdokumentasi untuk lingkungan lokal berbasis Docker.

## 7. Cakupan

### Dalam cakupan

Katalog produk, dokumen penerimaan dan item, penerimaan parsial/penuh, validasi over-receiving, status otomatis, stok, ledger, autentikasi, RBAC, pengujian kritis, dan deployment Docker Compose.

### Di luar cakupan

Barcode/QR, multi-gudang/lokasi rak, lot/batch/kedaluwarsa, pemasok, pengadaan, retur, dan deployment publik.

## 8. Asumsi, Kendala, dan Pertanyaan Terbuka

### Asumsi yang dipakai untuk versi pertama

- Satu instalasi mewakili satu gudang dan satu mata uang tidak relevan karena tidak ada pencatatan harga.
- Kuantitas berupa bilangan bulat; satuan ukur tidak dilacak.
- Email merupakan identitas login; akun dibuat melalui seed/admin, bukan pendaftaran publik.
- SKU dibandingkan tanpa membedakan kapitalisasi dan dinormalisasi dengan trim.
- Pembatalan hanya tersedia sebelum penerimaan pertama.
- Produk yang sudah direferensikan tidak dihapus melalui API.

### Kendala

- PostgreSQL 15; REST API; frontend Next.js/React; backend Node.js, Express, dan TypeScript; seluruh lingkungan lokal dijalankan dengan Docker Compose.
- Fitur tidak boleh mengorbankan invariant stok demi kemudahan UI.
- Secret dan password demo harus berasal dari environment dan tidak boleh dikomit.

### Pertanyaan yang ditunda

- Apakah perlu dukungan kuantitas desimal dan satuan ukur?
- Apakah operator perlu dapat mengoreksi atau membalik penerimaan yang salah? Untuk saat ini transaksi ledger bersifat append-only.
- Apakah retry aman dengan idempotency key diperlukan untuk kondisi jaringan tidak pasti?
- Apakah perlu pagination/filter/sort untuk katalog dan riwayat ketika volume data meningkat?

