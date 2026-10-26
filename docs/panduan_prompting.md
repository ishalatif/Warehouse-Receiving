# Panduan Prompting dan Handoff AI

Dokumen ini menjelaskan cara memakai AI coding agent pada proyek Warehouse Receiving System secara konsisten, dapat diaudit, dan tidak menghasilkan klaim palsu. Dokumen ini melengkapi [workflow AI](./ai_workflow.md) dan [standar kode](./coding_standards_guidelines.md).

## 1. Prinsip

1. **Specification-driven.** PRD, spesifikasi teknis, OpenAPI, ERD, data flow, dan rencana QA adalah sumber kebenaran. Agent tidak boleh mengarang aturan bisnis baru.
2. **Bukti, bukan klaim.** Setiap pernyataan "lulus" harus disertai perintah dan output yang benar-benar dijalankan. Jika tidak dijalankan, tulis `BELUM DIVERIFIKASI`.
3. **Perubahan kecil.** Satu tugas = satu tujuan. Jangan mencampur refactor, fitur, dan upgrade dependency tanpa persetujuan.
4. **Aman secara default.** Jangan membaca/mencetak `.env`, token, atau password. Jangan membuat akun default/seed. Test yang mengubah data hanya boleh berjalan pada PostgreSQL disposable.
5. **Jangan menimpa pekerjaan yang ada.** Periksa repository dan `git status` sebelum mengubah file.

## 2. Konteks yang Wajib Dibaca

| Kebutuhan | Dokumen |
|---|---|
| Tujuan produk, peran, acceptance criteria | [PRD](./product_requirements_document.md) |
| Stack, arsitektur, schema, API, keamanan | [Spesifikasi teknis](./spesifikasi_teknis.md) |
| Kontrak endpoint | [OpenAPI](./openapi_specification.md) |
| Relasi data | [ERD](./diagram_erd_mermaid.md) |
| Alur transaksi dan konsistensi | [Data flow](./data_flow_mermaid.md) |
| Status tahap dan keputusan | [Riwayat pengembangan](./riwayat_pengembangan.md) |
| Status test dan gap | [Rencana QA](./rencana_pengujian_qa.md) |
| Gaya kode dan struktur layer | [Standar kode](./coding_standards_guidelines.md) |
| Deployment lokal | [Konfigurasi Docker Compose](./konfigurasi_docker_compose.md) |

## 3. Master Context Prompt

Gunakan prompt ini di awal sesi baru (misalnya setelah context window penuh atau pindah agent):

```text
Kamu bekerja pada proyek Warehouse Receiving System di repository ini.

Tugas: <tujuan sesi dalam satu kalimat>.

Baca dulu, tanpa mengubah file:
- README.md
- docs/product_requirements_document.md
- docs/spesifikasi_teknis.md
- docs/openapi_specification.md
- docs/rencana_pengujian_qa.md
- docs/riwayat_pengembangan.md
- docs/coding_standards_guidelines.md

Aturan wajib:
- Jangan membaca atau mencetak .env, token, password, atau secret.
- Jangan membuat akun default, seed, atau kredensial yang dikomit.
- Jangan mengubah dependency, schema, atau perilaku bisnis tanpa persetujuan eksplisit.
- Test yang menulis data hanya boleh memakai PostgreSQL disposable yang dipastikan terisolasi.
- Jangan menghapus/mengubah container, volume, atau database milik pengguna.
- Jangan mengklaim test/E2E lulus tanpa benar-benar menjalankannya.

Langkah kerja:
1. Ringkas kondisi repository dan gap yang relevan dengan tugas.
2. Ajukan pertanyaan jika ada konflik spesifikasi atau keputusan bisnis yang belum jelas.
3. Implementasikan perubahan sekecil mungkin, konsisten dengan layer controller/service/middleware.
4. Tambahkan/perbarui test yang menguji acceptance criteria dan invariant.
5. Jalankan build dan test yang relevan.
6. Laporkan: file berubah, perintah + hasil aktual, keputusan, dan gap yang tersisa.

Mulai dengan langkah 1 saja dan tunggu persetujuan sebelum mengubah file.
```

## 4. Template Prompt per Jenis Tugas

### 4.1 Audit read-only

```text
Audit repository terhadap <dokumen/fitur>. Jangan ubah file apa pun.
Buat tabel: requirement, status (PASS/FAIL/GAP), bukti (file/test), dan risiko.
Pisahkan fakta dari asumsi. Akhiri dengan daftar keputusan yang perlu diambil pengguna.
```

### 4.2 Implementasi fitur

```text
Implementasikan <endpoint/fitur> sesuai docs/openapi_specification.md dan acceptance criteria PRD.
Batasan: <daftar batasan>. Validasi di backend, query terparameterisasi, dan jaga invariant <...>.
Tambahkan unit/integration test untuk happy path, input invalid, RBAC, dan rollback.
Jangan menambah endpoint/field di luar kontrak.
Jalankan test terkait dan laporkan output aktual.
```

### 4.3 Perbaikan bug

```text
Bug: <gejala, langkah reproduksi, hasil yang diharapkan>.
1. Reproduksi dengan test yang gagal terlebih dahulu.
2. Jelaskan akar masalah berdasarkan kode/database, bukan dugaan.
3. Perbaiki minimal dan pastikan test baru lulus.
4. Jalankan seluruh test terkait untuk memastikan tidak ada regresi.
Jangan menutupi bug dengan melonggarkan assertion/constraint.
```

### 4.4 QA dan bukti

```text
Jalankan QA sesuai docs/rencana_pengujian_qa.md.
Integration test hanya boleh memakai PostgreSQL disposable; konfirmasi isolasi sebelum menulis data.
Jangan menyentuh container/volume/database pengguna.
Catat perintah, tanggal, hasil, dan bukti tanpa secret.
Pisahkan PASS/FAIL/SKIPPED/BLOCKED; jangan menyamarkan yang tidak dijalankan.
```

### 4.5 Dokumentasi

```text
Perbarui dokumentasi <file> agar sesuai kondisi repository saat ini.
Jangan mengklaim hasil yang tidak tercatat di bukti. Pertahankan bahasa dan gaya dokumen yang ada.
Tautkan dokumen terkait dan hindari duplikasi sumber kebenaran.
```

## 5. Log Prompt Proyek

Tabel ini mencatat sesi nyata pada pengerjaan proyek. Ringkasan prompt boleh dipadatkan, tetapi hasil dan bukti harus sesuai yang dijalankan.

| Tanggal | Tujuan | Ringkasan prompt | Hasil | Bukti |
|---|---|---|---|---|
| 25–26 Okt 2026 | Implementasi bertahap | Implementasikan tahap 0–9 sesuai PRD/spesifikasi/OpenAPI; test dan deployment lokal | Selesai; backend, frontend, migrasi, dan Compose berjalan | `docs/riwayat_pengembangan.md` |
| 26 Okt 2026 | QA akhir | Jalankan build + seluruh test; integration hanya PostgreSQL disposable; jangan klaim E2E tanpa user sah | 82/82 backend, 22/22 frontend; login nyata `BLOCKED` saat itu | `docs/rencana_pengujian_qa.md` §3.1 |
| 26 Okt 2026 | Audit dependency | Cari versi aman Next/PostCSS; jangan upgrade major tanpa persetujuan | Opsi A/B/C dilaporkan | `docs/rencana_pengujian_qa.md` §3.3 |
| 26 Okt 2026 | Penutupan gap | Upgrade Next 16 + user CLI + TC-17 + HTTP→DB test | 93/93 backend, 22/22 frontend, audit produksi 0; bug JWT `sub` ditemukan & diperbaiki | `docs/rencana_pengujian_qa.md` §3.2–3.4 |

## 6. Checklist Handoff

Sebelum menyerahkan sesi ke agent/pengembang lain:

- [ ] `git status` bersih atau perubahan dijelaskan.
- [ ] `.env` tidak ikut ter-commit.
- [ ] Build backend/frontend lulus dan output dicatat.
- [ ] Test dijalankan pada database disposable; jumlah lulus/gagal dicatat.
- [ ] Gap (`BLOCKED`/`SKIPPED`/`FAIL`) ditulis apa adanya.
- [ ] Dokumen status (`riwayat_pengembangan.md`, `rencana_pengujian_qa.md`) diperbarui.
- [ ] Tidak ada token/password di dokumen, log, atau screenshot.

## 7. Anti-pola

- Menyalin output test dari sesi lama tanpa menjalankannya lagi.
- Menulis "semua test lulus" padahal integration test di-skip karena `TEST_DATABASE_URL` tidak ada.
- Menguji pada database berisi data pengguna atau container bersama.
- Membuat akun dengan password yang dikomit agar E2E "bisa jalan".
- Menghapus volume/container untuk "membersihkan" environment.
- Menambah override dependency tanpa persetujuan dan tanpa regression test.
