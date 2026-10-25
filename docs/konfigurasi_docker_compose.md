# Konfigurasi Docker Compose

Dokumen ini mencerminkan implementasi aktual `compose.yaml`, `backend/Dockerfile`, dan `frontend/Dockerfile` di root proyek. Nilai rahasia wajib disediakan melalui file `.env` lokal yang tidak dikomit atau secret manager pada deployment. Jangan menyimpan password/JWT secret pada file Compose, Dockerfile, dokumentasi, maupun Git.

## Ringkasan arsitektur

| Layanan | Image/build | Port host | Peran |
|---|---|---|---|
| `postgres` | `postgres:15-alpine` | tidak dipublikasikan | Database; healthcheck `pg_isready` |
| `migrate` | build `./backend` | - | Menjalankan migrasi sekali, lalu keluar |
| `backend` | build `./backend` | `${BACKEND_HOST_PORT:-5000}` → 5000 | API Express |
| `frontend` | build `./frontend` | `${FRONTEND_HOST_PORT:-3000}` → 3000 | Next.js standalone |

Urutan start: `postgres` (healthy) → `migrate` (exit 0) → `backend` (healthy) → `frontend`. Jika migrasi gagal, backend dan frontend tidak dijalankan.

## `compose.yaml`

```yaml
name: ${COMPOSE_PROJECT_NAME:-wrs}

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:?Set POSTGRES_USER in .env}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}
      POSTGRES_DB: ${POSTGRES_DB:?Set POSTGRES_DB in .env}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "pg_isready -U \"$${POSTGRES_USER}\" -d \"$${POSTGRES_DB}\"",
        ]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 5s

  migrate:
    build:
      context: ./backend
    command: ["node", "dist/migrations/run-migrations.js"]
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:?}:${POSTGRES_PASSWORD:?}@postgres:5432/${POSTGRES_DB:?}
      # Runner migrasi memakai config/db yang memvalidasi environment aplikasi.
      JWT_SECRET: ${JWT_SECRET:?Set JWT_SECRET in .env}
    depends_on:
      postgres:
        condition: service_healthy
    restart: "no"

  backend:
    build:
      context: ./backend
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:?}:${POSTGRES_PASSWORD:?}@postgres:5432/${POSTGRES_DB:?}
      JWT_SECRET: ${JWT_SECRET:?Set JWT_SECRET in .env}
      PORT: "5000"
      NODE_ENV: production
      CORS_ORIGIN: ${CORS_ORIGIN:-http://localhost:3000}
    ports:
      - "${BACKEND_HOST_PORT:-5000}:5000"
    depends_on:
      migrate:
        condition: service_completed_successfully
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:5000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))",
        ]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 10s

  frontend:
    build:
      context: ./frontend
      args:
        # Nilai ini di-inline saat build; ubah lalu rebuild jika API URL berubah.
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:5000/api}
    ports:
      - "${FRONTEND_HOST_PORT:-3000}:3000"
    depends_on:
      backend:
        condition: service_healthy
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:3000/login').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))",
        ]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 10s

volumes:
  pgdata:
```

### Catatan perilaku

- **Migrasi:** dijalankan dengan `node dist/migrations/run-migrations.js` dari hasil kompilasi. Runner memakai advisory lock, mencatat versi pada `schema_migrations`, dan keluar `0` tanpa menerapkan ulang migrasi yang sudah ada. `JWT_SECRET` ikut diberikan karena `config/db` memakai validator environment aplikasi, bukan karena migrasi membutuhkan JWT.
- **Readiness backend:** `GET /api/health` menjalankan `SELECT 1` ke PostgreSQL. Saat database tidak tersedia, endpoint mengembalikan `503`; proses backend tetap hidup dan kembali `200` setelah database pulih. Error koneksi idle pool ditangani agar tidak mematikan proses.
- **PostgreSQL tanpa port host:** database hanya dapat diakses melalui network Compose atau `docker compose exec postgres psql`. Ini menghindari konflik dengan PostgreSQL lain di port 5432.
- **CORS:** `CORS_ORIGIN` harus sama persis dengan origin browser frontend (skema + host + port). Middleware hanya mengizinkan origin tersebut dan menangani preflight `OPTIONS`; origin lain tidak menerima header CORS. Ini bukan pengganti otorisasi JWT/RBAC.
- **`NEXT_PUBLIC_API_URL` adalah build-time:** Next.js meng-inline variabel `NEXT_PUBLIC_*` ke bundle browser saat build. Nilai dari build arg ditanam ke image; mengubah env saat container berjalan tidak berpengaruh. Jika URL API berubah, rebuild image frontend (`docker compose build frontend` atau `up --build`). Variabel ini tidak boleh berisi rahasia.
- **Image backend:** multi-stage; dependency produksi saja pada runtime, hasil `tsc` dan folder `migrations` disalin, proses berjalan sebagai user non-root `node`.
- **Image frontend:** multi-stage dengan `output: "standalone"`; hanya output standalone dan aset statis yang disalin ke runtime.

## File `.env` lokal

Buat `.env` pada root proyek dan jangan commit. Contoh berikut hanya nama variabel; ganti seluruh placeholder dengan nilai lokal yang kuat. `DATABASE_URL` tidak perlu diisi karena Compose menyusunnya dari `POSTGRES_*`.

```dotenv
POSTGRES_USER=replace_with_local_user
POSTGRES_PASSWORD=replace_with_local_password
POSTGRES_DB=replace_with_local_database
JWT_SECRET=replace_with_random_secret_at_least_32_bytes
NEXT_PUBLIC_API_URL=http://localhost:5000/api
CORS_ORIGIN=http://localhost:3000

# Opsional: ubah port host bila terjadi konflik.
# PostgreSQL tidak dipublikasikan ke host; akses lewat `docker compose exec postgres psql`.
BACKEND_HOST_PORT=5000
FRONTEND_HOST_PORT=3000
```

`JWT_SECRET` tidak memiliki nilai default; Compose gagal lebih awal jika variabel wajib belum diisi. Tidak ada akun, password, atau seed default di Compose/Dockerfile. Untuk membuat akun, gunakan mekanisme terpisah yang menyimpan hash password dan mengambil password dari environment/secret manager.

## Menjalankan

```bash
docker compose up --build
```

Atau tunggu seluruh healthcheck selesai:

```bash
docker compose up -d --build --wait
```

Periksa status dan readiness:

```bash
docker compose ps
docker compose logs migrate
curl http://localhost:5000/api/health
```

Akses UI di `http://localhost:3000`. `migrate` yang berstatus `Exited (0)` adalah normal; ia memang one-shot.

Mengakses database:

```bash
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Menghentikan layanan tanpa menghapus data:

```bash
docker compose down
```

Perintah tersebut mempertahankan volume `pgdata`. Penghapusan volume bersifat eksplisit dan hanya boleh dilakukan setelah backup/konfirmasi.

## Menjalankan environment terisolasi

Untuk uji clean start tanpa mengganggu stack lain, gunakan nama project dan port host berbeda:

```bash
docker compose -p wrs-verify up -d --build --wait
```

Dengan `.env` sementara yang menetapkan `BACKEND_HOST_PORT`/`FRONTEND_HOST_PORT` bebas konflik dan `NEXT_PUBLIC_API_URL`/`CORS_ORIGIN` sesuai port frontend tersebut. PostgreSQL tidak dipublikasikan sehingga tidak memerlukan port host. Jangan gunakan `down -v` kecuali memang ingin menghapus data.

## Verifikasi yang telah dijalankan (25 Oktober 2026)

Dijalankan pada project terisolasi `wrs-t9-verify-20261025`, port backend `5051`, frontend `3051`, PostgreSQL tanpa port host, dan secret acak sementara:

| Pemeriksaan | Hasil aktual |
|---|---|
| `docker compose config --quiet` | Exit `0` |
| `docker compose build` | Exit `0` (backend, migrate, frontend) |
| `docker compose up -d --wait` | Exit `0`; postgres/backend/frontend healthy, migrate `Exited (0)` |
| Log migrasi + `schema_migrations` | `Applied migration 001` sekali; `count(*) = 1` |
| Menjalankan ulang container migrasi | Exit `0`; tidak ada penerapan baru |
| `GET /api/health` | `200 {"status":"ok","database":"ready"}` |
| PostgreSQL dihentikan sementara | Health `503`; backend tetap berjalan |
| PostgreSQL dinyalakan kembali | Health `200`; backend healthy |
| `GET /login` frontend | `200` |
| Preflight CORS dari `http://localhost:3051` | `204`, `Access-Control-Allow-Origin` sesuai |
| Origin tidak diizinkan | Tidak ada header `Access-Control-Allow-Origin` |
| Browser login dengan kredensial tidak valid | Request ke `http://localhost:5051/api/auth/login`, UI menampilkan `Email atau password salah.` (401), tanpa error CORS |
| `docker compose down` | Exit `0`; container/network uji terhapus, volume uji dipertahankan; container lama tidak tersentuh |

Login dengan kredensial nyata dan E2E lintas role **belum diverifikasi** karena repo belum menyediakan mekanisme pembuatan user/seed yang sah.
