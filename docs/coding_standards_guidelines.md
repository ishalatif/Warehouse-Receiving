# Panduan Aturan Pembuatan Kode (Coding Standards & Guidelines)
**Warehouse Receiving System**

Dokumen ini berisi kumpulan aturan wajib bagi *developer* maupun *AI Coding Agent* saat menulis kode pada proyek ini. Prinsip utamanya: **Sederhana, Sangat Aman, dan Performa Optimal.**

---

## 1. Prinsip Utama Kode (*Core Principles*)

1. **Keep It Simple & Clean (KISS):** Tulis kode yang langsung pada intinya. Hindari abstraksi berlebihan (*over-engineering*), buat struktur folder dan fungsi sesederhana mungkin tanpa mengorbankan keterbacaan.
2. **Defensive & Secure by Default:** Asumsikan semua input dari luar (request body, parameter, header) adalah *malicious* (berbahaya). Validasi ketat di lapisan paling awal.
3. **Fail-Fast:** Hentikan eksekusi dan lemparkan *exception/error* secara langsung jika ada kondisi prekondisi yang tidak terpenuhi.
4. **Self-Documenting & Explicit Documentation:** Setiap fungsi/metode wajib memiliki dokumentasi standar (JSDoc/TSDoc/Docstring) yang menjelaskan tujuan, parameter, nilai kembalian, serta exception yang mungkin dilempar.
---

## 2. Aturan Keamanan Optimal (*Maximum Security*)

### 2.1 Otentikasi & Otorisasi
- **Jangan Percaya Frontend:** Semua validasi *Role-Based Access Control* (RBAC) wajib dieksekusi di *middleware* Backend API.
- **Prinsip Hak Akses Terbatas (Least Privilege):** 
  - Role `OPERATOR` hanya boleh melihat katalog, dokumen, stok, dan riwayat transaksi, serta mencatat penerimaan barang.
  - Role `SUPERVISOR` tidak boleh mengeksekusi penerimaan fisik barang untuk mencegah selisih/manipulasi data internal.
- **JWT Handling:** Simpan secret key di *environment variables* (`JWT_SECRET`). Jangan pernah melakukan *hardcode* rahasia/kredensial ke dalam repositori.

### 2.2 Pencegahan Kerentanan Utama (OWASP Top 10)
- **SQL Injection:** **DILARANG HARAM** menggunakan *raw string concatenation* pada query SQL. Gunakan *parameterized queries* atau *ORM Query Builder* (seperti Prisma/TypeORM/Knex).
- **Over-Receiving & Race Conditions:**
  - Setiap kali transaksi penerimaan barang dilakukan, gunakan penguncian baris database **`SELECT ... FOR UPDATE`**.
  - Gunakan `CHECK` constraint di tingkat database sebagai benteng keamanan terakhir:
    ```sql
    CONSTRAINT chk_received_not_exceed_expected CHECK (received_quantity <= expected_quantity)
    ```
- **XSS (Cross-Site Scripting):** Sanitasi seluruh masukan string dari pengguna dan manfaatkan fitur auto-escaping pada framework frontend (seperti React).

---

## 3. Aturan Kode Optimal & Performa (*High Performance*)

### 3.1 Transaksi Database ACID & Atomisitas
- Operasi penerimaan barang (`/api/receiving-documents/:id/receive`) melibatkan banyak entitas (ReceivingItem, Inventory, InventoryTransaction, ReceivingDocument).
- **Semua operasi wajib berada dalam satu `DATABASE TRANSACTION` (`BEGIN ... COMMIT`).**
- Jika terjadi kegagalan sekecil apa pun pada logika bisnis, lakukan **`ROLLBACK`** penuh.

### 3.2 Penanganan Error & Respon API
- Gunakan struktur respon error yang terstandarisasi:
  ```json
  {
    "success": false,
    "code": "OVER_RECEIVING_EXCEEDED",
    "message": "Jumlah barang yang diterima (15) melebihi sisa yang diharapkan (10)."
  }
  ```
- **HTTP Status Codes:**
  - `400 Bad Request` $\rightarrow$ Pelanggaran aturan bisnis (over-receiving, status dokumen invalid).
  - `401 Unauthorized` $\rightarrow$ Tidak ada token JWT atau token kadaluarsa.
  - `403 Forbidden` $\rightarrow$ Akses ditolak karena perbedaan role (RBAC).
  - `404 Not Found` $\rightarrow$ Data ID tidak ditemukan.
  - `500 Internal Server Error` $\rightarrow$ Unexpected error pada server.

### 3.3 Struktur Kode Modular & Sederhana
Strukturkan backend menjadi 3 layer saja untuk menjaga kesederhanaan:
```
/backend/src
├── /controllers   # Menerima HTTP request, memanggil service, mengembalikan HTTP response
├── /services      # Menampung SELURUH logika bisnis, validasi, dan transaksi DB
├── /middlewares   # Otentikasi JWT & Pengecekan Role (RBAC)
└── /utils         # Helper sederhana (response formatter, logger)
```

---

## 4. Checklist Ringkas untuk AI Agent & Developer

Satu baris perintah untuk memeriksa kode sebelum di-*commit*:
- [ ] Apakah query database sudah terproteksi dari SQL Injection?
- [ ] Apakah operasi pembacaan & penulisan stok berada di dalam transaksi database yang terisolasi (`FOR UPDATE`)?
- [ ] Apakah *over-receiving validation* memeriksa kuantitas di backend?
- [ ] Apakah middleware otentikasi JWT dan pengecekan role sudah dipasang pada rute ini?
- [ ] Apakah variabel sensitif dimasukkan melalui `.env`?