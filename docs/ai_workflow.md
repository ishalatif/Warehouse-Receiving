# Workflow AI Coding Agent

## 1. Tujuan dan Cara Kerja

Dokumentasi ini menetapkan cara menggunakan AI coding agent secara specification-driven untuk Warehouse Receiving System. Agent harus menggunakan [PRD](./product_requirements_document.md), [spesifikasi teknis](./spesifikasi_teknis.md), [OpenAPI](./openapi_specification.md), [ERD](./diagram_erd_mermaid.md), [data flow](./data_flow_mermaid.md), [rencana QA](./rencana_pengujian_qa.md), dan [standar kode](./coding_standards_guidelines.md) sebagai sumber kebenaran.

Untuk master prompt yang siap dipakai, template per jenis tugas, log sesi, dan checklist handoff, lihat [panduan prompting](./panduan_prompting.md).

Contoh prompt berikut adalah instruksi yang dapat dipakai dalam implementasi; prompt ini **bukan bukti** bahwa agent telah menjalankan tugas atau bahwa fitur/test sudah selesai. Catat hasil aktual pada log kerja atau commit yang dapat ditinjau.

## 2. Urutan Kerja yang Disarankan

1. Baca spesifikasi dan identifikasi konflik atau keputusan yang belum dibuat. Jangan menebak aturan bisnis baru; ajukan pertanyaan sebelum perubahan yang mengubah perilaku.
2. Buat perubahan kecil per fitur, pertahankan pemisahan controller/service/middleware.
3. Tulis atau perbarui test yang langsung menguji acceptance criteria dan invariant.
4. Jalankan migration, test terfokus, lint/typecheck yang tersedia; periksa diff untuk secret, query tak terparameterisasi, dan perubahan di luar cakupan.
5. Laporkan file yang berubah, perintah dan hasil aktual, keputusan/asumsi, serta keterbatasan. Jangan mengklaim validasi yang belum dijalankan.
6. Buat commit bermakna sesuai proses Git proyek; jangan memasukkan `.env`, token, password, dump database, atau artefak sensitif.

## 3. Contoh Instruksi Agent

### Prompt 1 — Audit kesiapan sebelum implementasi

> Baca PRD, spesifikasi teknis, ERD, OpenAPI, data flow, QA, dan coding standards di `docs/`. Bandingkan dengan struktur dan source code repository saat ini. Buat daftar gap implementasi yang terurut menurut ketergantungan dan risiko invariant stok. Jangan mengubah file pada langkah ini. Tandai konflik antar dokumen dan ajukan pertanyaan untuk keputusan bisnis yang belum ditentukan; jangan mengarang hasil test atau mengasumsikan fitur tersedia.

### Prompt 2 — Implementasi API dan migrasi produk/dokumen

> Implementasikan endpoint produk dan pembuatan/daftar/detail dokumen sesuai `docs/openapi_specification.md` serta acceptance criteria PRD. Gunakan stack dan layer pada `docs/spesifikasi_teknis.md`; validasi di backend, query terparameterisasi, constraint unik di PostgreSQL, dan transaksi saat membuat dokumen beserta seluruh item. Tambahkan migrasi dan unit/integration tests untuk SKU/nomor dokumen duplikat, payload invalid, role yang tidak diizinkan, serta rollback. Jangan menambahkan endpoint di luar kontrak. Jalankan test terkait dan laporkan perintah serta hasil aktual.

### Prompt 3 — Implementasi penerimaan yang aman terhadap race condition

> Implementasikan `POST /api/receiving-documents/{id}/receive` sesuai workflow teknis dan OpenAPI. Hanya Operator yang boleh memanggilnya. Dalam satu transaksi, lock dokumen dan item dengan urutan konsisten, validasi semua input dan sisa kuantitas sebelum menulis, lalu perbarui receiving item, inventory, ledger, dan status atomik. Over-receiving, item asing/duplikat, dokumen tertutup, atau kegagalan penulisan harus me-rollback semua perubahan. Tambahkan integration tests PostgreSQL untuk penerimaan parsial/penuh, over-receiving multi-item, forced rollback, status invalid, dan dua request paralel. Jangan melonggarkan constraint untuk membuat test lulus.

### Prompt 4 — Verifikasi UI dan deployment

> Implementasikan atau verifikasi UI untuk login, katalog, membuat dokumen, detail/progres, penerimaan, stok, dan ledger sesuai PRD. Pastikan feedback validasi/error jelas dan UI tidak menjadi satu-satunya enforcement. Cocokkan konfigurasi Compose dengan migration runner dan `/api/health`; secret harus berasal dari environment dan tidak boleh ada default kredensial aktif. Jalankan clean start, test yang relevan, dan E2E yang tersedia. Laporkan hal yang gagal atau belum dapat diverifikasi tanpa menyatakan sukses palsu.

## 4. Catatan Pelaksanaan

Untuk setiap sesi implementasi nyata, catat tanggal, agent/model yang digunakan, prompt yang benar-benar dikirim, ringkasan perubahan, test/perintah yang benar-benar dijalankan beserta hasil, dan keputusan yang dibuat. Jangan mengisi catatan ini secara retrospektif dengan hasil yang tidak dapat dibuktikan. Git commit dan output test dapat menjadi bukti yang dapat ditinjau.

